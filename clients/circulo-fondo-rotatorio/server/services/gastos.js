// Gastos: un gasto es un comprobante y su pago. Reglas (ver DECISIONES.md):
//
//   Tipo de gasto  · vinculado a una solicitud aprobada → con_solicitud
//                  · rubro fijo (luz, gas, internet…)   → fijo, sin importar el monto
//                  · bruto ≤ tope del medio de pago      → caja_chica
//                  · si no                               → se rechaza: hace falta una solicitud aprobada
//   Duplicado      · CAE repetido, o CUIT + tipo + PV + número → se rechaza, queda el intento y se avisa a la sede.
//   Saldo          · paga la sede: sale el bruto de su banco o su efectivo · paga la Central: sale de la Central.
//   Retenciones    · sólo sobre el umbral; las tilda a mano quien paga; neto = bruto − retenciones.

const { db, getConfig, parametro, flag } = require('../db');
const libro = require('./libro');
const acceso = require('./acceso');
const admin = require('./admin');
const proveedores = require('./proveedores');
const { auditar } = require('./auditoria');
const { notificar } = require('./notificaciones');
const { exigirSaldoCentral } = require('./fondos');
const {
  ErrorNegocio, hoy, periodoDe, esFecha, centavos, limpiarTexto, validarCae, validarCuit, soloDigitos,
  fmtPesos, fmtCuit, fmtFechaCorta, nombrePeriodo, importeRetencion
} = require('../util');

const TIPOS_COMPROBANTE = { factura_a: 'Factura A', factura_b: 'Factura B', factura_c: 'Factura C', ticket: 'Ticket', recibo: 'Recibo', otro: 'Otro' };
const TIPOS_GASTO = { fijo: 'Fijo', caja_chica: 'Sin solicitud (caja chica)', con_solicitud: 'Con solicitud' };
const MEDIOS = { transferencia: 'Transferencia', efectivo: 'Efectivo' };

// ── Reglas vigentes ─────────────────────────────────────────────────────────
function reglas(fecha = hoy()) {
  return {
    fecha,
    tope_transferencia: parametro('tope_transferencia', fecha),
    tope_efectivo: parametro('tope_efectivo', fecha),
    umbral_retencion: parametro('umbral_retencion', fecha),
    umbral_nd_pct: parametro('umbral_nd_pct', fecha)
  };
}

function estadoRendicion(sedeId, periodo) {
  return db.prepare('SELECT estado FROM rendiciones WHERE sede_id = ? AND periodo = ?').get(sedeId, periodo)?.estado || 'abierta';
}
function exigirPeriodoAbierto(sedeId, periodo) {
  if (estadoRendicion(sedeId, periodo) !== 'abierta') {
    throw new ErrorNegocio(`La rendición de ${nombrePeriodo(periodo)} ya está cerrada: no se puede cargar ni modificar nada de ese mes. Si hace falta corregir, la Central tiene que reabrir el período.`, 409, 'PERIODO_CERRADO');
  }
}

// Clasifica el gasto o explica por qué no se puede registrar sin solicitud.
function clasificar({ rubro, medio, bruto, fecha, solicitud }) {
  if (solicitud) return 'con_solicitud';
  if (rubro.fijo) return 'fijo';
  const r = reglas(fecha);
  const tope = medio === 'efectivo' ? r.tope_efectivo : r.tope_transferencia;
  if (bruto <= tope) return 'caja_chica';
  throw new ErrorNegocio(
    `Este gasto supera el tope de caja chica (${fmtPesos(tope)} ${medio === 'efectivo' ? 'en efectivo' : 'por transferencia'}). ` +
    'Necesita una solicitud aprobada por la Sede Central antes de pagarlo.', 409, 'NECESITA_SOLICITUD', { tope });
}

// ── Duplicados ──────────────────────────────────────────────────────────────
const qDupCae = db.prepare(`SELECT g.*, s.nombre AS sede_nombre FROM gastos g JOIN sedes s ON s.id = g.sede_id WHERE g.cae = ? AND g.estado = 'registrado'`);
const qDupNum = db.prepare(`SELECT g.*, s.nombre AS sede_nombre FROM gastos g JOIN sedes s ON s.id = g.sede_id
  WHERE g.proveedor_id = ? AND g.tipo_comprobante = ? AND g.punto_venta = ? AND g.numero = ? AND g.estado = 'registrado'`);

