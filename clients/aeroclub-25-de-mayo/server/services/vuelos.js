const { db } = require('../db');
const flota = require('./flota');
const {
  ErrorNegocio, hoy, sumarDias, esFecha, esPeriodo, parseTac, fmtTac, fmtHoras, fmtFechaCorta, importeVuelo, limpiarTexto, periodoDe
} = require('../util');

const DIAS_ATRAS_PILOTO = 60;
const MAX_DECIMAS_PILOTO = 100;   // 10,0 h: más que eso casi seguro es un error de tipeo
const MAX_DECIMAS_ADMIN = 300;

const SELECT_VUELO = `
  SELECT v.*, a.matricula, a.modelo,
         p.nombre || ' ' || p.apellido piloto,
         i.nombre || ' ' || i.apellido instructor,
         c.nombre || ' ' || c.apellido cargado_por_nombre,
         ci.periodo cierre_periodo
  FROM vuelos v
  JOIN aviones a ON a.id = v.avion_id
  JOIN usuarios p ON p.id = v.piloto_id
  LEFT JOIN usuarios i ON i.id = v.instructor_id
  LEFT JOIN usuarios c ON c.id = v.cargado_por
  LEFT JOIN cierres ci ON ci.id = v.cierre_id`;

function getVuelo(id) {
  const v = db.prepare(`${SELECT_VUELO} WHERE v.id = ?`).get(id);
  if (!v) throw new ErrorNegocio('Vuelo inexistente', 404);
  return v;
}

function periodoCerrado(periodo) {
  return !!db.prepare('SELECT 1 FROM cierres WHERE periodo = ?').get(periodo);
}

