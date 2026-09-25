const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, getConfig, auditar } = require('../db');
const flota = require('../services/flota');
const vuelos = require('../services/vuelos');
const cierres = require('../services/cierres');
const cuentas = require('../services/cuentas');
const ledger = require('../services/ledger');
const { enviarPdf } = require('./app');
const {
  ErrorNegocio, hoy, periodoActual, sumarMeses, esFecha, esPeriodo, parsePesos, fmtPesos, fmtHoras,
  limpiarTexto, normalizarEmail, telefonoWhatsApp, nombrePeriodo, fmtFechaCorta
} = require('../util');

const router = express.Router();

// ── Panel ───────────────────────────────────────────────────────────────────
router.get('/panel', (req, res) => {
  const periodo = esPeriodo(req.query.periodo) ? req.query.periodo : periodoActual();
  const porAvion = db.prepare(`
    SELECT a.id, a.matricula, a.modelo,
      COALESCE(SUM(v.decimas),0) decimas, COUNT(v.id) vuelos,
      COALESCE(SUM(CASE WHEN v.tipo='instruccion' THEN v.decimas END),0) decimas_instruccion,
      COALESCE(SUM(v.importe),0) importe
    FROM aviones a LEFT JOIN vuelos v ON v.avion_id = a.id AND v.estado <> 'anulado' AND substr(v.fecha,1,7) = ?
    WHERE a.activo = 1 OR v.id IS NOT NULL
    GROUP BY a.id ORDER BY a.orden`).all(periodo);
  const porDia = db.prepare(`
    SELECT fecha, avion_id, SUM(decimas) decimas FROM vuelos
    WHERE estado <> 'anulado' AND substr(fecha,1,7) = ? GROUP BY fecha, avion_id ORDER BY fecha`).all(periodo);
  const deuda = db.prepare(`SELECT COALESCE(SUM(s),0) total, COUNT(*) socios FROM (SELECT SUM(importe) s FROM movimientos GROUP BY usuario_id HAVING s > 0)`).get();
  const cobrado = db.prepare(`
    SELECT COALESCE(-SUM(m.importe),0) total, COUNT(*) pagos FROM movimientos m LEFT JOIN movimientos o ON o.id = m.anula_id
    WHERE COALESCE(o.tipo, m.tipo) = 'pago' AND substr(m.fecha,1,7) = ?`).get(periodo);
  const novedades = vuelos.listar({ con_notas: true, limite: 8 });
  res.json({
    periodo,
    por_avion: porAvion,
    por_dia: porDia,
    deuda,
    cobrado,
    novedades,
    aviones: flota.listarAviones(),
    proximo_cierre: cierres.proximoCierreAutomatico(),
    pilotos_activos: db.prepare(`SELECT COUNT(DISTINCT piloto_id) n FROM vuelos WHERE estado <> 'anulado' AND substr(fecha,1,7) = ?`).get(periodo).n
  });
});

// ── Socios ──────────────────────────────────────────────────────────────────
const PALABRAS = ['cessna', 'piper', 'cabeceo', 'alabeo', 'viraje', 'flaps', 'timon', 'helice', 'rodaje', 'final', 'pista', 'brujula', 'altimetro', 'planeo'];
function passwordTemporal() {
  return `${PALABRAS[crypto.randomInt(PALABRAS.length)]}-${crypto.randomInt(1000, 9999)}`;
}

function leerSocio(body, existente = null) {
  const nombre = limpiarTexto(body.nombre, 60);
  const apellido = limpiarTexto(body.apellido, 60);
  const email = normalizarEmail(limpiarTexto(body.email, 120)) || null;
  if (!nombre || !apellido) throw new ErrorNegocio('Completá nombre y apellido');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorNegocio('Email inválido');
  const telefono = limpiarTexto(body.telefono, 30);
  if (telefono && !telefonoWhatsApp(telefono)) throw new ErrorNegocio('Celular inválido: poné código de área y número (ej: 2345 401234)');
  const rol = body.rol === 'admin' ? 'admin' : 'piloto';
  return {
    nombre, apellido, email, telefono,
    dni: limpiarTexto(body.dni, 12),
    licencia: limpiarTexto(body.licencia, 60),
    rol,
    es_instructor: body.es_instructor ? 1 : 0,
    activo: body.activo === false || body.activo === 0 ? 0 : 1
  };
}

