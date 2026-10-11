// PDFs: la rendición mensual (listado por rubro, para imprimir y adjuntar a los papeles) y el comprobante
// de retención. Ambos se arman desde datos guardados e inmutables: el mismo documento da siempre lo mismo.

const path = require('path');
const PDFDocument = require('pdfkit');
const { fmtPesos2, fmtFechaCorta, fmtFechaHora, fmtCuit, fmtAlicuota, nombrePeriodo } = require('../util');

const FONTS = path.join(__dirname, '..', 'fonts');

const C = {
  tinta: '#14233F', azul: '#1F4E8C', celeste: '#6CACE4', celesteClaro: '#EAF3FB', gris: '#5B6880',
  linea: '#D6DEE9', fondo: '#F4F7FB', rojo: '#B42318', ambar: '#9A6212'
};
const TNUM = { features: ['tnum'] };
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const MEDIO = { transferencia: 'Transf.', efectivo: 'Efectivo' };
const IMPUESTO = { iva: 'IVA', ganancias: 'Ganancias', suss: 'SUSS', iibb: 'Ingresos Brutos' };
const CONDICION = { ri: 'Responsable inscripto', monotributo: 'Monotributo', exento: 'Exento', no_alcanzado: 'No alcanzado' };

function nuevoDocumento(info, layout = 'portrait') {
  const doc = new PDFDocument({ size: 'A4', layout, margin: 0, bufferPages: true, info });
  doc.registerFont('R', path.join(FONTS, 'Barlow-Regular.ttf'));
  doc.registerFont('M', path.join(FONTS, 'Barlow-Medium.ttf'));
  doc.registerFont('SB', path.join(FONTS, 'Barlow-SemiBold.ttf'));
  doc.registerFont('B', path.join(FONTS, 'Barlow-Bold.ttf'));
  doc.registerFont('C', path.join(FONTS, 'BarlowSemiCondensed-SemiBold.ttf'));
  doc.registerFont('CB', path.join(FONTS, 'BarlowSemiCondensed-Bold.ttf'));
  return doc;
}

// Marca simple: dos alas en chevron (sin usar escudos oficiales).
function marca(doc, x, y, s = 1) {
  doc.save().translate(x, y).scale(s);
  doc.path('M0 14 L18 4 L36 14 L30 14 L18 8 L6 14 Z').fill(C.celeste);
  doc.path('M4 22 L18 13 L32 22 L26 22 L18 17 L10 22 Z').fill('#FFFFFF');
  doc.restore();
}

function banda(doc, { titulo, subtitulo, derecha, derechaSub }) {
  const W = doc.page.width;
  doc.rect(0, 0, W, 70).fill(C.tinta);
  doc.rect(0, 70, W, 3).fill(C.celeste);
  marca(doc, 36, 22, 1.1);
  doc.font('CB').fontSize(16).fillColor('#FFFFFF').text(titulo, 84, 18, { width: W / 2 });
  doc.font('R').fontSize(9.5).fillColor('#BFD3EA').text(subtitulo, 84, 40, { width: W / 2 });
  doc.font('CB').fontSize(15).fillColor('#FFFFFF').text(derecha, W / 2, 18, { width: W / 2 - 36, align: 'right' });
  doc.font('M').fontSize(10).fillColor('#BFD3EA').text(derechaSub, W / 2, 40, { width: W / 2 - 36, align: 'right' });
}

function pie(doc, texto) {
  const rango = doc.bufferedPageRange();
  for (let i = rango.start; i < rango.start + rango.count; i++) {
    doc.switchToPage(i);
    const W = doc.page.width; const H = doc.page.height;
    doc.moveTo(36, H - 30).lineTo(W - 36, H - 30).lineWidth(0.5).strokeColor(C.linea).stroke();
    doc.font('R').fontSize(7.5).fillColor(C.gris).text(texto, 36, H - 24, { width: W - 160, lineBreak: false });
    doc.text(`Página ${i + 1} de ${rango.count}`, W - 136, H - 24, { width: 100, align: 'right', lineBreak: false });
  }
}

// ── Rendición ───────────────────────────────────────────────────────────────
// Columnas del detalle (A4 apaisado, 770 pt útiles).
const COLS = [
  { k: 'fecha', t: 'Fecha', w: 52 },
  { k: 'proveedor', t: 'Proveedor', w: 170 },
  { k: 'cuit', t: 'CUIT', w: 76 },
  { k: 'comprobante', t: 'Comprobante', w: 118 },
  { k: 'cae', t: 'CAE', w: 86 },
  { k: 'medio', t: 'Medio', w: 50 },
  { k: 'tipo', t: 'Tipo', w: 62 },
  { k: 'solicitud', t: 'Solicitud', w: 50 },
  { k: 'importe', t: 'Importe', w: 106, derecha: true }
];
const TIPO_CORTO = { fijo: 'Fijo', caja_chica: 'Caja chica', con_solicitud: 'Con solicitud' };

