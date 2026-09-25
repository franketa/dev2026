// Cierre mensual ("corte").
//
// Al cerrar un período (mes calendario):
//   1. Cada vuelo abierto con fecha hasta el último día del mes pasa al libro como cargo
//      y queda cerrado (ya no se puede editar). Los vuelos cargados tarde de meses ya
//      cerrados entran acá también, con su fecha real.
//   2. Se genera un cupón por socio con: saldo del cierre anterior + movimientos del
//      período (vuelos, pagos, ajustes) = total a pagar.
//   3. El cierre queda sellado con el rango de movimientos que abarca, así cualquier
//      cupón se puede reconstruir y verificar después.

const crypto = require('crypto');
const { db, getConfig, auditar } = require('../db');
const ledger = require('./ledger');
const {
  ErrorNegocio, hoy, horaAR, periodoActual, sumarMeses, ultimoDia, sumarDias, esPeriodo, nombrePeriodo, fmtHoras, fmtFechaCorta, fmtPesos
} = require('../util');

const DIAS_MINIMOS_PAGO = 7;

class Simulacion extends Error { constructor(resultado) { super('simulación'); this.resultado = resultado; } }

function ultimoCierre() {
  return db.prepare('SELECT * FROM cierres ORDER BY periodo DESC LIMIT 1').get() || null;
}

// Períodos terminados que todavía no se cerraron, del más viejo al más nuevo.
function periodosPendientes() {
  const inicio = getConfig().periodo_inicio || periodoActual();
  const ultimo = ultimoCierre();
  let p = ultimo ? sumarMeses(ultimo.periodo, 1) : inicio;
  if (p < inicio) p = inicio;
  const out = [];
  while (p < periodoActual()) { out.push(p); p = sumarMeses(p, 1); }
  return out;
}

function validarPeriodo(periodo) {
  if (!esPeriodo(periodo)) throw new ErrorNegocio('Período inválido');
  if (db.prepare('SELECT 1 FROM cierres WHERE periodo = ?').get(periodo)) throw new ErrorNegocio(`${nombrePeriodo(periodo)} ya está cerrado`, 409);
  if (periodo >= periodoActual()) throw new ErrorNegocio(`${nombrePeriodo(periodo)} todavía no terminó`);
  const pendientes = periodosPendientes();
  if (!pendientes.includes(periodo)) throw new ErrorNegocio(`${nombrePeriodo(periodo)} es anterior al inicio del sistema`);
  if (pendientes[0] !== periodo) throw new ErrorNegocio(`Primero hay que cerrar ${nombrePeriodo(pendientes[0])}`);
}

function conceptoVuelo(v) {
  const tipo = v.tipo === 'instruccion' ? `con instructor ${v.instructor}` : 'sin instructor';
  return `Vuelo del ${fmtFechaCorta(v.fecha)} en ${v.matricula}: ${fmtHoras(v.decimas)} ${tipo}`;
}

function vencimientoDe(periodo, dia) {
  const sig = sumarMeses(periodo, 1);
  const tope = Number(ultimoDia(sig).slice(8));
  const d = Math.min(Math.max(1, Number(dia) || 10), tope);
  return `${sig}-${String(d).padStart(2, '0')}`;
}