// Normaliza y valida lo que manda el formulario. Devuelve la fila lista para guardar + avisos.
function armar(input, actor, previo = null) {
  const esAdmin = actor.rol === 'admin';
  const avisos = [];

  let pilotoId = previo ? previo.piloto_id : actor.id;
  if (esAdmin && input.piloto_id != null) pilotoId = Number(input.piloto_id);
  const piloto = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(pilotoId);
  if (!piloto) throw new ErrorNegocio('Piloto inexistente');
  if (!piloto.activo && (!previo || previo.piloto_id !== pilotoId)) throw new ErrorNegocio('Ese piloto está dado de baja');

  const avionId = Number(input.avion_id ?? previo?.avion_id);
  const avion = db.prepare('SELECT * FROM aviones WHERE id = ?').get(avionId);
  if (!avion) throw new ErrorNegocio('Elegí el avión');
  if (!avion.activo && (!previo || previo.avion_id !== avionId)) throw new ErrorNegocio(`${avion.matricula} está fuera de servicio en el sistema`);

  const fecha = input.fecha ?? previo?.fecha;
  if (!esFecha(fecha)) throw new ErrorNegocio('Fecha inválida');
  if (fecha > hoy()) throw new ErrorNegocio('La fecha del vuelo no puede ser futura');
  if (!esAdmin && fecha !== previo?.fecha && fecha < sumarDias(hoy(), -DIAS_ATRAS_PILOTO)) {
    throw new ErrorNegocio(`Sólo podés cargar vuelos de los últimos ${DIAS_ATRAS_PILOTO} días. Para uno más viejo, pedíselo al tesorero.`);
  }

  const tacInicial = input.tac_inicial != null ? parseTac(input.tac_inicial) : previo?.tac_inicial;
  const tacFinal = input.tac_final != null ? parseTac(input.tac_final) : previo?.tac_final;
  if (tacInicial == null) throw new ErrorNegocio('Tacómetro inicial inválido: usá un solo decimal, por ejemplo 2345,6');
  if (tacFinal == null) throw new ErrorNegocio('Tacómetro final inválido: usá un solo decimal, por ejemplo 2346,8');
  if (tacFinal <= tacInicial) throw new ErrorNegocio('El tacómetro final tiene que ser mayor que el inicial');
  const decimas = tacFinal - tacInicial;
  const maxDecimas = esAdmin ? MAX_DECIMAS_ADMIN : MAX_DECIMAS_PILOTO;
  if (decimas > maxDecimas) throw new ErrorNegocio(`${fmtHoras(decimas)} en un solo vuelo parece un error de tipeo. Revisá los números del tacómetro.`);
  if (tacInicial < avion.tac_base) throw new ErrorNegocio(`El tacómetro inicial es menor que la lectura con la que ${avion.matricula} se dio de alta en el sistema (${fmtTac(avion.tac_base)}).`);

  // Mismo tramo del tacómetro cargado dos veces = cobrar dos veces. No se permite.
  const pisa = db.prepare(`
    SELECT v.*, u.nombre || ' ' || u.apellido piloto FROM vuelos v JOIN usuarios u ON u.id = v.piloto_id
    WHERE v.avion_id = ? AND v.estado <> 'anulado' AND v.id <> ? AND v.tac_inicial < ? AND v.tac_final > ?
    LIMIT 1`).get(avionId, previo?.id ?? 0, tacFinal, tacInicial);
  if (pisa) {
    throw new ErrorNegocio(`Ese tramo del tacómetro se superpone con un vuelo ya cargado: ${pisa.piloto}, ${fmtFechaCorta(pisa.fecha)}, de ${fmtTac(pisa.tac_inicial)} a ${fmtTac(pisa.tac_final)}.`, 409);
  }
  const justificado = db.prepare(`SELECT * FROM tacometro_justificaciones WHERE avion_id = ? AND desde < ? AND hasta > ? LIMIT 1`).get(avionId, tacFinal, tacInicial);
  if (justificado) {
    throw new ErrorNegocio(`Ese tramo del tacómetro ya fue registrado por tesorería (${justificado.motivo}).`, 409);
  }

  const conInstructor = input.con_instructor != null ? !!input.con_instructor : previo ? previo.tipo === 'instruccion' : false;
  let instructorId = null;
  if (conInstructor) {
    instructorId = Number(input.instructor_id ?? previo?.instructor_id);
    const inst = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(instructorId);
    if (!inst || !inst.es_instructor) throw new ErrorNegocio('Elegí qué instructor voló con vos');
    if (!inst.activo && previo?.instructor_id !== instructorId) throw new ErrorNegocio('Ese instructor está dado de baja');
    if (instructorId === pilotoId) throw new ErrorNegocio('El instructor no puede ser el mismo piloto que carga el vuelo');
  }
  const tipo = conInstructor ? 'instruccion' : 'solo';

  const tarifa = flota.tarifaVigente(avionId, tipo, fecha);
  if (!tarifa) {
    throw new ErrorNegocio(`Todavía no hay tarifa ${tipo === 'solo' ? 'sin instructor' : 'con instructor'} para ${avion.matricula} en esa fecha. Avisale al tesorero para que la cargue.`);
  }

  const notas = limpiarTexto(input.notas !== undefined ? input.notas : previo?.notas, 1000);

  // Avisos (no bloquean): huecos en el tacómetro y mes ya cerrado.
  const ultimo = db.prepare(`
    SELECT MAX(tac_final) t FROM vuelos WHERE avion_id = ? AND estado <> 'anulado' AND id <> ? AND tac_final <= ?`).get(avionId, previo?.id ?? 0, tacInicial).t;
  const referencia = Math.max(ultimo ?? avion.tac_base, avion.tac_base);
  if (tacInicial > referencia) {
    avisos.push(`Quedan ${fmtHoras(tacInicial - referencia)} del tacómetro sin cargar entre ${fmtTac(referencia)} y ${fmtTac(tacInicial)}. Si no fuiste vos, no pasa nada: tesorería lo va a ver.`);
  }
  if (periodoCerrado(periodoDe(fecha))) {
    avisos.push('Ese mes ya se cerró: el vuelo se va a cobrar en el próximo cupón.');
  }

  return {
    fila: {
      piloto_id: pilotoId, avion_id: avionId, instructor_id: instructorId, fecha,
      tac_inicial: tacInicial, tac_final: tacFinal, decimas, tipo,
      tarifa_id: tarifa.id, precio_hora: tarifa.precio_hora, importe: importeVuelo(tarifa.precio_hora, decimas), notas
    },
    avisos
  };
}

const CAMPOS_HIST = ['piloto_id', 'avion_id', 'instructor_id', 'fecha', 'tac_inicial', 'tac_final', 'decimas', 'tipo', 'precio_hora', 'importe', 'notas'];
function snapshot(v) { const o = {}; for (const k of CAMPOS_HIST) o[k] = v[k]; return o; }

const qHist = db.prepare('INSERT INTO vuelos_historial (vuelo_id, accion, antes, despues, usuario_id) VALUES (?, ?, ?, ?, ?)');

const crear = db.transaction((input, actor) => {
  const { fila, avisos } = armar(input, actor);
  const r = db.prepare(`
    INSERT INTO vuelos (piloto_id, avion_id, instructor_id, fecha, tac_inicial, tac_final, decimas, tipo, tarifa_id, precio_hora, importe, notas, cargado_por)
    VALUES (@piloto_id, @avion_id, @instructor_id, @fecha, @tac_inicial, @tac_final, @decimas, @tipo, @tarifa_id, @precio_hora, @importe, @notas, @cargado_por)`)
    .run({ ...fila, cargado_por: actor.id });
  const id = Number(r.lastInsertRowid);
  qHist.run(id, 'alta', null, JSON.stringify(snapshot(fila)), actor.id);
  return { vuelo: getVuelo(id), avisos };
});