function buscarDuplicado(c, excluirId = null) {
  if (c.cae) {
    const g = qDupCae.get(c.cae);
    if (g && g.id !== excluirId) return { clave: 'cae', valor: c.cae, gasto: g };
  }
  if (c.punto_venta != null && c.numero != null) {
    const g = qDupNum.get(c.proveedor_id, c.tipo_comprobante, c.punto_venta, c.numero);
    if (g && g.id !== excluirId) return { clave: 'numero', valor: `${c.tipo_comprobante} ${c.punto_venta}-${c.numero}`, gasto: g };
  }
  return null;
}

// El intento queda registrado en su propia transacción (el rechazo no lo borra).
const registrarIntento = db.transaction((actor, sedeId, dup, datos) => {
  const id = Number(db.prepare(`INSERT INTO intentos_duplicado (sede_id, usuario_id, ip, clave, valor, gasto_existente_id, datos) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(sedeId, actor.id, actor.ip ?? null, dup.clave, dup.valor, dup.gasto.id, JSON.stringify(datos)).lastInsertRowid);
  auditar(actor, { accion: 'gasto.duplicado_rechazado', sedeId, entidad: 'intento_duplicado', entidadId: id, despues: { clave: dup.clave, valor: dup.valor, gasto_existente_id: dup.gasto.id } });
  notificar({ sedeId }, {
    permiso: 'gastos.corregir', tipo: 'mal', link: `#/gastos/${dup.gasto.id}`, excepto: null,
    texto: `Se rechazó un comprobante repetido (${dup.clave === 'cae' ? `CAE ${dup.valor}` : dup.valor}): ya estaba cargado como gasto #${dup.gasto.id}.`
  });
  return id;
});

function mensajeDuplicado(dup) {
  const g = dup.gasto;
  const que = dup.clave === 'cae' ? `con el CAE ${dup.valor}` : `con ese número (${dup.valor.replace(/^\w+ /, '')})`;
  return `Este comprobante ya está cargado ${que}: gasto #${g.id} de ${g.sede_nombre}, del ${fmtFechaCorta(g.fecha_pago)}, por ${fmtPesos(g.bruto)}. No se registró de nuevo y quedó constancia del intento.`;
}

// ── Validación del comprobante (común a alta y corrección) ──────────────────
function leerComprobante(datos) {
  const tipo_comprobante = datos.tipo_comprobante;
  if (!TIPOS_COMPROBANTE[tipo_comprobante]) throw new ErrorNegocio('Elegí el tipo de comprobante');
  const entero = (v, max) => {
    if (v == null || v === '') return null;
    const n = Number(soloDigitos(v));
    if (!Number.isSafeInteger(n) || n <= 0 || n > max) throw new ErrorNegocio('El punto de venta o el número del comprobante no son válidos');
    return n;
  };
  const punto_venta = entero(datos.punto_venta, 99999);
  const numero = entero(datos.numero, 99999999);
  if (tipo_comprobante.startsWith('factura') && (punto_venta == null || numero == null)) {
    throw new ErrorNegocio('En una factura completá el punto de venta y el número');
  }
  let cae = null;
  if (datos.cae != null && String(datos.cae).trim() !== '') {
    cae = validarCae(datos.cae);
    if (!cae) throw new ErrorNegocio('El CAE tiene 14 números. Si el comprobante no tiene CAE, dejalo vacío.');
  }
  const fecha_comprobante = datos.fecha_comprobante ? (esFecha(datos.fecha_comprobante) ? datos.fecha_comprobante : (() => { throw new ErrorNegocio('La fecha del comprobante no es válida'); })()) : null;
  const cae_vto = cae && datos.cae_vto ? (esFecha(datos.cae_vto) ? datos.cae_vto : (() => { throw new ErrorNegocio('El vencimiento del CAE no es válido'); })()) : null;
  let cuit_receptor = null;
  if (datos.cuit_receptor != null && String(datos.cuit_receptor).trim() !== '') {
    cuit_receptor = validarCuit(datos.cuit_receptor);
    if (!cuit_receptor) throw new ErrorNegocio('El CUIT receptor no es válido');
  }
  return { tipo_comprobante, punto_venta, numero, cae, cae_vto, fecha_comprobante, cuit_receptor };
}

