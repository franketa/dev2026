// Rendición mensual de cada sede: punto final de la Etapa 1.
//
//   abierta ──cerrar y firmar (jefe)──▶ cerrada_firmada ──enviar (jefe)──▶ enviada
//      ▲                                                                      │
//      └──────────── reabrir (Central, motivo obligatorio, nueva versión) ────┘
//
// Al cerrar se arma el listado por rubro desde la base y se guarda como "foto" (snapshot) con su SHA-256.
// La firma electrónica simple es: usuario + fecha y hora + hash del contenido. Si después cambia un dato en la
// base, al recalcular el contenido el hash no coincide (verificar()). La versión firmada no se puede editar
// (trigger) y una reapertura no la pisa: el próximo cierre crea la versión siguiente.

const { db, flag } = require('../db');
const libro = require('./libro');
const acceso = require('./acceso');
const { auditar } = require('./auditoria');
const { notificar } = require('./notificaciones');
const { TIPOS_COMPROBANTE } = require('./gastos');
const { ErrorNegocio, canonico, sha256, nombrePeriodo, periodoActual, hoy, ultimoDia, esPeriodo, limpiarTexto, fmtPesos } = require('../util');

const ESTADOS = {
  abierta: 'Abierta', cerrada_firmada: 'Cerrada y firmada', enviada: 'Enviada a la Central',
  en_cotejo: 'En cotejo', observada: 'Observada', aprobada: 'Aprobada' // Etapa 2
};

function fila(sedeId, periodo) {
  return db.prepare('SELECT * FROM rendiciones WHERE sede_id = ? AND periodo = ?').get(sedeId, periodo) || null;
}
function asegurar(sedeId, periodo) {
  db.prepare('INSERT OR IGNORE INTO rendiciones (sede_id, periodo) VALUES (?, ?)').run(sedeId, periodo);
  return fila(sedeId, periodo);
}
function versionActual(r) {
  if (!r || !r.version) return null;
  return db.prepare('SELECT * FROM rendicion_versiones WHERE rendicion_id = ? AND version = ?').get(r.id, r.version);
}