router.get('/usuarios', (req, res) => res.json({ usuarios: cuentas.listarCuentas() }));

router.post('/usuarios', (req, res) => {
  const s = leerSocio(req.body || {});
  const temporal = passwordTemporal();
  try {
    const r = db.prepare(`
      INSERT INTO usuarios (nombre, apellido, email, telefono, dni, licencia, rol, es_instructor, activo, password_hash, debe_cambiar_password)
      VALUES (@nombre, @apellido, @email, @telefono, @dni, @licencia, @rol, @es_instructor, 1, @hash, 1)`)
      .run({ ...s, hash: bcrypt.hashSync(temporal, 10) });
    auditar(req.user.id, 'usuario.alta', `${s.nombre} ${s.apellido} (${s.email}), rol ${s.rol}${s.es_instructor ? ', instructor' : ''}`);
    res.status(201).json({ id: Number(r.lastInsertRowid), password_temporal: temporal });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new ErrorNegocio('Ya hay un socio con ese email');
    throw e;
  }
});

router.put('/usuarios/:id', (req, res) => {
  const id = Number(req.params.id);
  const antes = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!antes) throw new ErrorNegocio('Socio inexistente', 404);
  const s = leerSocio(req.body || {}, antes);
  if (id === req.user.id && (s.rol !== 'admin' || !s.activo)) throw new ErrorNegocio('No podés quitarte el rol de admin ni darte de baja a vos mismo');
  if (antes.rol === 'admin' && s.rol !== 'admin') {
    const admins = db.prepare(`SELECT COUNT(*) n FROM usuarios WHERE rol = 'admin' AND activo = 1`).get().n;
    if (admins <= 1) throw new ErrorNegocio('Tiene que quedar al menos un administrador activo');
  }
  try {
    // Dar de baja o cambiar el rol invalida sus sesiones abiertas.
    const cortaSesion = (antes.activo && !s.activo) || antes.rol !== s.rol;
    db.prepare(`
      UPDATE usuarios SET nombre=@nombre, apellido=@apellido, email=@email, telefono=@telefono, dni=@dni, licencia=@licencia,
        rol=@rol, es_instructor=@es_instructor, activo=@activo, token_version = token_version + @corta WHERE id=@id`)
      .run({ ...s, id, corta: cortaSesion ? 1 : 0 });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new ErrorNegocio('Ya hay un socio con ese email');
    throw e;
  }
  const cambios = Object.keys(s).filter(k => String(s[k] ?? '') !== String(antes[k] ?? '')).map(k => `${k}: ${antes[k] ?? '—'} → ${s[k] ?? '—'}`);
  if (cambios.length) auditar(req.user.id, 'usuario.edicion', `${s.nombre} ${s.apellido}: ${cambios.join('; ')}`);
  res.json({ ok: true });
});

router.post('/usuarios/:id/reset-password', (req, res) => {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(Number(req.params.id));
  if (!u) throw new ErrorNegocio('Socio inexistente', 404);
  const temporal = passwordTemporal();
  db.prepare('UPDATE usuarios SET password_hash = ?, debe_cambiar_password = 1, token_version = token_version + 1 WHERE id = ?')
    .run(bcrypt.hashSync(temporal, 10), u.id);
  auditar(req.user.id, 'usuario.reset_password', `${u.nombre} ${u.apellido}`);
  res.json({ password_temporal: temporal });
});

// ── Flota y tarifas ─────────────────────────────────────────────────────────
router.get('/aviones', (req, res) => {
  const aviones = flota.listarAviones({ incluirInactivos: true }).map(a => ({ ...a, historial_tarifas: flota.historialTarifas(a.id) }));
  res.json({ aviones });
});

router.post('/aviones', (req, res) => res.status(201).json({ id: flota.guardarAvion(req.body || {}, req.user) }));
router.put('/aviones/:id', (req, res) => res.json({ id: flota.guardarAvion(req.body || {}, req.user, Number(req.params.id)) }));

router.post('/aviones/:id/tarifas', (req, res) => {
  const precio = parsePesos(req.body?.precio_hora);
  if (precio == null || precio <= 0) throw new ErrorNegocio('Precio por hora inválido');
  res.status(201).json(flota.nuevaTarifa(Number(req.params.id), { ...req.body, precio_hora: precio }, req.user));
});


