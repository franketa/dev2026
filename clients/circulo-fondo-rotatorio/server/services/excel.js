// Rendición en Excel (.xlsx): resumen, totales por rubro y el detalle plano (con filtros) para trabajarlo.

const ExcelJS = require('exceljs');
const { fmtFechaHora, fmtCuit, nombrePeriodo } = require('../util');

const PESOS = '"$" #,##0.00;[Red]-"$" #,##0.00';
const AZUL = 'FF12406E';
const CELESTE = 'FFE9F3FB';
const TIPO = { fijo: 'Fijo', caja_chica: 'Sin solicitud (caja chica)', con_solicitud: 'Con solicitud' };

function encabezar(fila) {
  fila.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    c.alignment = { vertical: 'middle' };
  });
  fila.height = 20;
}

async function generarRendicion({ contenido: c, version: v, estadoTexto }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Fondo rotatorio · Círculo de Oficiales de la Fuerza Aérea Argentina';
  wb.created = new Date(v.firmado_en);
  const r = c.resumen;

  // ── Resumen ───────────────────────────────────────────────────────────────
  const hr = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
  hr.columns = [{ width: 46 }, { width: 22 }];
  hr.addRow(['Círculo de Oficiales de la Fuerza Aérea Argentina']).font = { bold: true, size: 14, color: { argb: AZUL } };
  hr.addRow([`Rendición del fondo rotatorio · ${c.sede.nombre} · ${nombrePeriodo(c.periodo)}`]).font = { bold: true, size: 12 };
  hr.addRow([`Versión ${v.version} · ${estadoTexto}`]);
  hr.addRow([]);
  const filas = [
    ['Saldo inicial (arrastre)', r.saldo_inicial.total], ['Fondo rotatorio del mes', r.fondo_mensual], ['Fondos extra', r.fondo_extra],
    ['Total recibido', r.fondo_recibido], null,
    ['Pagado por la sede · banco', r.gastado_sede.banco], ['Pagado por la sede · efectivo', r.gastado_sede.efectivo],
    ['Pagado por la Central con cargo a la sede', r.pagado_central], ['Total de gastos', r.total_gastos], ['Retenciones practicadas', r.retenciones], null,
    ['Saldo final · banco', r.saldo_final.banco], ['Saldo final · efectivo', r.saldo_final.efectivo], ['Saldo final total', r.saldo_final.total]
  ];
  for (const f of filas) {
    if (!f) { hr.addRow([]); continue; }
    const row = hr.addRow([f[0], f[1] / 100]);
    row.getCell(2).numFmt = PESOS;
    if (/^Total|total$/.test(f[0])) row.font = { bold: true };
  }
  hr.addRow([]);
  const n = r.cantidades;
  for (const [k, val] of [['Gastos', n.gastos], ['Fijos', n.fijos], ['Caja chica', n.caja_chica], ['Con solicitud', n.con_solicitud], ['Pagados por la Central', n.pagados_central],
    ['Sin CAE', n.sin_cae], ['N/D (sin descripción)', n.nd], ['% N/D sobre lo gastado', r.nd_pct / 100], ['Anulados (no se listan)', n.anulados]]) {
    const row = hr.addRow([k, val]);
    if (k.startsWith('%')) row.getCell(2).numFmt = '0.0%';
  }
  hr.addRow([]);
  hr.addRow(['Firmada por', v.firmado_por_nombre]);
  hr.addRow(['Fecha de firma', fmtFechaHora(v.firmado_en)]);
  if (v.enviado_en) hr.addRow(['Enviada a la Central', fmtFechaHora(v.enviado_en)]);
  hr.addRow(['Hash SHA-256', v.hash]);

  // ── Por rubro ─────────────────────────────────────────────────────────────
  const pr = wb.addWorksheet('Por rubro');
  pr.columns = [{ header: 'Rubro', width: 34 }, { header: 'Subrubro', width: 30 }, { header: 'Importe', width: 20 }];
  encabezar(pr.getRow(1));
  for (const rub of c.por_rubro) {
    const fr = pr.addRow([rub.nombre, '', rub.subtotal / 100]);
    fr.font = { bold: true };
    fr.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CELESTE } }; });
    for (const s of rub.subrubros) pr.addRow(['', s.nombre, s.subtotal / 100]);
  }
  const tot = pr.addRow(['Total', '', r.total_gastos / 100]);
  tot.font = { bold: true };
  pr.getColumn(3).numFmt = PESOS;

  // ── Detalle ───────────────────────────────────────────────────────────────
  const de = wb.addWorksheet('Detalle', { views: [{ state: 'frozen', ySplit: 1 }] });
  de.columns = [
    { header: 'Pagado por', key: 'pagado', width: 22 }, { header: 'Rubro', key: 'rubro', width: 26 }, { header: 'Subrubro', key: 'sub', width: 22 },
    { header: 'Gasto #', key: 'id', width: 9 }, { header: 'Fecha', key: 'fecha', width: 12 }, { header: 'Proveedor', key: 'proveedor', width: 32 },
    { header: 'CUIT', key: 'cuit', width: 15 }, { header: 'Comprobante', key: 'comprobante', width: 24 }, { header: 'CAE', key: 'cae', width: 17 },
    { header: 'Medio', key: 'medio', width: 14 }, { header: 'Tipo de gasto', key: 'tipo', width: 24 }, { header: 'Solicitud', key: 'solicitud', width: 10 },
    { header: 'Importe bruto', key: 'bruto', width: 16 }, { header: 'Retenciones', key: 'ret', width: 14 }, { header: 'Neto', key: 'neto', width: 16 },
    { header: 'Descripción', key: 'desc', width: 40 }
  ];
  encabezar(de.getRow(1));
  const volcar = (rubros, quien) => {
    for (const rub of rubros) for (const s of rub.subrubros) for (const g of s.gastos) {
      de.addRow({
        pagado: quien, rubro: rub.nombre, sub: s.nombre || '', id: g.id, fecha: new Date(`${g.fecha}T12:00:00Z`), proveedor: g.proveedor, cuit: fmtCuit(g.cuit),
        comprobante: g.comprobante, cae: g.cae || 'sin CAE', medio: g.medio === 'efectivo' ? 'Efectivo' : 'Transferencia', tipo: TIPO[g.tipo_gasto],
        solicitud: g.solicitud_id || '', bruto: g.bruto / 100, ret: g.retenciones / 100, neto: g.neto / 100, desc: g.descripcion || ''
      });
    }
  };
  volcar(c.pagado_por_sede, 'La sede');
  volcar(c.pagado_por_central, 'La Central (cargo a la sede)');
  de.getColumn('fecha').numFmt = 'dd/mm/yyyy';
  for (const k of ['bruto', 'ret', 'neto']) de.getColumn(k).numFmt = PESOS;
  de.autoFilter = { from: 'A1', to: 'P1' };

  return wb.xlsx.writeBuffer();
}

module.exports = { generarRendicion };