// Advertencias: no bloquean, quedan registradas en el gasto.
function advertir(c, { bruto, fecha_pago, solicitud }) {
  const out = [];
  const cuitCirculo = getConfig().circulo_cuit;
  if (c.cuit_receptor && cuitCirculo && c.cuit_receptor !== cuitCirculo) out.push(`El CUIT receptor (${fmtCuit(c.cuit_receptor)}) no es el del Círculo (${fmtCuit(cuitCirculo)}).`);
  if (c.cae_vto && c.fecha_comprobante && c.cae_vto < c.fecha_comprobante) out.push('El CAE estaba vencido a la fecha del comprobante.');
  if (c.fecha_comprobante && c.fecha_comprobante > fecha_pago) out.push('La fecha del comprobante es posterior a la del pago.');
  if (solicitud && bruto > solicitud.monto_estimado) out.push(`El gasto supera el monto estimado de la solicitud (${fmtPesos(solicitud.monto_estimado)}).`);
  return out;
}

function solicitudParaPagar(id, sedeId, pagadoPor) {
  const s = db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(Number(id));
  if (!s || s.sede_id !== sedeId) throw new ErrorNegocio('La solicitud no es de esta sede');
  if (s.estado === 'ejecutada') throw new ErrorNegocio('Esa solicitud ya se pagó');
  if (s.estado !== 'aprobada') throw new ErrorNegocio('La solicitud todavía no está aprobada por la Sede Central', 409, 'SOLICITUD_NO_APROBADA');
  if (s.quien_paga !== pagadoPor) {
    throw new ErrorNegocio(s.quien_paga === 'central' ? 'Esta solicitud la paga la Sede Central directo al proveedor.' : 'Esta solicitud la paga la sede con su fondo.', 409);
  }
  return s;
}

// ── Retenciones ─────────────────────────────────────────────────────────────
// A VALIDAR CON EL CONTADOR: el cálculo es base × alícuota de la tabla de configuración, nada más.
function leerRetenciones(lista, { bruto, fecha, actor }) {
  const items = Array.isArray(lista) ? lista : [];
  const r = reglas(fecha);
  if (bruto <= r.umbral_retencion) {
    if (items.length) throw new ErrorNegocio(`Las retenciones se registran en pagos de más de ${fmtPesos(r.umbral_retencion)}`);
    return [];
  }
  acceso.exigir(actor, 'gastos.retenciones',
    `Los pagos de más de ${fmtPesos(r.umbral_retencion)} llevan control de retenciones: los registra el administrativo o el jefe de sede.`);
  const vistos = new Set();
  return items.map(it => {
    const a = db.prepare('SELECT * FROM alicuotas WHERE id = ? AND activa = 1').get(Number(it.alicuota_id));
    if (!a || a.impuesto !== it.impuesto) throw new ErrorNegocio('Elegí el régimen de cada retención tildada');
    if (a.vigente_desde > fecha) throw new ErrorNegocio(`El régimen "${a.regimen}" todavía no estaba vigente a la fecha del pago`);
    if (vistos.has(a.impuesto)) throw new ErrorNegocio('Cada impuesto se retiene una sola vez por pago');
    vistos.add(a.impuesto);
    const base = it.base == null || it.base === '' ? bruto : centavos(it.base);
    if (!base || base > bruto) throw new ErrorNegocio('La base de la retención tiene que ser mayor que cero y no superar el importe del comprobante');
    return { impuesto: a.impuesto, alicuota_id: a.id, regimen: a.regimen, jurisdiccion: a.jurisdiccion, base, alicuota: a.alicuota, importe: importeRetencion(base, a.alicuota) };
  });
}