// ── Cuentas corrientes ──────────────────────────────────────────────────────
router.get('/cuentas', (req, res) => res.json({ cuentas: cuentas.listarCuentas() }));
router.get('/cuentas/:id', (req, res) => res.json(cuentas.estadoCuenta(Number(req.params.id))));

function socioActivo(id) {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(Number(id));
  if (!u) throw new ErrorNegocio('Socio inexistente', 404);
  return u;
}

const MEDIOS = ['transferencia', 'efectivo', 'mercadopago', 'cheque', 'otro'];

router.post('/pagos', (req, res) => {
  const u = socioActivo(req.body?.usuario_id);
  const importe = parsePesos(req.body?.importe);
  if (importe == null || importe <= 0) throw new ErrorNegocio('Importe del pago inválido');
  const fecha = req.body?.fecha || hoy();
  if (!esFecha(fecha) || fecha > hoy()) throw new ErrorNegocio('Fecha del pago inválida');
  const medio = MEDIOS.includes(req.body?.medio) ? req.body.medio : 'transferencia';
  const nota = limpiarTexto(req.body?.nota, 200);
  const m = ledger.registrar({
    usuario_id: u.id, tipo: 'pago', importe: -importe, fecha, medio, creado_por: req.user.id,
    concepto: `Pago por ${medio}${nota ? ` (${nota})` : ''}`
  });
  auditar(req.user.id, 'pago.alta', `${u.nombre} ${u.apellido}: ${fmtPesos(importe)} por ${medio}, movimiento #${m.id}`);
  res.status(201).json({ movimiento_id: m.id, saldo: ledger.saldo(u.id) });
});

router.post('/ajustes', (req, res) => {
  const u = socioActivo(req.body?.usuario_id);
  const importe = parsePesos(req.body?.importe);
  if (importe == null || importe === 0) throw new ErrorNegocio('Importe del ajuste inválido');
  const sentido = req.body?.sentido === 'credito' ? -1 : 1;
  const motivo = limpiarTexto(req.body?.motivo, 200);
  if (!motivo) throw new ErrorNegocio('El motivo del ajuste es obligatorio: queda en el registro para siempre');
  const tipo = req.body?.tipo === 'saldo_inicial' ? 'saldo_inicial' : 'ajuste';
  const m = ledger.registrar({
    usuario_id: u.id, tipo, importe: Math.abs(importe) * sentido, creado_por: req.user.id,
    concepto: tipo === 'saldo_inicial' ? `Saldo inicial: ${motivo}` : `Ajuste: ${motivo}`
  });
  auditar(req.user.id, `${tipo}.alta`, `${u.nombre} ${u.apellido}: ${ledger.describirImporte(m.importe)}, ${motivo}, movimiento #${m.id}`);
  res.status(201).json({ movimiento_id: m.id, saldo: ledger.saldo(u.id) });
});

router.post('/movimientos/:id/anular', (req, res) => {
  const motivo = limpiarTexto(req.body?.motivo, 200);
  const m = ledger.anular(Number(req.params.id), motivo, req.user.id);
  auditar(req.user.id, 'movimiento.anulacion', `Movimiento #${req.params.id} anulado con #${m.id}: ${motivo}`);
  res.status(201).json({ movimiento_id: m.id });
});

// ── Cierres y cupones ───────────────────────────────────────────────────────
router.get('/cierres', (req, res) => {
  res.json({ cierres: cierres.listarCierres(), proximo: cierres.proximoCierreAutomatico() });
});

router.get('/cierres/simular', (req, res) => {
  const periodo = req.query.periodo || cierres.periodosPendientes()[0];
  if (!periodo) throw new ErrorNegocio('No hay meses terminados pendientes de cierre');
  res.json(cierres.simular(periodo, req.user));
});

router.post('/cierres', (req, res) => {
  const periodo = req.body?.periodo;
  const r = cierres.cerrar(periodo, req.user);
  res.status(201).json(r);
});

