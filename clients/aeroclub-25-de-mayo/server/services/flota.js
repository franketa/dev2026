const { db, auditar } = require('../db');
const { ErrorNegocio, hoy, fechaDeSqlite, periodoActual, esFecha, fmtTac, fmtPesos, importeVuelo, limpiarTexto } = require('../util');

const qTarifa = db.prepare(`
  SELECT * FROM tarifas WHERE avion_id = ? AND tipo = ? AND vigente_desde <= ?
  ORDER BY vigente_desde DESC, id DESC LIMIT 1`);

function tarifaVigente(avionId, tipo, fecha = hoy()) {
  return qTarifa.get(avionId, tipo, fecha) || null;
}

function tarifasVigentes(avionId, fecha = hoy()) {
  const solo = tarifaVigente(avionId, 'solo', fecha);
  const instruccion = tarifaVigente(avionId, 'instruccion', fecha);
  return { solo: solo?.precio_hora ?? null, instruccion: instruccion?.precio_hora ?? null };
}

// Última lectura conocida del tacómetro: la mayor entre la lectura de alta,
// los vuelos no anulados y los tramos justificados por el tesorero.
function tacActual(avionId) {
  return db.prepare(`
    SELECT MAX(v) t FROM (
      SELECT tac_base v FROM aviones WHERE id = @id
      UNION ALL SELECT MAX(tac_final) FROM vuelos WHERE avion_id = @id AND estado <> 'anulado'
      UNION ALL SELECT MAX(hasta) FROM tacometro_justificaciones WHERE avion_id = @id
    )`).get({ id: avionId }).t || 0;
}

function getAvion(id) {
  const a = db.prepare('SELECT * FROM aviones WHERE id = ?').get(id);
  if (!a) throw new ErrorNegocio('Avión inexistente', 404);
  return a;
}

function listarAviones({ incluirInactivos = false } = {}) {
  const periodo = periodoActual();
  const aviones = db.prepare(`SELECT * FROM aviones ${incluirInactivos ? '' : 'WHERE activo = 1'} ORDER BY activo DESC, orden, matricula`).all();
  const qMes = db.prepare(`SELECT COALESCE(SUM(decimas),0) d, COUNT(*) n FROM vuelos WHERE avion_id = ? AND estado <> 'anulado' AND substr(fecha,1,7) = ?`);
  return aviones.map(a => {
    const tac = tacActual(a.id);
    const mes = qMes.get(a.id, periodo);
    return {
      ...a,
      tac_actual: tac,
      tarifas: tarifasVigentes(a.id),
      mes_decimas: mes.d,
      mes_vuelos: mes.n,
      inspeccion_restante: a.proxima_inspeccion != null ? a.proxima_inspeccion - tac : null,
      huecos: continuidad(a.id).huecos.length
    };
  });
}

// Recorre el tacómetro del avión de punta a punta y marca los tramos que nadie cargó.
function continuidad(avionId) {
  const avion = getAvion(avionId);
  const tramos = db.prepare(`
    SELECT 'vuelo' clase, v.id, v.tac_inicial desde, v.tac_final hasta, v.fecha, v.estado,
           u.nombre || ' ' || u.apellido detalle
    FROM vuelos v JOIN usuarios u ON u.id = v.piloto_id
    WHERE v.avion_id = @id AND v.estado <> 'anulado'
    UNION ALL
    SELECT 'justificado', j.id, j.desde, j.hasta, j.creado_en, NULL, j.motivo
    FROM tacometro_justificaciones j WHERE j.avion_id = @id
    ORDER BY desde, hasta`).all({ id: avionId })
    .map(t => (t.clase === 'justificado' ? { ...t, fecha: fechaDeSqlite(t.fecha) } : t));

  const huecos = [];
  let cursor = avion.tac_base;
  let anterior = null;
  for (const t of tramos) {
    if (t.desde > cursor) {
      huecos.push({ desde: cursor, hasta: t.desde, decimas: t.desde - cursor, antes: anterior, despues: t });
    }
    if (t.hasta > cursor) cursor = t.hasta;
    anterior = t;
  }
  return { avion, tac_base: avion.tac_base, tac_actual: cursor, tramos, huecos };
}

function justificarTramo(avionId, input, actor) {
  const avion = getAvion(avionId);
  const desde = Number(input.desde);
  const hasta = Number(input.hasta);
  const motivo = limpiarTexto(input.motivo, 300);
  if (!Number.isInteger(desde) || !Number.isInteger(hasta) || hasta <= desde) throw new ErrorNegocio('Tramo inválido');
  if (!motivo) throw new ErrorNegocio('Indicá el motivo (por ejemplo: vuelo de prueba de mantenimiento)');
  const pisa = db.prepare(`SELECT id FROM vuelos WHERE avion_id = ? AND estado <> 'anulado' AND tac_inicial < ? AND tac_final > ? LIMIT 1`).get(avionId, hasta, desde);
  if (pisa) throw new ErrorNegocio('Ese tramo se superpone con un vuelo cargado');
  db.prepare('INSERT INTO tacometro_justificaciones (avion_id, desde, hasta, motivo, creado_por) VALUES (?, ?, ?, ?, ?)')
    .run(avionId, desde, hasta, motivo, actor.id);
  auditar(actor.id, 'tacometro.justificar', `${avion.matricula} ${fmtTac(desde)} → ${fmtTac(hasta)}: ${motivo}`);
}

