// Exportación mensual de liquidaciones para el módulo de facturación de tesorería.
//
// Un archivo por cierre, con una fila por cada concepto del detalle de cada cupón (los datos del cupón y
// del socio se repiten en cada fila). El formato lo definió el club: mismas columnas, en el mismo orden.
// El módulo valida que saldo_anterior + suma de item_importe = total_cupon, así que van todos los
// movimientos del cupón, también los pagos (item_tipo "pago", en negativo): el que factura los filtra.
const cierres = require('./cierres');
const { sinAnuladosDelPeriodo, conceptoDetalle } = require('./pdf');
const { libro } = require('./xlsx');
const { fechaDeSqlite, nombreCompleto } = require('../util');

// Los encabezados grises del modelo son los campos opcionales.
const COLUMNAS = [
  { titulo: 'periodo', ancho: 10 },
  { titulo: 'cupon_numero', ancho: 14 },
  { titulo: 'fecha_cierre', ancho: 13, tipo: 'fecha' },
  { titulo: 'vencimiento', ancho: 13, tipo: 'fecha' },
  { titulo: 'socio_numero', ancho: 13, opcional: true },
  { titulo: 'socio_nombre', ancho: 24 },
  { titulo: 'doc_tipo', ancho: 9 },
  { titulo: 'doc_numero', ancho: 13 },
  { titulo: 'condicion_iva', ancho: 18, opcional: true },
  { titulo: 'email', ancho: 28, opcional: true },
  { titulo: 'saldo_anterior', ancho: 15, tipo: 'importe' },
  { titulo: 'item_fecha', ancho: 12, tipo: 'fecha' },
  { titulo: 'item_tipo', ancho: 10 },
  { titulo: 'item_concepto', ancho: 52 },
  { titulo: 'item_horas', ancho: 11, tipo: 'horas', opcional: true },
  { titulo: 'item_precio_hora', ancho: 16, tipo: 'importe', opcional: true },
  { titulo: 'item_importe', ancho: 14, tipo: 'importe' },
  { titulo: 'total_cupon', ancho: 14, tipo: 'importe' },
  { titulo: 'estado_pago', ancho: 12, opcional: true }
];

const pesos = (centavos) => centavos / 100;

// El sistema guarda un solo documento por persona: con 11 dígitos es un CUIT, si no un DNI.
function documento(dni) {
  const numero = String(dni || '').replace(/\D/g, '');
  return { tipo: !numero ? '' : numero.length === 11 ? 'CUIT' : 'DNI', numero };
}

// Los saldos iniciales y las anulaciones sueltas se informan como ajuste, igual que en el resumen del cupón.
const tipoItem = (m) => (['vuelo', 'servicio', 'pago'].includes(m.clase) ? m.clase : 'ajuste');

function filasDeCierre(cierreId) {
  const { cierre, cupones } = cierres.detalleCierre(cierreId);
  const fechaCierre = fechaDeSqlite(cierre.creado_en);
  const filas = [];
  for (const c of [...cupones].sort((a, b) => a.numero.localeCompare(b.numero))) {
    const { cupon, movimientos } = cierres.datosCupon(c.id);
    const doc = documento(cupon.dni);
    const pagado = cupon.total <= 0 || cierres.restanteDe(cupon) <= 0;
    // Un cupón sin movimientos en el mes (sólo arrastra saldo) no tiene conceptos: no genera filas.
    for (const m of sinAnuladosDelPeriodo(movimientos)) {
      const esVuelo = m.tipo === 'vuelo';
      filas.push([
        cierre.periodo, cupon.numero, fechaCierre, cupon.vencimiento,
        '', nombreCompleto(cupon), doc.tipo, doc.numero, '', cupon.email || '',
        pesos(cupon.saldo_anterior),
        esVuelo ? m.vuelo_fecha : m.fecha, tipoItem(m), conceptoDetalle(m),
        esVuelo ? m.decimas / 10 : '', esVuelo ? pesos(m.precio_hora) : '',
        pesos(m.importe), pesos(cupon.total), pagado ? 'Pagado' : 'Pendiente'
      ]);
    }
  }
  return { cierre, filas };
}

function exportar(cierreId) {
  const { cierre, filas } = filasDeCierre(cierreId);
  return { archivo: `liquidaciones-${cierre.periodo}.xlsx`, contenido: libro({ hoja: 'Liquidaciones', columnas: COLUMNAS, filas }) };
}

module.exports = { exportar, filasDeCierre, COLUMNAS };