// ── Contenido (lo que se firma) ─────────────────────────────────────────────
// Determinístico: con los mismos datos en la base da exactamente el mismo JSON (y el mismo hash).
function armarContenido(sedeId, periodo) {
  const sede = db.prepare('SELECT id, nombre, codigo FROM sedes WHERE id = ?').get(sedeId);
  const gastos = db.prepare(`SELECT g.id, g.fecha_pago, g.tipo_comprobante, g.punto_venta, g.numero, g.cae, g.bruto, g.retenciones, g.neto,
      g.medio, g.pagado_por, g.solicitud_id, g.tipo_gasto, g.descripcion, g.rubro_id,
      p.razon_social AS proveedor, p.cuit, r.nombre AS rubro, r.es_nd, rp.id AS padre_id, rp.nombre AS padre
    FROM gastos g JOIN proveedores p ON p.id = g.proveedor_id JOIN rubros r ON r.id = g.rubro_id LEFT JOIN rubros rp ON rp.id = r.padre_id
    WHERE g.sede_id = ? AND g.periodo = ? AND g.estado = 'registrado'
    ORDER BY COALESCE(rp.orden, r.orden), COALESCE(rp.id, r.id), r.orden, r.id, g.fecha_pago, g.id`).all(sedeId, periodo);
  const anulados = db.prepare(`SELECT COUNT(*) n FROM gastos WHERE sede_id = ? AND periodo = ? AND estado = 'anulado'`).get(sedeId, periodo).n;
  const fondos = db.prepare(`SELECT id, tipo, fecha, importe, referencia FROM asignaciones WHERE sede_id = ? AND periodo = ? AND estado = 'vigente' ORDER BY fecha, id`).all(sedeId, periodo);
  const movs = db.prepare(`SELECT tipo, cuenta, SUM(importe) total FROM movimientos WHERE sede_id = ? AND periodo = ? GROUP BY tipo, cuenta`).all(sedeId, periodo);
  const sumMov = (tipo, cuenta) => movs.filter(m => m.tipo === tipo && (!cuenta || m.cuenta === cuenta)).reduce((s, m) => s + m.total, 0);

  const detalle = (g) => ({
    id: g.id, fecha: g.fecha_pago, proveedor: g.proveedor, cuit: g.cuit,
    comprobante: `${TIPOS_COMPROBANTE[g.tipo_comprobante]}${g.numero ? ` ${String(g.punto_venta).padStart(4, '0')}-${String(g.numero).padStart(8, '0')}` : ''}`,
    cae: g.cae, bruto: g.bruto, retenciones: g.retenciones, neto: g.neto, medio: g.medio, pagado_por: g.pagado_por,
    solicitud_id: g.solicitud_id, tipo_gasto: g.tipo_gasto, descripcion: g.descripcion
  });

  // Rubro → subrubro, con subtotales. Un rubro sin subrubros lleva sus gastos directo.
  function agrupar(lista) {
    const rubros = [];
    for (const g of lista) {
      const rid = g.padre_id ?? g.rubro_id;
      let r = rubros.find(x => x.id === rid);
      if (!r) { r = { id: rid, nombre: g.padre ?? g.rubro, subtotal: 0, subrubros: [] }; rubros.push(r); }
      const sid = g.padre_id ? g.rubro_id : null;
      let s = r.subrubros.find(x => x.id === sid);
      if (!s) { s = { id: sid, nombre: g.padre_id ? g.rubro : null, subtotal: 0, gastos: [] }; r.subrubros.push(s); }
      s.gastos.push(detalle(g));
      s.subtotal += g.bruto;
      r.subtotal += g.bruto;
    }
    return rubros;
  }

  const deSede = gastos.filter(g => g.pagado_por === 'sede');
  const deCentral = gastos.filter(g => g.pagado_por === 'central');
  const suma = (l, f = (g) => g.bruto) => l.reduce((s, g) => s + f(g), 0);
  const inicial = libro.saldosAlInicio(sedeId, periodo);
  const final = libro.saldosAlCierre(sedeId, periodo);
  const total = suma(gastos);
  const nd = suma(gastos.filter(g => g.es_nd));

  return {
    sede, periodo, nombre_periodo: nombrePeriodo(periodo),
    fondos: fondos.map(f => ({ fecha: f.fecha, tipo: f.tipo, importe: f.importe, referencia: f.referencia })),
    resumen: {
      saldo_inicial: inicial,
      fondo_mensual: suma(fondos.filter(f => f.tipo === 'mensual'), f => f.importe),
      fondo_extra: suma(fondos.filter(f => f.tipo === 'extra'), f => f.importe),
      fondo_recibido: suma(fondos, f => f.importe),
      extracciones: sumMov('extraccion', 'efectivo'),
      depositos: sumMov('deposito', 'banco'),
      gastado_sede: {
        banco: suma(deSede.filter(g => g.medio === 'transferencia')),
        efectivo: suma(deSede.filter(g => g.medio === 'efectivo')),
        total: suma(deSede)
      },
      pagado_central: suma(deCentral),
      total_gastos: total,
      retenciones: suma(gastos, g => g.retenciones),
      saldo_final: final,
      cantidades: {
        gastos: gastos.length,
        sin_cae: gastos.filter(g => !g.cae).length,
        nd: gastos.filter(g => g.es_nd).length,
        fijos: gastos.filter(g => g.tipo_gasto === 'fijo').length,
        caja_chica: gastos.filter(g => g.tipo_gasto === 'caja_chica').length,
        con_solicitud: gastos.filter(g => g.tipo_gasto === 'con_solicitud').length,
        pagados_central: deCentral.length,
        anulados
      },
      nd_total: nd,
      nd_pct: total ? Math.round((nd * 1000) / total) / 10 : 0
    },
    por_rubro: agrupar(gastos).map(r => ({ id: r.id, nombre: r.nombre, subtotal: r.subtotal, subrubros: r.subrubros.filter(s => s.id).map(s => ({ nombre: s.nombre, subtotal: s.subtotal })) })),
    pagado_por_sede: agrupar(deSede),
    pagado_por_central: agrupar(deCentral)
  };
}