function datosAgente() {
  const c = getConfig();
  return { razon_social: c.circulo_razon_social, cuit: c.circulo_cuit || null, domicilio: c.circulo_domicilio || null };
}

// ── Alta ────────────────────────────────────────────────────────────────────
function prepararAlta(actor, datos) {
  const central = datos.pagado_por === 'central';
  if (central) acceso.exigir(actor, 'gastos.pago_central', 'Sólo la Sede Central registra pagos directos con cargo a una sede');
  else acceso.exigir(actor, 'gastos.cargar');
  const sede = acceso.sedeOperativa(central ? datos.sede_id : acceso.sedeDe(actor, datos.sede_id));
  if (!central) acceso.exigirSede(actor, sede.id);
  const pagado_por = central ? 'central' : 'sede';

  const fecha_pago = datos.fecha_pago || hoy();
  if (!esFecha(fecha_pago)) throw new ErrorNegocio('La fecha de pago no es válida');
  if (fecha_pago > hoy()) throw new ErrorNegocio('La fecha de pago no puede ser futura');
  const periodo = periodoDe(fecha_pago);
  exigirPeriodoAbierto(sede.id, periodo);

  const proveedor = proveedores.porId(datos.proveedor_id);
  if (!proveedor) throw new ErrorNegocio('Elegí el proveedor (o dalo de alta)');
  if (!proveedor.activo) throw new ErrorNegocio(`${proveedor.razon_social} está dado de baja`);

  const bruto = centavos(datos.bruto);
  if (!bruto) throw new ErrorNegocio('Indicá el importe del comprobante');
  const medio = central ? 'transferencia' : datos.medio;
  if (!MEDIOS[medio]) throw new ErrorNegocio('Elegí si se pagó por transferencia o en efectivo');

  const rubro = admin.rubroImputable(datos.rubro_id);
  const comprobante = { ...leerComprobante(datos), proveedor_id: proveedor.id };
  const solicitud = datos.solicitud_id ? solicitudParaPagar(datos.solicitud_id, sede.id, pagado_por) : null;
  const tipo_gasto = clasificar({ rubro, medio, bruto, fecha: fecha_pago, solicitud });
  const retenciones = leerRetenciones(datos.retenciones, { bruto, fecha: fecha_pago, actor });
  const totalRet = retenciones.reduce((s, r) => s + r.importe, 0);
  if (totalRet >= bruto) throw new ErrorNegocio('Las retenciones no pueden igualar o superar el importe del comprobante');

  return {
    sede, proveedor, rubro, solicitud, retenciones,
    fila: {
      sede_id: sede.id, periodo, fecha_pago, ...comprobante,
      advertencias: null, bruto, retenciones: totalRet, neto: bruto - totalRet, rubro_id: rubro.id, tipo_gasto, medio, pagado_por,
      solicitud_id: solicitud?.id ?? null, descripcion: limpiarTexto(datos.descripcion, 500),
      adjunto_estado: datos.adjunto_pendiente && flag('adjuntos') ? 'pendiente' : 'sin', creado_por: actor.id
    }
  };
}