router.get('/cierres/:id', (req, res) => {
  const d = cierres.detalleCierre(Number(req.params.id));
  const cfg = getConfig();
  const base = (cfg.url_publica || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  d.cupones = d.cupones.map(c => ({ ...c, whatsapp: linkWhatsApp(c, d.cierre, cfg, base), link: `${base}/c/${c.token}` }));
  res.json(d);
});

function linkWhatsApp(c, cierre, cfg, base) {
  const tel = telefonoWhatsApp(c.telefono);
  if (!tel) return null;
  const texto = (cfg.whatsapp_mensaje || '')
    .replaceAll('{nombre}', c.nombre)
    .replaceAll('{periodo}', nombrePeriodo(cierre.periodo))
    .replaceAll('{club}', cfg.club_nombre)
    .replaceAll('{horas}', fmtHoras(c.decimas))
    .replaceAll('{total}', fmtPesos(c.restante > 0 ? c.restante : Math.max(c.total, 0)))
    .replaceAll('{alias}', cfg.pago_alias || '(consultar)')
    .replaceAll('{vencimiento}', fmtFechaCorta(c.vencimiento))
    .replaceAll('{link}', `${base}/c/${c.token}`);
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
}

router.post('/cupones/:id/envio', (req, res) => {
  cierres.registrarEnvio(Number(req.params.id), req.body?.canal || 'whatsapp', req.user);
  res.status(201).json({ ok: true });
});

router.get('/cupones/:id/pdf', (req, res) => enviarPdf(res, cierres.datosCupon(Number(req.params.id)), req.query.descargar === '1'));

// ── Reportes ────────────────────────────────────────────────────────────────
function reporte(periodo) {
  const filtro = `v.estado <> 'anulado' AND substr(v.fecha,1,7) = @periodo`;
  return {
    periodo,
    por_avion: db.prepare(`
      SELECT a.matricula, a.modelo, COUNT(*) vuelos, SUM(v.decimas) decimas,
        SUM(CASE WHEN v.tipo='solo' THEN v.decimas ELSE 0 END) decimas_solo,
        SUM(CASE WHEN v.tipo='instruccion' THEN v.decimas ELSE 0 END) decimas_instruccion,
        SUM(v.importe) importe
      FROM vuelos v JOIN aviones a ON a.id = v.avion_id WHERE ${filtro} GROUP BY a.id ORDER BY a.orden`).all({ periodo }),
    por_piloto: db.prepare(`
      SELECT u.id, u.nombre, u.apellido, COUNT(*) vuelos, SUM(v.decimas) decimas,
        SUM(CASE WHEN v.tipo='instruccion' THEN v.decimas ELSE 0 END) decimas_instruccion, SUM(v.importe) importe
      FROM vuelos v JOIN usuarios u ON u.id = v.piloto_id WHERE ${filtro} GROUP BY u.id ORDER BY decimas DESC`).all({ periodo }),
    por_instructor: db.prepare(`
      SELECT u.id, u.nombre, u.apellido, COUNT(*) vuelos, SUM(v.decimas) decimas, COUNT(DISTINCT v.piloto_id) alumnos
      FROM vuelos v JOIN usuarios u ON u.id = v.instructor_id WHERE ${filtro} GROUP BY u.id ORDER BY decimas DESC`).all({ periodo }),
    vuelos: vuelos.listar({ periodo, limite: 2000 })
  };
}

router.get('/reportes', (req, res) => {
  const periodo = esPeriodo(req.query.periodo) ? req.query.periodo : periodoActual();
  const r = reporte(periodo);
  if (req.query.formato !== 'csv') return res.json(r);

  // Excel ejecuta celdas que empiezan con = + - @: se neutralizan con un apóstrofo (las notas las escriben los pilotos).
  const esc = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const num = (d) => (d / 10).toFixed(1).replace('.', ',');
  const plata = (c) => (c / 100).toFixed(2).replace('.', ',');
  const filas = [['Fecha', 'Avión', 'Piloto', 'Instructor', 'Horas', 'Precio/h', 'Importe', 'Estado', 'Novedades']];
  for (const v of [...r.vuelos].reverse()) {
    filas.push([v.fecha, v.matricula, v.piloto, v.instructor || '', num(v.decimas), plata(v.precio_hora), plata(v.importe), v.estado, v.notas || '']);
  }
  // Separador ";" y BOM: Excel en español lo abre directo con acentos y columnas bien.
  const csv = '﻿' + filas.map(f => f.map(esc).join(';')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="vuelos-${periodo}.csv"`);
  res.send(csv);
});

// ── Registro inmutable ──────────────────────────────────────────────────────
router.get('/auditoria', (req, res) => {
  const antesDe = Number(req.query.antes) || Number.MAX_SAFE_INTEGER;
  res.json({
    eventos: db.prepare(`
      SELECT a.*, u.nombre || ' ' || u.apellido usuario FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.id < ? ORDER BY a.id DESC LIMIT 100`).all(antesDe)
  });
});

router.get('/libro', (req, res) => {
  const antesDe = Number(req.query.antes) || Number.MAX_SAFE_INTEGER;
  res.json({
    movimientos: db.prepare(`
      SELECT m.id, m.tipo, m.concepto, m.importe, m.fecha, m.anula_id, m.creado_en, m.hash, m.hash_anterior,
        s.nombre || ' ' || s.apellido socio, a.nombre || ' ' || a.apellido autor
      FROM movimientos m JOIN usuarios s ON s.id = m.usuario_id LEFT JOIN usuarios a ON a.id = m.creado_por
      WHERE m.id < ? ORDER BY m.id DESC LIMIT 100`).all(antesDe)
  });
});

router.get('/integridad', (req, res) => res.json(ledger.verificarCadena()));

// Copia completa de la base (consistente aunque haya escrituras en curso).
router.get('/respaldo', async (req, res, next) => {
  try {
    const archivo = path.join(os.tmpdir(), `a25-respaldo-${Date.now()}.sqlite`);
    await db.backup(archivo);
    auditar(req.user.id, 'respaldo.descarga', 'Descargó una copia de seguridad de la base');
    res.download(archivo, `aeroclub-respaldo-${hoy()}.sqlite`, () => fs.unlink(archivo, () => {}));
  } catch (e) { next(e); }
});

// ── Configuración ───────────────────────────────────────────────────────────
const EDITABLES = ['club_nombre', 'club_localidad', 'pago_alias', 'pago_cbu', 'pago_titular', 'pago_cuit', 'pago_banco', 'pago_instrucciones',
  'cierre_automatico', 'cierre_dia', 'cierre_hora', 'vencimiento_dia', 'whatsapp_mensaje', 'url_publica'];

router.get('/config', (req, res) => res.json({ config: getConfig() }));

router.put('/config', (req, res) => {
  const body = req.body || {};
  const actual = getConfig();
  const cambios = [];
  if (Number(body.vencimiento_dia ?? actual.vencimiento_dia) <= Number(body.cierre_dia ?? actual.cierre_dia)) {
    throw new ErrorNegocio('El vencimiento del cupón tiene que ser un día posterior al del cierre automático');
  }
  const set = db.prepare('INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor');
  for (const k of EDITABLES) {
    if (!(k in body)) continue;
    let v = limpiarTexto(body[k], k === 'whatsapp_mensaje' || k === 'pago_instrucciones' ? 600 : 120) ?? '';
    if (k === 'pago_cbu' && v && !/^\d{22}$/.test(v.replace(/\s/g, ''))) throw new ErrorNegocio('El CBU/CVU tiene que tener 22 dígitos');
    if (k === 'pago_cbu') v = v.replace(/\s/g, '');
    if (k === 'cierre_automatico') v = body[k] === true || body[k] === '1' ? '1' : '0';
    if (k === 'cierre_dia' && !(Number(v) >= 1 && Number(v) <= 28)) throw new ErrorNegocio('El día de cierre tiene que estar entre 1 y 28');
    if (k === 'cierre_hora' && !(Number(v) >= 0 && Number(v) <= 23)) throw new ErrorNegocio('La hora de cierre tiene que estar entre 0 y 23');
    if (k === 'vencimiento_dia' && !(Number(v) >= 1 && Number(v) <= 28)) throw new ErrorNegocio('El día de vencimiento tiene que estar entre 1 y 28');
    if (k === 'url_publica' && v && !/^https?:\/\/[^\s]+$/.test(v)) throw new ErrorNegocio('La dirección pública tiene que empezar con https://');
    if (String(actual[k] ?? '') !== v) { set.run(k, v); cambios.push(`${k}: ${actual[k] || '—'} → ${v || '—'}`); }
  }
  if (cambios.length) auditar(req.user.id, 'config.edicion', cambios.join('; '));
  res.json({ config: getConfig() });
});

module.exports = router;