const hashDe = (contenido) => sha256(canonico(contenido));

// ── Lectura ─────────────────────────────────────────────────────────────────
function puedeCerrarseYa(periodo) {
  return periodo < periodoActual() || hoy() === ultimoDia(periodo) || flag('cierre_anticipado');
}

function estado(actor, sedeId, periodo) {
  if (!esPeriodo(periodo)) throw new ErrorNegocio('Período inválido');
  acceso.exigirSede(actor, sedeId);
  const sede = acceso.sedeOperativa(sedeId);
  const r = fila(sede.id, periodo);
  const contenido = armarContenido(sede.id, periodo);
  const pendientesAdjunto = db.prepare(`SELECT COUNT(*) n FROM gastos WHERE sede_id = ? AND periodo = ? AND estado = 'registrado' AND adjunto_estado = 'pendiente'`).get(sede.id, periodo).n;
  const umbralNd = db.prepare(`SELECT valor FROM parametros WHERE clave = 'umbral_nd_pct' AND vigente_desde <= ? ORDER BY vigente_desde DESC, id DESC LIMIT 1`).get(ultimoDia(periodo))?.valor ?? 5;
  return {
    sede: { id: sede.id, nombre: sede.nombre },
    periodo,
    estado: r?.estado || 'abierta',
    version: r?.version || 0,
    contenido,
    adjuntos_pendientes: pendientesAdjunto,
    alerta_nd: contenido.resumen.nd_pct > umbralNd ? `Los gastos sin descripción (N/D) son el ${String(contenido.resumen.nd_pct).replace('.', ',')} % de lo gastado (alerta desde ${umbralNd} %).` : null,
    puede_cerrarse_ya: puedeCerrarseYa(periodo),
    versiones: r ? versiones(r.id) : []
  };
}

function versiones(rendicionId) {
  return db.prepare(`SELECT v.id, v.version, v.hash, v.firmado_en, v.enviado_en, v.reabierto_en, v.motivo_reapertura,
      f.nombre || ' ' || f.apellido AS firmado_por_nombre, e.nombre || ' ' || e.apellido AS enviado_por_nombre, x.nombre || ' ' || x.apellido AS reabierto_por_nombre
    FROM rendicion_versiones v JOIN usuarios f ON f.id = v.firmado_por LEFT JOIN usuarios e ON e.id = v.enviado_por LEFT JOIN usuarios x ON x.id = v.reabierto_por
    WHERE v.rendicion_id = ? ORDER BY v.version DESC`).all(rendicionId);
}

// La foto guardada de una versión (para PDF, Excel y la bandeja de la Central).
function documento(actor, sedeId, periodo, version = null) {
  acceso.exigirSede(actor, sedeId);
  const r = fila(Number(sedeId), periodo);
  if (!r || !r.version) throw new ErrorNegocio('Esa rendición todavía no se cerró', 404);
  const v = db.prepare(`SELECT v.*, f.nombre || ' ' || f.apellido AS firmado_por_nombre, f.email AS firmado_por_email, e.nombre || ' ' || e.apellido AS enviado_por_nombre
    FROM rendicion_versiones v JOIN usuarios f ON f.id = v.firmado_por LEFT JOIN usuarios e ON e.id = v.enviado_por
    WHERE v.rendicion_id = ? AND v.version = ?`).get(r.id, version ? Number(version) : r.version);
  if (!v) throw new ErrorNegocio('Versión inexistente', 404);
  return { rendicion: r, version: v, contenido: JSON.parse(v.snapshot), integridad: verificarVersion(r, v) };
}

// Dos controles: (1) la foto guardada no se tocó (su hash coincide) y (2) los datos de la base todavía dan esa foto.
function verificarVersion(r, v) {
  const fotoOk = hashDe(JSON.parse(v.snapshot)) === v.hash;
  const vigente = r.version === v.version && r.estado !== 'abierta';
  const datosOk = vigente ? hashDe(armarContenido(r.sede_id, r.periodo)) === v.hash : null;
  return { foto_ok: fotoOk, datos_ok: datosOk, hash: v.hash };
}

