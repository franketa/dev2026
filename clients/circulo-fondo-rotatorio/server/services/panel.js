// Pantallas de inicio: el panel diario de la Central y el inicio de una sede.

const { db, parametro } = require('../db');
const acceso = require('./acceso');
const fondos = require('./fondos');
const solicitudes = require('./solicitudes');
const rendiciones = require('./rendiciones');
const { ErrorNegocio, hoy, periodoActual, sumarMeses } = require('../util');

// % de N/D sobre lo gastado por una sede en el mes.
function nd(sedeId, periodo) {
  const r = db.prepare(`SELECT COALESCE(SUM(g.bruto),0) total, COALESCE(SUM(CASE WHEN ru.es_nd = 1 THEN g.bruto END),0) nd
    FROM gastos g JOIN rubros ru ON ru.id = g.rubro_id WHERE g.sede_id = ? AND g.periodo = ? AND g.estado = 'registrado'`).get(sedeId, periodo);
  const pct = r.total ? Math.round((r.nd * 1000) / r.total) / 10 : 0;
  return { total: r.total, nd: r.nd, pct, umbral: parametro('umbral_nd_pct', hoy()) };
}

function panelCentral(actor) {
  const permisos = ['solicitudes.resolver', 'solicitudes.resolver_escaladas', 'fondos.autorizar_extra', 'rendiciones.recibidas'];
  if (!permisos.some(p => acceso.puede(actor, p))) throw new ErrorNegocio('El panel diario es de la Sede Central', 403);
  const periodo = periodoActual();
  const inicioHoy = new Date(`${hoy()}T00:00:00-03:00`).toISOString().replace('T', ' ').slice(0, 19);
  const resumen = fondos.resumenCentral(periodo);
  return {
    hoy: hoy(),
    periodo,
    saldo_central: resumen.saldo,
    sedes: resumen.sedes.map(s => ({ ...s, nd: nd(s.id, periodo) })),
    solicitudes_hoy: solicitudes.listar(actor, { desde: inicioHoy }),
    pendientes: solicitudes.listar(actor, { estado: 'pendiente,en_revision' }),
    para_pagar: solicitudes.listar(actor, { estado: 'aprobada' }).filter(s => s.quien_paga === 'central'),
    pedidos: fondos.listarPedidos({ estado: 'pendiente' }),
    rendiciones: { anterior: { periodo: sumarMeses(periodo, -1), sedes: rendiciones.tablero(sumarMeses(periodo, -1)) }, actual: { periodo, sedes: rendiciones.tablero(periodo) } }
  };
}

function inicioSede(actor, periodo = periodoActual()) {
  const sede = acceso.sedeOperativa(actor.sede_id);
  const estado = fondos.estadoSede(sede.id, periodo);
  const anterior = sumarMeses(periodo, -1);
  const rAnterior = db.prepare('SELECT estado FROM rendiciones WHERE sede_id = ? AND periodo = ?').get(sede.id, anterior)?.estado || 'abierta';
  const huboAnterior = db.prepare(`SELECT 1 FROM movimientos WHERE sede_id = ? AND periodo = ? LIMIT 1`).get(sede.id, anterior);
  return {
    sede: { id: sede.id, nombre: sede.nombre },
    periodo,
    ...estado,
    nd: nd(sede.id, periodo),
    rendicion: db.prepare('SELECT estado FROM rendiciones WHERE sede_id = ? AND periodo = ?').get(sede.id, periodo)?.estado || 'abierta',
    // Recordatorio: el mes anterior todavía no se rindió.
    rendicion_pendiente: huboAnterior && ['abierta', 'cerrada_firmada'].includes(rAnterior) ? { periodo: anterior, estado: rAnterior } : null,
    solicitudes: solicitudes.listar(actor, {}).slice(0, 5),
    pedido_pendiente: fondos.listarPedidos({ sedeId: sede.id, estado: 'pendiente' })[0] || null,
    reciente: db.prepare(`SELECT g.id, g.fecha_pago, g.bruto, g.medio, g.pagado_por, g.adjunto_estado, p.razon_social AS proveedor, r.nombre AS rubro
      FROM gastos g JOIN proveedores p ON p.id = g.proveedor_id JOIN rubros r ON r.id = g.rubro_id
      WHERE g.sede_id = ? AND g.estado = 'registrado' ORDER BY g.id DESC LIMIT 5`).all(sede.id)
  };
}

module.exports = { panelCentral, inicioSede, nd };