function generarRendicion({ contenido: c, version: v, rendicion, estadoTexto }) {
  const titulo = `Rendición ${c.sede.nombre} · ${nombrePeriodo(c.periodo)}`;
  const doc = nuevoDocumento({ Title: titulo, Author: 'Círculo de Oficiales de la Fuerza Aérea Argentina', Subject: `Fondo rotatorio · versión ${v.version}` }, 'landscape');
  const W = doc.page.width; const H = doc.page.height; const M = 36; const ancho = W - M * 2;
  const tope = H - 44;

  const cab = () => banda(doc, {
    titulo: 'Círculo de Oficiales de la Fuerza Aérea Argentina',
    subtitulo: 'Fondo rotatorio · Rendición mensual de gastos',
    derecha: `${c.sede.nombre} · ${capital(c.nombre_periodo)}`,
    derechaSub: `Versión ${v.version} · ${estadoTexto}`
  });
  cab();
  let y = 90;
  const saltoSi = (alto) => { if (y + alto > tope) { doc.addPage(); cab(); y = 90; return true; } return false; };

  // Resumen en tres columnas.
  const r = c.resumen;
  const bloques = [
    ['Fondos del mes', [
      ['Saldo inicial (arrastre)', r.saldo_inicial.total], ['Fondo rotatorio', r.fondo_mensual], ['Fondos extra', r.fondo_extra], ['Total recibido', r.fondo_recibido, true]
    ]],
    ['Gastos', [
      ['Pagado por la sede · banco', r.gastado_sede.banco], ['Pagado por la sede · efectivo', r.gastado_sede.efectivo],
      ['Pagado por la Central con cargo a la sede', r.pagado_central], ['Total de gastos', r.total_gastos, true]
    ]],
    ['Saldo al cierre', [
      ['Banco', r.saldo_final.banco], ['Efectivo', r.saldo_final.efectivo], ['Retenciones practicadas', r.retenciones], ['Saldo total', r.saldo_final.total, true]
    ]]
  ];
  const bw = (ancho - 24) / 3;
  bloques.forEach(([t, filas], i) => {
    const x = M + i * (bw + 12);
    doc.roundedRect(x, y, bw, 98, 5).fill(C.fondo);
    doc.font('CB').fontSize(11).fillColor(C.azul).text(t, x + 12, y + 9);
    filas.forEach(([k, val, fuerte], j) => {
      const fy = y + 28 + j * 16;
      doc.font(fuerte ? 'SB' : 'R').fontSize(9).fillColor(fuerte ? C.tinta : C.gris).text(k, x + 12, fy, { width: bw - 120 });
      doc.font(fuerte ? 'B' : 'M').fontSize(9.5).fillColor(C.tinta).text(fmtPesos2(val), x + bw - 122, fy - 0.5, { width: 110, align: 'right', ...TNUM });
    });
  });
  y += 108;
  const n = r.cantidades;
  doc.font('R').fontSize(8.5).fillColor(C.gris).text(
    `${n.gastos} gastos (${n.fijos} fijos · ${n.caja_chica} de caja chica · ${n.con_solicitud} con solicitud · ${n.pagados_central} pagados por la Central) · ` +
    `${n.sin_cae} sin CAE · ${n.nd} sin descripción (N/D, ${String(r.nd_pct).replace('.', ',')} %) · ${n.anulados} anulados (no se listan)`, M, y, { width: ancho });
  y += 20;

  // Resumen por rubro.
  doc.font('CB').fontSize(12).fillColor(C.tinta).text('Resumen por rubro', M, y);
  y += 18;
  for (const rub of c.por_rubro) {
    saltoSi(16 + rub.subrubros.length * 13);
    doc.font('SB').fontSize(9.5).fillColor(C.tinta).text(rub.nombre, M + 4, y, { width: 400 });
    doc.font('B').fontSize(9.5).text(fmtPesos2(rub.subtotal), M + 420, y, { width: 120, align: 'right', ...TNUM });
    y += 14;
    for (const s of rub.subrubros) {
      doc.font('R').fontSize(8.8).fillColor(C.gris).text(s.nombre, M + 20, y, { width: 380 });
      doc.font('M').fontSize(8.8).fillColor(C.tinta).text(fmtPesos2(s.subtotal), M + 420, y, { width: 120, align: 'right', ...TNUM });
      y += 12.5;
    }
    doc.moveTo(M, y + 1).lineTo(M + 540, y + 1).lineWidth(0.4).strokeColor(C.linea).stroke();
    y += 5;
  }
  doc.font('B').fontSize(10).fillColor(C.tinta).text('Total', M + 4, y + 2);
  doc.text(fmtPesos2(r.total_gastos), M + 420, y + 2, { width: 120, align: 'right', ...TNUM });
  y += 24;

  // Detalle, separado por quién pagó.
  const encabezado = () => {
    doc.rect(M, y, ancho, 16).fill(C.tinta);
    let x = M + 4;
    for (const col of COLS) {
      doc.font('SB').fontSize(7.8).fillColor('#FFFFFF').text(col.t, x, y + 4.5, { width: col.w - 6, align: col.derecha ? 'right' : 'left', lineBreak: false });
      x += col.w;
    }
    y += 18;
  };
  const seccion = (titulo, rubros, total) => {
    saltoSi(70);
    doc.font('CB').fontSize(13).fillColor(C.azul).text(titulo, M, y);
    y += 18;
    if (!rubros.length) {
      doc.font('R').fontSize(9).fillColor(C.gris).text('Sin gastos.', M, y);
      y += 20;
      return;
    }
    encabezado();
    for (const rub of rubros) {
      if (saltoSi(40)) encabezado();
      doc.rect(M, y, ancho, 15).fill(C.celesteClaro);
      doc.font('SB').fontSize(9).fillColor(C.tinta).text(rub.nombre, M + 4, y + 3.5, { width: 400, lineBreak: false });
      doc.font('B').fontSize(9).text(fmtPesos2(rub.subtotal), M + ancho - 110, y + 3.5, { width: 106, align: 'right', ...TNUM });
      y += 17;
      for (const s of rub.subrubros) {
        if (s.nombre) {
          if (saltoSi(30)) encabezado();
          doc.font('SB').fontSize(8.5).fillColor(C.azul).text(s.nombre, M + 12, y, { width: 400, lineBreak: false });
          doc.font('SB').fontSize(8.5).text(fmtPesos2(s.subtotal), M + ancho - 110, y, { width: 106, align: 'right', ...TNUM });
          y += 13;
        }
        for (const g of s.gastos) {
          const valores = {
            fecha: fmtFechaCorta(g.fecha), proveedor: g.proveedor, cuit: fmtCuit(g.cuit), comprobante: g.comprobante,
            cae: g.cae || 'sin CAE', medio: MEDIO[g.medio], tipo: TIPO_CORTO[g.tipo_gasto], solicitud: g.solicitud_id ? `#${g.solicitud_id}` : '—',
            importe: fmtPesos2(g.bruto)
          };
          const altoDesc = g.descripcion ? 10 : 0;
          if (saltoSi(14 + altoDesc)) encabezado();
          let x = M + 4;
          for (const col of COLS) {
            const sinCae = col.k === 'cae' && !g.cae;
            doc.font(col.k === 'importe' ? 'M' : 'R').fontSize(8).fillColor(sinCae ? C.ambar : C.tinta)
              .text(valores[col.k], x, y, { width: col.w - 6, align: col.derecha ? 'right' : 'left', lineBreak: false, ellipsis: true, ...TNUM });
            x += col.w;
          }
          y += 11;
          if (g.descripcion) {
            doc.font('R').fontSize(7.5).fillColor(C.gris).text(`#${g.id} · ${g.descripcion}${g.retenciones ? ` · Retenciones ${fmtPesos2(g.retenciones)}, neto ${fmtPesos2(g.neto)}` : ''}`, M + 56, y, { width: ancho - 180, lineBreak: false, ellipsis: true });
            y += 10;
          } else if (g.retenciones) {
            doc.font('R').fontSize(7.5).fillColor(C.gris).text(`#${g.id} · Retenciones ${fmtPesos2(g.retenciones)}, neto ${fmtPesos2(g.neto)}`, M + 56, y, { width: ancho - 180, lineBreak: false });
            y += 10;
          }
          doc.moveTo(M, y).lineTo(M + ancho, y).lineWidth(0.3).strokeColor(C.linea).stroke();
          y += 3;
        }
      }
    }
    saltoSi(20);
    doc.font('B').fontSize(10).fillColor(C.tinta).text(`Total ${titulo.toLowerCase()}`, M + 4, y + 3);
    doc.text(fmtPesos2(total), M + ancho - 150, y + 3, { width: 146, align: 'right', ...TNUM });
    y += 26;
  };
  seccion('Pagado por la sede', c.pagado_por_sede, r.gastado_sede.total);
  seccion('Pagado por la Central con cargo a la sede', c.pagado_por_central, r.pagado_central);

  // Totales finales y firma.
  saltoSi(190);
  doc.roundedRect(M, y, ancho, 44, 5).fill(C.fondo);
  const totales = [['Recibido en el mes', r.fondo_recibido], ['Total de gastos', r.total_gastos], ['Saldo en banco', r.saldo_final.banco], ['Saldo en efectivo', r.saldo_final.efectivo], ['Saldo total', r.saldo_final.total]];
  const tw = ancho / totales.length;
  totales.forEach(([k, val], i) => {
    doc.font('R').fontSize(8.5).fillColor(C.gris).text(k, M + i * tw + 12, y + 8, { width: tw - 20 });
    doc.font('B').fontSize(12).fillColor(C.tinta).text(fmtPesos2(val), M + i * tw + 12, y + 21, { width: tw - 20, ...TNUM });
  });
  y += 60;

  doc.font('CB').fontSize(11).fillColor(C.tinta).text('Firma electrónica', M, y);
  doc.font('R').fontSize(8.8).fillColor(C.gris).text(
    `Cerrada y firmada por ${v.firmado_por_nombre} el ${fmtFechaHora(v.firmado_en)}` +
    (v.enviado_en ? ` · Enviada a la Sede Central el ${fmtFechaHora(v.enviado_en)} por ${v.enviado_por_nombre}` : ' · Todavía no enviada a la Sede Central'),
    M, y + 16, { width: 470 });
  doc.font('R').fontSize(7.8).fillColor(C.gris).text('Hash SHA-256 del contenido:', M, y + 44);
  doc.font('M').fontSize(7.8).fillColor(C.tinta).text(v.hash, M, y + 55, { width: 470, ...TNUM });
  doc.font('R').fontSize(7.5).fillColor(C.gris).text('Si un dato de esta rendición se modificara en el sistema, el hash recalculado no coincidiría con éste.', M, y + 68, { width: 470 });

  // Espacio para la firma de puño y letra (va con los papeles físicos).
  const fx = M + 500; const fw = ancho - 500;
  for (const [i, t] of ['Firma', 'Aclaración', 'Sello'].entries()) {
    const ly = y + 30 + i * 36;
    doc.moveTo(fx, ly).lineTo(fx + fw, ly).lineWidth(0.6).strokeColor(C.gris).stroke();
    doc.font('R').fontSize(8).fillColor(C.gris).text(t, fx, ly + 3);
  }

  if (rendicion.estado === 'abierta') {
    // Versión reabierta: queda como antecedente, no es la vigente.
    const rango = doc.bufferedPageRange();
    for (let i = rango.start; i < rango.start + rango.count; i++) {
      doc.switchToPage(i);
      doc.save().rotate(-20, { origin: [W / 2, H / 2] });
      doc.font('CB').fontSize(70).fillColor(C.rojo).fillOpacity(0.12).text('VERSIÓN REABIERTA', 0, H / 2 - 40, { width: W, align: 'center' });
      doc.restore().fillOpacity(1);
    }
  }
  pie(doc, `${titulo} · versión ${v.version} · hash ${v.hash.slice(0, 16)}…`);
  doc.end();
  return doc;
}