function guardarAvion(input, actor, id = null) {
  const matricula = limpiarTexto(input.matricula, 12)?.toUpperCase();
  const modelo = limpiarTexto(input.modelo, 60);
  if (!matricula || !/^[A-Z0-9]{1,3}-?[A-Z0-9]{2,5}$/.test(matricula)) throw new ErrorNegocio('Matrícula inválida (ej: LV-APH)');
  if (!modelo) throw new ErrorNegocio('Indicá el modelo del avión');
  const proxima = input.proxima_inspeccion === '' || input.proxima_inspeccion == null ? null : Number(input.proxima_inspeccion);
  if (proxima != null && (!Number.isInteger(proxima) || proxima < 0)) throw new ErrorNegocio('Próxima inspección inválida');
  const activo = input.activo === false || input.activo === 0 ? 0 : 1;

  if (id == null) {
    const tacBase = Number(input.tac_base ?? 0);
    if (!Number.isInteger(tacBase) || tacBase < 0) throw new ErrorNegocio('Lectura inicial del tacómetro inválida');
    try {
      const r = db.prepare('INSERT INTO aviones (matricula, modelo, tac_base, proxima_inspeccion, orden) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(orden),0)+1 FROM aviones))')
        .run(matricula, modelo, tacBase, proxima);
      auditar(actor.id, 'avion.alta', `${matricula} ${modelo}, tacómetro inicial ${fmtTac(tacBase)}`);
      return Number(r.lastInsertRowid);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw new ErrorNegocio('Ya existe un avión con esa matrícula');
      throw e;
    }
  }

  const antes = getAvion(id);
  // La lectura base sólo se puede corregir mientras el avión no tenga vuelos.
  let tacBase = antes.tac_base;
  if (input.tac_base != null && Number(input.tac_base) !== antes.tac_base) {
    const tieneVuelos = db.prepare(`SELECT 1 FROM vuelos WHERE avion_id = ? AND estado <> 'anulado' LIMIT 1`).get(id);
    if (tieneVuelos) throw new ErrorNegocio('La lectura inicial del tacómetro ya no se puede cambiar: el avión tiene vuelos cargados');
    tacBase = Number(input.tac_base);
    if (!Number.isInteger(tacBase) || tacBase < 0) throw new ErrorNegocio('Lectura inicial del tacómetro inválida');
  }
  db.prepare('UPDATE aviones SET matricula = ?, modelo = ?, tac_base = ?, proxima_inspeccion = ?, activo = ? WHERE id = ?')
    .run(matricula, modelo, tacBase, proxima, activo, id);
  auditar(actor.id, 'avion.edicion', { antes, despues: { matricula, modelo, tac_base: tacBase, proxima_inspeccion: proxima, activo } });
  return id;
}

const nuevaTarifa = db.transaction((avionId, input, actor) => {
  const avion = getAvion(avionId);
  const tipo = input.tipo;
  if (!['solo', 'instruccion'].includes(tipo)) throw new ErrorNegocio('Tipo de tarifa inválido');
  const precio = Number(input.precio_hora);
  if (!Number.isInteger(precio) || precio <= 0) throw new ErrorNegocio('Precio por hora inválido');
  const desde = input.vigente_desde || hoy();
  if (!esFecha(desde)) throw new ErrorNegocio('Fecha de vigencia inválida');

  const r = db.prepare('INSERT INTO tarifas (avion_id, tipo, precio_hora, vigente_desde, creado_por) VALUES (?, ?, ?, ?, ?)')
    .run(avionId, tipo, precio, desde, actor.id);
  const tarifaId = Number(r.lastInsertRowid);
  const etiqueta = tipo === 'solo' ? 'sin instructor' : 'con instructor';
  auditar(actor.id, 'tarifa.alta', `${avion.matricula} ${etiqueta}: ${fmtPesos(precio)}/h desde ${desde}`);

  // Opcional: repreciar los vuelos todavía abiertos a los que ahora les corresponde esta tarifa.
  let repreciados = 0;
  if (input.aplicar_abiertos) {
    const abiertos = db.prepare(`SELECT * FROM vuelos WHERE avion_id = ? AND tipo = ? AND estado = 'abierto' AND fecha >= ?`).all(avionId, tipo, desde);
    const upd = db.prepare(`UPDATE vuelos SET tarifa_id = ?, precio_hora = ?, importe = ?, actualizado_en = datetime('now') WHERE id = ?`);
    const hist = db.prepare(`INSERT INTO vuelos_historial (vuelo_id, accion, antes, despues, usuario_id) VALUES (?, 'retarifa', ?, ?, ?)`);
    for (const v of abiertos) {
      if (tarifaVigente(avionId, tipo, v.fecha)?.id !== tarifaId) continue;
      const importe = importeVuelo(precio, v.decimas);
      upd.run(tarifaId, precio, importe, v.id);
      hist.run(v.id, JSON.stringify({ precio_hora: v.precio_hora, importe: v.importe }), JSON.stringify({ precio_hora: precio, importe }), actor.id);
      repreciados++;
    }
  }
  return { id: tarifaId, repreciados };
});

function historialTarifas(avionId) {
  return db.prepare(`
    SELECT t.*, u.nombre || ' ' || u.apellido autor FROM tarifas t LEFT JOIN usuarios u ON u.id = t.creado_por
    WHERE t.avion_id = ? ORDER BY t.vigente_desde DESC, t.id DESC`).all(avionId);
}

module.exports = { tarifaVigente, tarifasVigentes, tacActual, getAvion, listarAviones, continuidad, justificarTramo, guardarAvion, nuevaTarifa, historialTarifas };