const insertar = db.transaction((actor, p) => {
  const { fila, sede, proveedor, solicitud, retenciones } = p;
  // Saldo: la sede no puede pagar más de lo que tiene en la subcuenta; la Central, más de lo que tiene.
  if (fila.pagado_por === 'sede') {
    const disponible = libro.saldo(sede.id, fila.medio === 'efectivo' ? 'efectivo' : 'banco');
    if (fila.bruto > disponible) {
      throw new ErrorNegocio(fila.medio === 'efectivo'
        ? `En efectivo hay ${fmtPesos(disponible)} registrados. Si sacaste plata del banco, registrá primero la extracción.`
        : `En el banco hay ${fmtPesos(disponible)}. Si hacen falta más fondos, pedí fondos extra a la Central.`, 409, 'SALDO_INSUFICIENTE');
    }
  } else {
    exigirSaldoCentral(fila.bruto);
  }

  const advertencias = advertir(fila, { bruto: fila.bruto, fecha_pago: fila.fecha_pago, solicitud });
  fila.advertencias = advertencias.length ? JSON.stringify(advertencias) : null;
  const id = Number(db.prepare(`INSERT INTO gastos (sede_id, periodo, fecha_pago, proveedor_id, tipo_comprobante, punto_venta, numero, fecha_comprobante, cae, cae_vto,
      cuit_receptor, advertencias, bruto, retenciones, neto, rubro_id, tipo_gasto, medio, pagado_por, solicitud_id, descripcion, adjunto_estado, creado_por)
    VALUES (@sede_id, @periodo, @fecha_pago, @proveedor_id, @tipo_comprobante, @punto_venta, @numero, @fecha_comprobante, @cae, @cae_vto,
      @cuit_receptor, @advertencias, @bruto, @retenciones, @neto, @rubro_id, @tipo_gasto, @medio, @pagado_por, @solicitud_id, @descripcion, @adjunto_estado, @creado_por)`)
    .run(fila).lastInsertRowid);

  const comp = `${TIPOS_COMPROBANTE[fila.tipo_comprobante]}${fila.numero ? ` ${String(fila.punto_venta).padStart(4, '0')}-${String(fila.numero).padStart(8, '0')}` : ''}`;
  if (fila.pagado_por === 'sede') {
    libro.registrar({ sede_id: sede.id, cuenta: fila.medio === 'efectivo' ? 'efectivo' : 'banco', periodo: fila.periodo, fecha: fila.fecha_pago, tipo: 'gasto',
      concepto: `Gasto #${id} · ${proveedor.razon_social} · ${comp}`, importe: -fila.bruto, gasto_id: id, creado_por: actor.id });
  } else {
    const central = db.prepare('SELECT id FROM sedes WHERE es_central = 1').get();
    libro.registrar({ sede_id: central.id, cuenta: 'banco', periodo: fila.periodo, fecha: fila.fecha_pago, tipo: 'pago_central',
      concepto: `Pago directo con cargo a ${sede.nombre} · gasto #${id} · ${proveedor.razon_social} · ${comp}`, importe: -fila.bruto, gasto_id: id, creado_por: actor.id });
  }

  let certificadoId = null;
  if (retenciones.length) {
    const insRet = db.prepare(`INSERT INTO retenciones (gasto_id, impuesto, alicuota_id, regimen, jurisdiccion, base, alicuota, importe, tildado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const r of retenciones) insRet.run(id, r.impuesto, r.alicuota_id, r.regimen, r.jurisdiccion, r.base, r.alicuota, r.importe, actor.id);
    const numero = db.prepare('SELECT COALESCE(MAX(numero), 0) + 1 n FROM certificados_retencion').get().n;
    const sujeto = { razon_social: proveedor.razon_social, cuit: proveedor.cuit, domicilio: proveedor.domicilio, condicion_iva: proveedor.condicion_iva };
    certificadoId = Number(db.prepare(`INSERT INTO certificados_retencion (numero, gasto_id, fecha, agente, sujeto, total, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(numero, id, fila.fecha_pago, JSON.stringify(datosAgente()), JSON.stringify(sujeto), fila.retenciones, actor.id).lastInsertRowid);
    auditar(actor, { accion: 'retencion.certificado', sedeId: sede.id, entidad: 'certificado_retencion', entidadId: certificadoId, despues: { numero, gasto_id: id, total: fila.retenciones, retenciones } });
  }

  if (solicitud) {
    db.prepare(`UPDATE solicitudes SET estado = 'ejecutada', gasto_id = ?, actualizado_en = datetime('now') WHERE id = ?`).run(id, solicitud.id);
    db.prepare(`INSERT INTO solicitudes_historial (solicitud_id, de, a, comentario, usuario_id) VALUES (?, 'aprobada', 'ejecutada', ?, ?)`)
      .run(solicitud.id, `Pagada con el gasto #${id}`, actor.id);
  }

  auditar(actor, { accion: 'gasto.alta', sedeId: sede.id, entidad: 'gasto', entidadId: id, despues: { ...fila, retenciones_detalle: retenciones } });
  if (fila.pagado_por === 'central') {
    notificar({ sedeId: sede.id }, { tipo: 'info', link: `#/gastos/${id}`, texto: `La Sede Central pagó ${fmtPesos(fila.bruto)} a ${proveedor.razon_social} con cargo a la sede (gasto #${id}).` });
  }
  return { id, tipo_gasto: fila.tipo_gasto, advertencias, certificado_id: certificadoId };
});

function registrar(actor, datos) {
  const p = prepararAlta(actor, datos);
  const dup = buscarDuplicado(p.fila);
  if (dup) {
    registrarIntento(actor, p.sede.id, dup, { ...p.fila, proveedor: p.proveedor.razon_social });
    throw new ErrorNegocio(mensajeDuplicado(dup), 409, 'DUPLICADO', { gasto_id: dup.gasto.id });
  }
  try {
    return insertar(actor, p);
  } catch (e) {
    // Dos cargas simultáneas del mismo comprobante: la segunda choca contra el índice único.
    if (/UNIQUE constraint failed: gastos\.(cae|proveedor_id)/.test(e.message)) {
      const otra = buscarDuplicado(p.fila);
      if (otra) {
        registrarIntento(actor, p.sede.id, otra, { ...p.fila, proveedor: p.proveedor.razon_social });
        throw new ErrorNegocio(mensajeDuplicado(otra), 409, 'DUPLICADO', { gasto_id: otra.gasto.id });
      }
    }
    if (/Período cerrado/.test(e.message)) throw new ErrorNegocio(e.message, 409, 'PERIODO_CERRADO');
    throw e;
  }
}

// ── Lectura ─────────────────────────────────────────────────────────────────
const SELECT_GASTO = `SELECT g.*, s.nombre AS sede_nombre, p.razon_social AS proveedor, p.cuit AS proveedor_cuit,
    r.nombre AS rubro_nombre, rp.nombre AS rubro_padre, COALESCE(rp.id, r.id) AS rubro_principal_id, r.es_nd,
    u.nombre || ' ' || u.apellido AS creado_por_nombre, c.numero AS certificado_numero, c.id AS certificado_id
  FROM gastos g JOIN sedes s ON s.id = g.sede_id JOIN proveedores p ON p.id = g.proveedor_id
  JOIN rubros r ON r.id = g.rubro_id LEFT JOIN rubros rp ON rp.id = r.padre_id
  JOIN usuarios u ON u.id = g.creado_por LEFT JOIN certificados_retencion c ON c.gasto_id = g.id`;

function presentar(g) {
  return {
    ...g,
    rubro_completo: g.rubro_padre ? `${g.rubro_padre} › ${g.rubro_nombre}` : g.rubro_nombre,
    comprobante: `${TIPOS_COMPROBANTE[g.tipo_comprobante]}${g.numero ? ` ${String(g.punto_venta).padStart(4, '0')}-${String(g.numero).padStart(8, '0')}` : ''}`,
    advertencias: g.advertencias ? JSON.parse(g.advertencias) : [],
    sin_cae: !g.cae
  };
}

function listar(actor, { sede_id, periodo, estado, q, pagado_por } = {}) {
  const w = []; const args = [];
  if (acceso.veTodas(actor)) { if (sede_id) { w.push('g.sede_id = ?'); args.push(Number(sede_id)); } }
  else { w.push('g.sede_id = ?'); args.push(actor.sede_id); }
  if (periodo) { w.push('g.periodo = ?'); args.push(periodo); }
  if (estado) { w.push('g.estado = ?'); args.push(estado); }
  if (pagado_por) { w.push('g.pagado_por = ?'); args.push(pagado_por); }
  if (q) { w.push('(p.razon_social LIKE ? OR p.cuit LIKE ? OR g.cae LIKE ? OR g.descripcion LIKE ? OR CAST(g.numero AS TEXT) LIKE ?)'); const l = `%${q}%`; args.push(l, l, l, l, l); }
  return db.prepare(`${SELECT_GASTO} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY g.fecha_pago DESC, g.id DESC LIMIT 500`).all(...args).map(presentar);
}

function detalle(actor, id) {
  const g = db.prepare(`${SELECT_GASTO} WHERE g.id = ?`).get(Number(id));
  if (!g) throw new ErrorNegocio('Gasto inexistente', 404);
  acceso.exigirSede(actor, g.sede_id);
  return {
    gasto: { ...presentar(g), estado_rendicion: estadoRendicion(g.sede_id, g.periodo) },
    retenciones: db.prepare(`SELECT r.*, u.nombre || ' ' || u.apellido AS tildado_por_nombre FROM retenciones r JOIN usuarios u ON u.id = r.tildado_por WHERE gasto_id = ? ORDER BY r.id`).all(g.id),
    solicitud: g.solicitud_id ? db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(g.solicitud_id) : null,
    movimientos: db.prepare('SELECT * FROM movimientos WHERE gasto_id = ? ORDER BY id').all(g.id),
    adjuntos: db.prepare(`SELECT id, nombre, mime, bytes, subido_en FROM adjuntos WHERE entidad = 'gasto' AND entidad_id = ? AND activo = 1`).all(g.id),
    historial: db.prepare(`SELECT a.id, a.accion, a.motivo, a.antes, a.despues, a.creado_en, a.ip, u.nombre || ' ' || u.apellido AS usuario
      FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id WHERE a.entidad = 'gasto' AND a.entidad_id = ? ORDER BY a.id`).all(g.id)
  };
}

function exigirCorregible(actor, g) {
  acceso.exigir(actor, 'gastos.corregir');
  acceso.exigirSede(actor, g.sede_id);
  if (g.pagado_por === 'central') acceso.exigir(actor, 'gastos.pago_central', 'Los pagos directos de la Central sólo los corrige la Central');
  if (g.estado !== 'registrado') throw new ErrorNegocio('Ese gasto está anulado');
  exigirPeriodoAbierto(g.sede_id, g.periodo);
}

// ── Anulación ───────────────────────────────────────────────────────────────
const anular = db.transaction((actor, id, motivo) => {
  const g = db.prepare('SELECT * FROM gastos WHERE id = ?').get(Number(id));
  if (!g) throw new ErrorNegocio('Gasto inexistente', 404);
  exigirCorregible(actor, g);
  motivo = limpiarTexto(motivo, 300);
  if (!motivo) throw new ErrorNegocio('Indicá el motivo de la anulación');
  // El contraasiento va al mismo período del gasto: el saldo de ese mes queda como si no hubiera existido.
  libro.anularDe({ gastoId: g.id }, `gasto anulado: ${motivo}`, actor.id);
  db.prepare(`UPDATE gastos SET estado = 'anulado', motivo_anulacion = ?, anulado_por = ?, anulado_en = datetime('now'), actualizado_en = datetime('now') WHERE id = ?`).run(motivo, actor.id, g.id);
  db.prepare(`UPDATE certificados_retencion SET anulado = 1, motivo_anulacion = ? WHERE gasto_id = ?`).run(motivo, g.id);
  if (g.solicitud_id) {
    // La solicitud vuelve a quedar aprobada, para pagarla bien.
    db.prepare(`UPDATE solicitudes SET estado = 'aprobada', gasto_id = NULL, actualizado_en = datetime('now') WHERE id = ?`).run(g.solicitud_id);
    db.prepare(`INSERT INTO solicitudes_historial (solicitud_id, de, a, comentario, usuario_id) VALUES (?, 'ejecutada', 'aprobada', ?, ?)`)
      .run(g.solicitud_id, `Se anuló el gasto #${g.id}: ${motivo}`, actor.id);
  }
  auditar(actor, { accion: 'gasto.anulacion', sedeId: g.sede_id, entidad: 'gasto', entidadId: g.id, antes: { estado: 'registrado' }, despues: { estado: 'anulado' }, motivo });
});

// ── Corrección (sólo datos descriptivos; lo que mueve plata se anula y se recarga) ──
const corregir = db.transaction((actor, id, datos) => {
  const g = db.prepare('SELECT * FROM gastos WHERE id = ?').get(Number(id));
  if (!g) throw new ErrorNegocio('Gasto inexistente', 404);
  exigirCorregible(actor, g);
  const motivo = limpiarTexto(datos.motivo, 300);
  if (!motivo) throw new ErrorNegocio('Indicá el motivo de la corrección');
  const comprobante = leerComprobante({ ...g, ...datos });
  const nuevo = {
    ...comprobante,
    rubro_id: datos.rubro_id ? admin.rubroImputable(datos.rubro_id).id : g.rubro_id,
    descripcion: datos.descripcion === undefined ? g.descripcion : limpiarTexto(datos.descripcion, 500)
  };
  const rubro = admin.rubroImputable(nuevo.rubro_id);
  const solicitud = g.solicitud_id ? db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(g.solicitud_id) : null;
  let tipo_gasto;
  try {
    tipo_gasto = clasificar({ rubro, medio: g.medio, bruto: g.bruto, fecha: g.fecha_pago, solicitud });
  } catch (e) {
    if (e.codigo === 'NECESITA_SOLICITUD') throw new ErrorNegocio('Con ese rubro el gasto dejaría de ser fijo y supera el tope de caja chica: necesitaría una solicitud aprobada. Anulalo y cargalo de nuevo con la solicitud.', 409);
    throw e;
  }
  const dup = buscarDuplicado({ ...nuevo, proveedor_id: g.proveedor_id }, g.id);
  if (dup) {
    registrarIntento(actor, g.sede_id, dup, { ...nuevo, corrige_gasto: g.id });
    throw new ErrorNegocio(mensajeDuplicado(dup), 409, 'DUPLICADO', { gasto_id: dup.gasto.id });
  }
  const advertencias = advertir(nuevo, { bruto: g.bruto, fecha_pago: g.fecha_pago, solicitud });
  const campos = ['tipo_comprobante', 'punto_venta', 'numero', 'fecha_comprobante', 'cae', 'cae_vto', 'cuit_receptor', 'rubro_id', 'descripcion'];
  const antes = Object.fromEntries(campos.map(k => [k, g[k]]).concat([['tipo_gasto', g.tipo_gasto]]));
  const despues = Object.fromEntries(campos.map(k => [k, nuevo[k]]).concat([['tipo_gasto', tipo_gasto]]));
  if (JSON.stringify(antes) === JSON.stringify(despues)) throw new ErrorNegocio('No hay cambios para guardar');
  db.prepare(`UPDATE gastos SET tipo_comprobante=@tipo_comprobante, punto_venta=@punto_venta, numero=@numero, fecha_comprobante=@fecha_comprobante,
      cae=@cae, cae_vto=@cae_vto, cuit_receptor=@cuit_receptor, rubro_id=@rubro_id, descripcion=@descripcion, tipo_gasto=@tipo_gasto,
      advertencias=@advertencias, actualizado_en=datetime('now') WHERE id=@id`)
    .run({ ...despues, advertencias: advertencias.length ? JSON.stringify(advertencias) : null, id: g.id });
  auditar(actor, { accion: 'gasto.correccion', sedeId: g.sede_id, entidad: 'gasto', entidadId: g.id, antes, despues, motivo });
});

function marcarAdjunto(id, estado) {
  db.prepare('UPDATE gastos SET adjunto_estado = ? WHERE id = ?').run(estado, Number(id));
}

function intentosDuplicado(actor, { sede_id } = {}) {
  const w = []; const args = [];
  if (!acceso.veTodas(actor)) { w.push('i.sede_id = ?'); args.push(actor.sede_id); } else if (sede_id) { w.push('i.sede_id = ?'); args.push(Number(sede_id)); }
  return db.prepare(`SELECT i.*, s.nombre AS sede_nombre, u.nombre || ' ' || u.apellido AS usuario FROM intentos_duplicado i
    LEFT JOIN sedes s ON s.id = i.sede_id LEFT JOIN usuarios u ON u.id = i.usuario_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY i.id DESC LIMIT 200`).all(...args);
}

module.exports = {
  TIPOS_COMPROBANTE, TIPOS_GASTO, MEDIOS, reglas, clasificar, estadoRendicion, exigirPeriodoAbierto,
  registrar, listar, detalle, anular, corregir, marcarAdjunto, intentosDuplicado, buscarDuplicado
};