// Totales de un socio dentro de un rango de movimientos (desde, hasta].
// Las anulaciones se clasifican según lo que anulan (anular un pago cuenta como pago).
function totalesRango(usuarioId, desde, hasta) {
  return db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN COALESCE(o.tipo, m.tipo) = 'vuelo' THEN m.importe END), 0) vuelos,
      COALESCE(SUM(CASE WHEN COALESCE(o.tipo, m.tipo) = 'pago' THEN m.importe END), 0) pagos,
      COALESCE(SUM(CASE WHEN COALESCE(o.tipo, m.tipo) NOT IN ('vuelo','pago') THEN m.importe END), 0) ajustes,
      COUNT(*) n
    FROM movimientos m LEFT JOIN movimientos o ON o.id = m.anula_id
    WHERE m.usuario_id = ? AND m.id > ? AND m.id <= ?`).get(usuarioId, desde, hasta);
}

const correrCierre = db.transaction((periodo, actor, simular) => {
  validarPeriodo(periodo);
  const cfg = getConfig();
  const previo = ultimoCierre();
  const desde = previo?.hasta_movimiento_id ?? 0;

  const rc = db.prepare('INSERT INTO cierres (periodo, desde_movimiento_id, automatico, cerrado_por) VALUES (?, ?, ?, ?)')
    .run(periodo, desde, actor ? 0 : 1, actor?.id ?? null);
  const cierreId = Number(rc.lastInsertRowid);

  // 1. Vuelos → libro
  const vuelos = db.prepare(`
    SELECT v.*, a.matricula, i.nombre || ' ' || i.apellido instructor
    FROM vuelos v JOIN aviones a ON a.id = v.avion_id LEFT JOIN usuarios i ON i.id = v.instructor_id
    WHERE v.estado = 'abierto' AND v.fecha <= ? ORDER BY v.fecha, v.avion_id, v.id`).all(ultimoDia(periodo));
  const cerrarVuelo = db.prepare(`UPDATE vuelos SET estado = 'cerrado', cierre_id = ?, actualizado_en = datetime('now') WHERE id = ?`);
  const hist = db.prepare(`INSERT INTO vuelos_historial (vuelo_id, accion, despues, usuario_id) VALUES (?, 'cierre', ?, ?)`);
  const decimasPorSocio = new Map();
  let totalDecimas = 0;
  let totalVuelos = 0;
  for (const v of vuelos) {
    ledger.registrar({
      usuario_id: v.piloto_id, tipo: 'vuelo', concepto: conceptoVuelo(v), importe: v.importe,
      fecha: v.fecha, vuelo_id: v.id, cierre_id: cierreId, creado_por: actor?.id ?? null
    });
    cerrarVuelo.run(cierreId, v.id);
    hist.run(v.id, JSON.stringify({ cierre: periodo }), actor?.id ?? null);
    decimasPorSocio.set(v.piloto_id, (decimasPorSocio.get(v.piloto_id) || 0) + v.decimas);
    totalDecimas += v.decimas;
    totalVuelos += v.importe;
  }

  const hasta = db.prepare('SELECT COALESCE(MAX(id), 0) id FROM movimientos').get().id;
  const sello = ledger.ultimoHash();

  // 2. Cupones: socios con saldo distinto de cero o con movimientos en el período.
  const socios = db.prepare(`
    SELECT m.usuario_id, SUM(m.importe) saldo, SUM(CASE WHEN m.id > ? THEN 1 ELSE 0 END) nuevos
    FROM movimientos m JOIN usuarios u ON u.id = m.usuario_id
    WHERE m.id <= ? GROUP BY m.usuario_id
    HAVING saldo <> 0 OR nuevos > 0
    ORDER BY MIN(u.apellido), MIN(u.nombre)`).all(desde, hasta);

  const insCupon = db.prepare(`
    INSERT INTO cupones (cierre_id, usuario_id, numero, saldo_anterior, total_vuelos, total_pagos, total_ajustes, total, decimas, vencimiento, token, sello)
    VALUES (@cierre_id, @usuario_id, @numero, @saldo_anterior, @total_vuelos, @total_pagos, @total_ajustes, @total, @decimas, @vencimiento, @token, @sello)`);
  // Aunque el cierre se haga tarde, el socio siempre tiene al menos una semana para pagar.
  const vencimiento = [vencimientoDe(periodo, cfg.vencimiento_dia), sumarDias(hoy(), DIAS_MINIMOS_PAGO)].sort().at(-1);
  let nro = 0;
  let totalCupones = 0;
  for (const s of socios) {
    const saldoAnterior = ledger.saldo(s.usuario_id, desde);
    const t = totalesRango(s.usuario_id, desde, hasta);
    const total = saldoAnterior + t.vuelos + t.pagos + t.ajustes;
    nro++;
    insCupon.run({
      cierre_id: cierreId, usuario_id: s.usuario_id, numero: `${periodo.replace('-', '')}-${String(nro).padStart(3, '0')}`,
      saldo_anterior: saldoAnterior, total_vuelos: t.vuelos, total_pagos: t.pagos, total_ajustes: t.ajustes, total,
      decimas: decimasPorSocio.get(s.usuario_id) || 0, vencimiento,
      token: crypto.randomBytes(18).toString('base64url'), sello
    });
    if (total > 0) totalCupones += total;
  }

  // 3. Sellado
  db.prepare(`UPDATE cierres SET hasta_movimiento_id = ?, cantidad_vuelos = ?, total_decimas = ?, total_vuelos = ?, cantidad_cupones = ?, total_cupones = ? WHERE id = ?`)
    .run(hasta, vuelos.length, totalDecimas, totalVuelos, nro, totalCupones, cierreId);

  const resultado = detalleCierre(cierreId);
  if (simular) throw new Simulacion(resultado);   // rollback: la vista previa es exactamente lo que va a pasar
  auditar(actor?.id ?? null, actor ? 'cierre.manual' : 'cierre.automatico',
    `${nombrePeriodo(periodo)}: ${vuelos.length} vuelos, ${fmtHoras(totalDecimas)}, ${nro} cupones, ${fmtPesos(totalCupones)} a cobrar`);
  return resultado;
});

function cerrar(periodo, actor) { return correrCierre(periodo, actor, false); }

function simular(periodo, actor) {
  try { correrCierre(periodo, actor, true); } catch (e) { if (e instanceof Simulacion) return e.resultado; throw e; }
  throw new Error('La simulación no se revirtió');
}

function listarCierres() {
  return db.prepare(`
    SELECT c.*, u.nombre || ' ' || u.apellido cerrado_por_nombre FROM cierres c LEFT JOIN usuarios u ON u.id = c.cerrado_por
    ORDER BY c.periodo DESC`).all();
}

function detalleCierre(cierreId) {
  const cierre = db.prepare(`SELECT c.*, u.nombre || ' ' || u.apellido cerrado_por_nombre FROM cierres c LEFT JOIN usuarios u ON u.id = c.cerrado_por WHERE c.id = ?`).get(cierreId);
  if (!cierre) throw new ErrorNegocio('Cierre inexistente', 404);
  const cupones = db.prepare(`
    SELECT cu.*, u.nombre, u.apellido, u.telefono, u.email,
      (SELECT COUNT(*) FROM cupon_envios e WHERE e.cupon_id = cu.id AND e.canal = 'whatsapp') envios,
      (SELECT MAX(e.creado_en) FROM cupon_envios e WHERE e.cupon_id = cu.id AND e.canal = 'whatsapp') ultimo_envio
    FROM cupones cu JOIN usuarios u ON u.id = cu.usuario_id
    WHERE cu.cierre_id = ? ORDER BY u.apellido, u.nombre`).all(cierreId);
  return { cierre, cupones: cupones.map(c => ({ ...c, ...estadoCupon(c) })) };
}

// Estado de cobro de un cupón según el saldo actual del socio.
function estadoCupon(cupon) {
  const posterior = db.prepare(`
    SELECT cu.numero, ci.periodo FROM cupones cu JOIN cierres ci ON ci.id = cu.cierre_id
    WHERE cu.usuario_id = ? AND cu.id > ? ORDER BY cu.id LIMIT 1`).get(cupon.usuario_id, cupon.id);
  if (posterior) return { estado: 'incluido', estado_detalle: `Su saldo pasó al cupón de ${nombrePeriodo(posterior.periodo)}`, restante: 0 };
  if (cupon.total <= 0) return { estado: 'sin_deuda', estado_detalle: cupon.total < 0 ? `Saldo a favor de ${fmtPesos(-cupon.total)}` : 'Sin deuda', restante: 0 };
  const actual = ledger.saldo(cupon.usuario_id);
  if (actual <= 0) return { estado: 'pagado', estado_detalle: 'Pagado', restante: 0 };
  const vencido = hoy() > cupon.vencimiento;
  if (actual < cupon.total) return { estado: 'parcial', estado_detalle: `Pago parcial: faltan ${fmtPesos(actual)}`, restante: actual, vencido };
  return { estado: 'pendiente', estado_detalle: vencido ? 'Vencido' : 'Pendiente de pago', restante: actual, vencido };
}

// Todo lo necesario para imprimir un cupón.
function datosCupon(cuponId) {
  const cupon = db.prepare(`
    SELECT cu.*, ci.periodo, ci.desde_movimiento_id, ci.hasta_movimiento_id, ci.creado_en cierre_fecha,
           u.nombre, u.apellido, u.email, u.telefono, u.dni
    FROM cupones cu JOIN cierres ci ON ci.id = cu.cierre_id JOIN usuarios u ON u.id = cu.usuario_id
    WHERE cu.id = ?`).get(cuponId);
  if (!cupon) throw new ErrorNegocio('Cupón inexistente', 404);
  const movimientos = db.prepare(`
    SELECT m.*, COALESCE(o.tipo, m.tipo) clase, v.fecha vuelo_fecha, v.decimas, v.precio_hora, v.tipo vuelo_tipo,
           a.matricula, i.nombre || ' ' || i.apellido instructor
    FROM movimientos m
    LEFT JOIN movimientos o ON o.id = m.anula_id
    LEFT JOIN vuelos v ON v.id = m.vuelo_id
    LEFT JOIN aviones a ON a.id = v.avion_id
    LEFT JOIN usuarios i ON i.id = v.instructor_id
    WHERE m.usuario_id = ? AND m.id > ? AND m.id <= ? ORDER BY m.id`).all(cupon.usuario_id, cupon.desde_movimiento_id, cupon.hasta_movimiento_id);
  return { cupon, movimientos, config: getConfig(), estado: estadoCupon(cupon) };
}

function registrarEnvio(cuponId, canal, actor) {
  if (!['whatsapp', 'descarga'].includes(canal)) throw new ErrorNegocio('Canal inválido');
  db.prepare('INSERT INTO cupon_envios (cupon_id, canal, usuario_id) VALUES (?, ?, ?)').run(cuponId, canal, actor?.id ?? null);
}

// Se llama periódicamente. Cierra los meses vencidos respetando el día y la hora configurados.
function cierreAutomatico() {
  const cfg = getConfig();
  if (cfg.cierre_automatico !== '1') return [];
  const pendientes = periodosPendientes();
  const anterior = sumarMeses(periodoActual(), -1);
  const dia = Number(hoy().slice(8));
  const diaCierre = Number(cfg.cierre_dia) || 1;
  const horaCierre = Number(cfg.cierre_hora) || 0;
  const llegoElMomento = dia > diaCierre || (dia === diaCierre && horaAR() >= horaCierre);
  const cerrados = [];
  for (const p of pendientes) {
    if (p === anterior && !llegoElMomento) break;
    const r = cerrar(p, null);
    console.log(`[cierre] ${nombrePeriodo(p)} cerrado automáticamente: ${r.cupones.length} cupones`);
    cerrados.push(r);
  }
  return cerrados;
}

function proximoCierreAutomatico() {
  const cfg = getConfig();
  const pendientes = periodosPendientes();
  const periodo = pendientes[0] || periodoActual();
  const sig = sumarMeses(periodo, 1);
  const dia = String(Math.min(Number(cfg.cierre_dia) || 1, 28)).padStart(2, '0');
  return { periodo, fecha: `${sig}-${dia}`, hora: Number(cfg.cierre_hora) || 0, automatico: cfg.cierre_automatico === '1', pendientes };
}

module.exports = {
  cerrar, simular, listarCierres, detalleCierre, estadoCupon, datosCupon, registrarEnvio, cierreAutomatico,
  periodosPendientes, proximoCierreAutomatico, ultimoCierre, totalesRango
};