function puedeModificar(v, actor) {
  if (v.estado !== 'abierto') {
    throw new ErrorNegocio(v.estado === 'anulado'
      ? 'Ese vuelo está anulado'
      : 'Ese vuelo ya entró en el cierre del mes. Si hay un error, tesorería lo corrige con un ajuste en tu cuenta.', 409);
  }
  if (actor.rol !== 'admin' && v.piloto_id !== actor.id) throw new ErrorNegocio('Sólo podés modificar tus propios vuelos', 403);
}

const editar = db.transaction((id, input, actor) => {
  const previo = db.prepare('SELECT * FROM vuelos WHERE id = ?').get(id);
  if (!previo) throw new ErrorNegocio('Vuelo inexistente', 404);
  puedeModificar(previo, actor);
  const { fila, avisos } = armar(input, actor, previo);
  db.prepare(`
    UPDATE vuelos SET piloto_id=@piloto_id, avion_id=@avion_id, instructor_id=@instructor_id, fecha=@fecha,
      tac_inicial=@tac_inicial, tac_final=@tac_final, decimas=@decimas, tipo=@tipo, tarifa_id=@tarifa_id,
      precio_hora=@precio_hora, importe=@importe, notas=@notas, actualizado_en=datetime('now')
    WHERE id=@id`).run({ ...fila, id });
  const antes = snapshot(previo);
  const despues = snapshot(fila);
  if (JSON.stringify(antes) !== JSON.stringify(despues)) qHist.run(id, 'edicion', JSON.stringify(antes), JSON.stringify(despues), actor.id);
  return { vuelo: getVuelo(id), avisos };
});

const anular = db.transaction((id, motivo, actor) => {
  const v = db.prepare('SELECT * FROM vuelos WHERE id = ?').get(id);
  if (!v) throw new ErrorNegocio('Vuelo inexistente', 404);
  puedeModificar(v, actor);
  motivo = limpiarTexto(motivo, 300);
  if (!motivo) throw new ErrorNegocio('Contá brevemente por qué se anula (ej: lo cargué dos veces)');
  db.prepare(`UPDATE vuelos SET estado = 'anulado', motivo_anulacion = ?, actualizado_en = datetime('now') WHERE id = ?`).run(motivo, id);
  qHist.run(id, 'anulacion', JSON.stringify(snapshot(v)), JSON.stringify({ motivo }), actor.id);
  return getVuelo(id);
});

function listar(filtros = {}) {
  const where = [];
  const params = {};
  if (filtros.piloto_id) { where.push('v.piloto_id = @piloto_id'); params.piloto_id = Number(filtros.piloto_id); }
  if (filtros.instructor_id) { where.push('v.instructor_id = @instructor_id'); params.instructor_id = Number(filtros.instructor_id); }
  if (filtros.avion_id) { where.push('v.avion_id = @avion_id'); params.avion_id = Number(filtros.avion_id); }
  if (filtros.periodo && esPeriodo(filtros.periodo)) { where.push('substr(v.fecha,1,7) = @periodo'); params.periodo = filtros.periodo; }
  if (filtros.estado && ['abierto', 'cerrado', 'anulado'].includes(filtros.estado)) { where.push('v.estado = @estado'); params.estado = filtros.estado; }
  if (!filtros.incluir_anulados && !filtros.estado) where.push(`v.estado <> 'anulado'`);
  if (filtros.con_notas) where.push(`v.notas IS NOT NULL AND v.notas <> ''`);
  const limite = Math.min(Number(filtros.limite) || 500, 2000);
  return db.prepare(`${SELECT_VUELO} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY v.fecha DESC, v.tac_inicial DESC LIMIT ${limite}`).all(params);
}

function historial(id) {
  return db.prepare(`
    SELECT h.*, u.nombre || ' ' || u.apellido usuario FROM vuelos_historial h LEFT JOIN usuarios u ON u.id = h.usuario_id
    WHERE h.vuelo_id = ? ORDER BY h.id`).all(id);
}

function resumenAbiertos(pilotoId) {
  return db.prepare(`SELECT COUNT(*) vuelos, COALESCE(SUM(decimas),0) decimas, COALESCE(SUM(importe),0) importe
                     FROM vuelos WHERE piloto_id = ? AND estado = 'abierto'`).get(pilotoId);
}

module.exports = { crear, editar, anular, listar, getVuelo, historial, resumenAbiertos, periodoCerrado, puedeModificar };