// ── Cerrar y firmar ─────────────────────────────────────────────────────────
const cerrar = db.transaction((actor, sedeId, periodo, { confirmo } = {}) => {
  acceso.exigir(actor, 'rendicion.cerrar', 'La rendición la cierra y la firma el jefe de sede');
  if (Number(sedeId) !== actor.sede_id) throw new ErrorNegocio('Sólo el jefe de la sede puede cerrar y firmar su rendición', 403);
  const sede = acceso.sedeOperativa(sedeId);
  if (!esPeriodo(periodo)) throw new ErrorNegocio('Período inválido');
  if (!confirmo) throw new ErrorNegocio('Confirmá que revisaste el resumen antes de firmar');
  if (!puedeCerrarseYa(periodo)) throw new ErrorNegocio(`${nombrePeriodo(periodo)} todavía no terminó: la rendición se cierra desde el último día del mes.`, 409);
  const r = asegurar(sede.id, periodo);
  if (r.estado !== 'abierta') throw new ErrorNegocio('Esa rendición ya está cerrada', 409);
  const contenido = armarContenido(sede.id, periodo);
  if (!contenido.resumen.cantidades.gastos && !contenido.resumen.fondo_recibido) {
    throw new ErrorNegocio(`No hay movimientos en ${nombrePeriodo(periodo)} para rendir`, 409);
  }
  const hash = hashDe(contenido);
  const version = r.version + 1;
  const firmadoEn = new Date().toISOString();
  db.prepare(`INSERT INTO rendicion_versiones (rendicion_id, version, snapshot, hash, firmado_por, firmado_en) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(r.id, version, canonico(contenido), hash, actor.id, firmadoEn);
  db.prepare(`UPDATE rendiciones SET estado = 'cerrada_firmada', version = ?, actualizado_en = datetime('now') WHERE id = ?`).run(version, r.id);
  auditar(actor, { accion: 'rendicion.cierre', sedeId: sede.id, entidad: 'rendicion', entidadId: r.id, antes: { estado: 'abierta' }, despues: { estado: 'cerrada_firmada', version, hash, firmado_en: firmadoEn, total: contenido.resumen.total_gastos } });
  return { version, hash };
});

// ── Enviar a la Central ─────────────────────────────────────────────────────
const enviar = db.transaction((actor, sedeId, periodo) => {
  acceso.exigir(actor, 'rendicion.cerrar', 'La rendición la envía el jefe de sede');
  if (Number(sedeId) !== actor.sede_id) throw new ErrorNegocio('Sólo el jefe de la sede puede enviar su rendición', 403);
  const r = fila(Number(sedeId), periodo);
  if (!r || r.estado !== 'cerrada_firmada') throw new ErrorNegocio('Primero hay que cerrar y firmar la rendición', 409);
  const v = versionActual(r);
  const chequeo = verificarVersion(r, v);
  if (!chequeo.foto_ok || !chequeo.datos_ok) {
    throw new ErrorNegocio('La rendición firmada no coincide con los datos de la base. No se envía: avisá a la Sede Central.', 409, 'INTEGRIDAD');
  }
  db.prepare(`UPDATE rendicion_versiones SET enviado_por = ?, enviado_en = ? WHERE id = ?`).run(actor.id, new Date().toISOString(), v.id);
  db.prepare(`UPDATE rendiciones SET estado = 'enviada', actualizado_en = datetime('now') WHERE id = ?`).run(r.id);
  const sede = db.prepare('SELECT nombre FROM sedes WHERE id = ?').get(r.sede_id);
  auditar(actor, { accion: 'rendicion.envio', sedeId: r.sede_id, entidad: 'rendicion', entidadId: r.id, antes: { estado: 'cerrada_firmada' }, despues: { estado: 'enviada', version: v.version, hash: v.hash } });
  const total = JSON.parse(v.snapshot).resumen.total_gastos;
  notificar({ central: true }, { permiso: 'rendiciones.recibidas', tipo: 'info', link: `#/central/rendiciones/${r.sede_id}/${periodo}`, texto: `${sede.nombre} envió la rendición de ${nombrePeriodo(periodo)} (${fmtPesos(total)} en gastos).` });
  return { version: v.version, hash: v.hash };
});

// ── Reabrir (sólo la Central, con motivo) ───────────────────────────────────
const reabrir = db.transaction((actor, sedeId, periodo, motivo) => {
  acceso.exigir(actor, 'rendicion.reabrir', 'Sólo la Sede Central puede reabrir un período');
  motivo = limpiarTexto(motivo, 500);
  if (!motivo) throw new ErrorNegocio('Indicá el motivo de la reapertura');
  const r = fila(Number(sedeId), periodo);
  if (!r || !['cerrada_firmada', 'enviada'].includes(r.estado)) throw new ErrorNegocio('Ese período no está cerrado', 409);
  const v = versionActual(r);
  db.prepare(`UPDATE rendicion_versiones SET reabierto_por = ?, reabierto_en = ?, motivo_reapertura = ? WHERE id = ?`).run(actor.id, new Date().toISOString(), motivo, v.id);
  db.prepare(`UPDATE rendiciones SET estado = 'abierta', actualizado_en = datetime('now') WHERE id = ?`).run(r.id);
  auditar(actor, { accion: 'rendicion.reapertura', sedeId: r.sede_id, entidad: 'rendicion', entidadId: r.id, antes: { estado: r.estado, version: v.version, hash: v.hash }, despues: { estado: 'abierta' }, motivo });
  notificar({ sedeId: r.sede_id }, { tipo: 'alerta', link: '#/rendicion', texto: `La Sede Central reabrió la rendición de ${nombrePeriodo(periodo)}: ${motivo}. Corregí lo necesario y volvé a cerrarla y enviarla.` });
});

// ── Bandeja de la Central ───────────────────────────────────────────────────
function recibidas(actor, { sede_id, periodo } = {}) {
  acceso.exigir(actor, 'rendiciones.recibidas');
  const w = [`r.estado IN ('enviada','en_cotejo','observada','aprobada')`]; const args = [];
  if (sede_id) { w.push('r.sede_id = ?'); args.push(Number(sede_id)); }
  if (periodo) { w.push('r.periodo = ?'); args.push(periodo); }
  return db.prepare(`SELECT r.*, s.nombre AS sede_nombre, v.hash, v.firmado_en, v.enviado_en, v.snapshot,
      f.nombre || ' ' || f.apellido AS firmado_por_nombre
    FROM rendiciones r JOIN sedes s ON s.id = r.sede_id JOIN rendicion_versiones v ON v.rendicion_id = r.id AND v.version = r.version
    JOIN usuarios f ON f.id = v.firmado_por WHERE ${w.join(' AND ')} ORDER BY v.enviado_en DESC`).all(...args).map(({ snapshot, ...x }) => {
    const c = JSON.parse(snapshot);
    return { ...x, total_gastos: c.resumen.total_gastos, fondo_recibido: c.resumen.fondo_recibido, gastos: c.resumen.cantidades.gastos, saldo_final: c.resumen.saldo_final.total };
  });
}

// Estado de las rendiciones de todas las sedes en un mes (para el panel de la Central).
function tablero(periodo) {
  return db.prepare(`SELECT s.id AS sede_id, s.nombre AS sede_nombre, COALESCE(r.estado, 'abierta') AS estado, r.version
    FROM sedes s LEFT JOIN rendiciones r ON r.sede_id = s.id AND r.periodo = ? WHERE s.es_central = 0 AND s.activa = 1 ORDER BY s.orden, s.nombre`).all(periodo);
}

module.exports = { ESTADOS, armarContenido, hashDe, estado, documento, cerrar, enviar, reabrir, recibidas, tablero, versiones, puedeCerrarseYa };