// ── Comprobante de retención ────────────────────────────────────────────────
function generarCertificado({ certificado: cert, gasto, retenciones }) {
  const agente = JSON.parse(cert.agente);
  const sujeto = JSON.parse(cert.sujeto);
  const numero = String(cert.numero).padStart(8, '0');
  const doc = nuevoDocumento({ Title: `Comprobante de retención N.º ${numero}`, Author: agente.razon_social });
  const W = doc.page.width; const M = 44; const ancho = W - M * 2;
  banda(doc, { titulo: agente.razon_social, subtitulo: 'Agente de retención', derecha: `Retención N.º ${numero}`, derechaSub: `Fecha ${fmtFechaCorta(cert.fecha)}` });

  let y = 96;
  const caja = (titulo, filas, x, w) => {
    doc.roundedRect(x, y, w, 100, 5).lineWidth(0.8).strokeColor(C.linea).stroke();
    doc.font('CB').fontSize(11).fillColor(C.azul).text(titulo, x + 12, y + 10);
    filas.forEach(([k, v], i) => {
      doc.font('R').fontSize(8.5).fillColor(C.gris).text(k, x + 12, y + 30 + i * 16, { width: 70 });
      doc.font('M').fontSize(9.5).fillColor(C.tinta).text(v || '—', x + 82, y + 29 + i * 16, { width: w - 94, lineBreak: false, ellipsis: true });
    });
  };
  const mitad = (ancho - 14) / 2;
  caja('Agente de retención', [['Razón social', agente.razon_social], ['CUIT', agente.cuit ? fmtCuit(agente.cuit) : 'A completar en Administración'], ['Domicilio', agente.domicilio]], M, mitad);
  caja('Sujeto retenido', [['Razón social', sujeto.razon_social], ['CUIT', fmtCuit(sujeto.cuit)], ['Domicilio', sujeto.domicilio], ['Condición IVA', CONDICION[sujeto.condicion_iva]]], M + mitad + 14, mitad);
  y += 116;

  doc.font('CB').fontSize(11).fillColor(C.tinta).text('Comprobante que origina la retención', M, y);
  y += 16;
  doc.font('R').fontSize(9.5).fillColor(C.tinta).text(`${gasto.comprobante}${gasto.cae ? ` · CAE ${gasto.cae}` : ' · sin CAE'} · fecha ${fmtFechaCorta(gasto.fecha_comprobante || gasto.fecha_pago)} · importe ${fmtPesos2(gasto.bruto)} · ${gasto.sede_nombre} · gasto #${gasto.id}`, M, y, { width: ancho });
  y += 26;

  const cols = [['Impuesto', 90], ['Régimen', 170], ['Jurisdicción', 80], ['Base imponible', 70, true], ['Alícuota', 40, true], ['Importe retenido', 57, true]];
  doc.rect(M, y, ancho, 18).fill(C.tinta);
  let x = M + 6;
  for (const [t, w, der] of cols) { doc.font('SB').fontSize(8.5).fillColor('#FFFFFF').text(t, x, y + 5, { width: w - 6, align: der ? 'right' : 'left' }); x += w; }
  y += 22;
  for (const r of retenciones) {
    const vals = [IMPUESTO[r.impuesto], r.regimen, r.jurisdiccion || '—', fmtPesos2(r.base), fmtAlicuota(r.alicuota), fmtPesos2(r.importe)];
    x = M + 6;
    cols.forEach(([, w, der], i) => { doc.font(i === 5 ? 'SB' : 'R').fontSize(9).fillColor(C.tinta).text(vals[i], x, y, { width: w - 6, align: der ? 'right' : 'left', ...TNUM }); x += w; });
    y += 18;
    doc.moveTo(M, y - 4).lineTo(M + ancho, y - 4).lineWidth(0.4).strokeColor(C.linea).stroke();
  }
  y += 6;
  const totales = [['Importe del comprobante', gasto.bruto], ['Total retenido', cert.total], ['Neto a transferir', gasto.neto]];
  for (const [k, v] of totales) {
    doc.font(k === 'Neto a transferir' ? 'B' : 'R').fontSize(10).fillColor(C.tinta).text(k, M + ancho - 300, y, { width: 170 });
    doc.font('B').text(fmtPesos2(v), M + ancho - 130, y, { width: 130, align: 'right', ...TNUM });
    y += 17;
  }
  y += 30;
  doc.font('R').fontSize(8).fillColor(C.gris).text(
    'Las alícuotas y regímenes salen de la tabla de configuración del sistema. Cálculo: base imponible × alícuota, redondeado al centavo. ' +
    'Pendiente de validación por el contador del Círculo.', M, y, { width: ancho });
  y += 50;
  doc.moveTo(W - M - 200, y).lineTo(W - M, y).lineWidth(0.6).strokeColor(C.gris).stroke();
  doc.font('R').fontSize(8).fillColor(C.gris).text('Firma y sello del agente de retención', W - M - 200, y + 4, { width: 200, align: 'center' });

  if (cert.anulado) {
    doc.save().rotate(-18, { origin: [W / 2, 330] });
    doc.font('CB').fontSize(80).fillColor(C.rojo).fillOpacity(0.15).text('ANULADO', 0, 290, { width: W, align: 'center' });
    doc.restore().fillOpacity(1);
  }
  pie(doc, `Comprobante de retención N.º ${numero} · ${agente.razon_social}`);
  doc.end();
  return doc;
}

module.exports = { generarRendicion, generarCertificado };
