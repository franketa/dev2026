// Cupón de pago en PDF. Se genera al vuelo desde datos inmutables (cupón + movimientos del
// rango sellado), así que el mismo cupón siempre produce el mismo contenido.

const path = require('path');
const PDFDocument = require('pdfkit');
const { nombrePeriodo, fmtFechaCorta, fmtHoras, fmtTac } = require('../util');

const FONTS = path.join(__dirname, '..', 'fonts');
const ESCUDO = path.join(__dirname, '..', '..', 'public', 'assets', 'img', 'escudo.png');

// Ala roja del escudo, trazada del logo original (viewBox 0 0 720 720).
const ALA = 'M14 466 L122 461 L170 457 L212 451 L260 439 L302 421 L344 398 L380 375 L446 343 L506 318 L554 302 L560 302 L584 295 L608 291 L656 291 L680 297 L704 312 L710 314 L710 318 L632 317 L572 325 L542 333 L506 346 L470 365 L446 381 L416 407 L368 458 L344 489 L314 533 L272 609 L254 568 L236 536 L212 507 L200 496 L188 489 L176 483 L152 475 L122 470 L86 469 L26 472 L14 470 Z';

const C = {
  tinta: '#172A4F',
  azul: '#3F5C99',
  anillo: '#5F79AD',
  celeste: '#C5DCE4',
  celesteClaro: '#EDF4F7',
  rojo: '#D43B2F',
  gris: '#5C6B84',
  linea: '#D5DEE8',
  verde: '#2E7D55'
};

const pesos = (c) => {
  const abs = Math.abs(c);
  const txt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: abs % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(abs / 100);
  return `${c < 0 ? '-' : ''}$ ${txt}`;
};
const horas = (d) => (d / 10).toFixed(1).replace('.', ',');

function generarCupon({ cupon, movimientos, config, estado }) {
  const doc = new PDFDocument({
    size: 'A4', margin: 0,
    info: { Title: `Cupón ${cupon.numero} · ${config.club_nombre}`, Author: config.club_nombre, Subject: `Resumen de ${nombrePeriodo(cupon.periodo)}` }
  });
  doc.registerFont('R', path.join(FONTS, 'Barlow-Regular.ttf'));
  doc.registerFont('M', path.join(FONTS, 'Barlow-Medium.ttf'));
  doc.registerFont('SB', path.join(FONTS, 'Barlow-SemiBold.ttf'));
  doc.registerFont('B', path.join(FONTS, 'Barlow-Bold.ttf'));
  doc.registerFont('C', path.join(FONTS, 'BarlowSemiCondensed-SemiBold.ttf'));
  doc.registerFont('CB', path.join(FONTS, 'BarlowSemiCondensed-Bold.ttf'));
  const TNUM = { features: ['tnum'] };

  const W = 595.28;
  const M = 44;
  const ancho = W - M * 2;

  // ── Cabecera: banda celeste con el ala del escudo ─────────────────────────────
  doc.rect(0, 0, W, 132).fill(C.celesteClaro);
  doc.save();
  doc.rect(0, 0, W, 132).clip();           // sólo asoma la punta del ala dentro de la banda
  doc.translate(W + 8 - 710 * 0.62, 110 - 305 * 0.62).scale(0.62);
  doc.path(ALA).fill(C.rojo);
  doc.restore();
  doc.image(ESCUDO, M, 30, { width: 72 });
  doc.font('CB').fontSize(21).fillColor(C.tinta).text(config.club_nombre, M + 88, 42, { width: 260 });
  doc.font('R').fontSize(10).fillColor(C.gris).text(config.club_localidad || '', M + 88, 68, { width: 260 });

  doc.font('C').fontSize(10).fillColor(C.gris).text('Cupón de pago', W - M - 170, 36, { width: 170, align: 'right' });
  doc.font('CB').fontSize(20).fillColor(C.tinta).text(`N.º ${cupon.numero}`, W - M - 170, 50, { width: 170, align: 'right', ...TNUM });
  doc.font('M').fontSize(11).fillColor(C.azul).text(capital(nombrePeriodo(cupon.periodo)), W - M - 170, 76, { width: 170, align: 'right' });

  // ── Socio y total ─────────────────────────────────────────────────────────────
  let y = 158;
  doc.font('R').fontSize(9.5).fillColor(C.gris).text('Socio', M, y);
  doc.font('SB').fontSize(15).fillColor(C.tinta).text(`${cupon.nombre} ${cupon.apellido}`, M, y + 13, { width: 290 });
  const datosSocio = [cupon.dni ? `DNI ${cupon.dni}` : null, cupon.email].filter(Boolean).join('   ');
  doc.font('R').fontSize(9.5).fillColor(C.gris).text(datosSocio, M, y + 33, { width: 290 });

  const aPagar = Math.max(cupon.total, 0);
  const cajaX = W - M - 206;
  doc.roundedRect(cajaX, y - 6, 206, 74, 6).fill(C.tinta);
  doc.font('C').fontSize(10).fillColor('#BFD3E6').text(cupon.total < 0 ? 'Saldo a favor' : 'Total a pagar', cajaX + 16, y + 4);
  doc.font('CB').fontSize(26).fillColor('#FFFFFF').text(pesos(cupon.total < 0 ? -cupon.total : aPagar), cajaX + 16, y + 17, { width: 180, ...TNUM });
  doc.font('R').fontSize(9.5).fillColor('#BFD3E6').text(`Vence el ${fmtFechaCorta(cupon.vencimiento)}`, cajaX + 16, y + 50);

  // ── Resumen de cuenta ─────────────────────────────────────────────────────────
  y = 256;
  const filasResumen = [
    ['Saldo del cierre anterior', cupon.saldo_anterior],
    [`Vuelos del período (${horas(cupon.decimas)} h)`, cupon.total_vuelos],
    ['Pagos recibidos', cupon.total_pagos],
    ['Ajustes', cupon.total_ajustes]
  ].filter(([k, v], i) => i < 2 || v !== 0);
  doc.font('CB').fontSize(12).fillColor(C.tinta).text('Resumen de cuenta', M, y);
  y += 22;
  for (const [k, v] of filasResumen) {
    doc.font('R').fontSize(10.5).fillColor(C.tinta).text(k, M, y);
    doc.font('M').fontSize(10.5).text(pesos(v), M, y, { width: ancho, align: 'right', ...TNUM });
    y += 19;
    doc.moveTo(M, y - 5).lineTo(M + ancho, y - 5).lineWidth(0.5).strokeColor(C.linea).stroke();
  }
  doc.font('SB').fontSize(11.5).fillColor(C.tinta).text('Total', M, y + 1);
  doc.font('B').fontSize(11.5).text(pesos(cupon.total), M, y + 1, { width: ancho, align: 'right', ...TNUM });
  y += 34;

  // ── Detalle de movimientos ────────────────────────────────────────────────────
  doc.font('CB').fontSize(12).fillColor(C.tinta).text('Detalle', M, y);
  y += 20;
  const col = { fecha: M, concepto: M + 62, tac: M + 268, horas: M + 356, precio: M + 392, importe: M + 452 };
  const encabezado = () => {
    doc.rect(M, y - 4, ancho, 18).fill(C.celesteClaro);
    doc.font('C').fontSize(8.5).fillColor(C.gris);
    doc.text('Fecha', col.fecha + 6, y);
    doc.text('Concepto', col.concepto, y);
    doc.text('Tacómetro', col.tac, y);
    doc.text('Horas', col.horas - 6, y, { width: 36, align: 'right' });
    doc.text('Precio/h', col.precio, y, { width: 56, align: 'right' });
    doc.text('Importe', col.importe, y, { width: M + ancho - col.importe - 6, align: 'right' });
    y += 20;
  };
  encabezado();

  if (!movimientos.length) {
    doc.font('R').fontSize(10).fillColor(C.gris).text('Sin movimientos en el período.', M + 6, y);
    y += 18;
  }
  for (const m of movimientos) {
    const esVuelo = m.tipo === 'vuelo';
    const concepto = esVuelo
      ? `${m.matricula} ${m.vuelo_tipo === 'instruccion' ? `con instructor ${m.instructor}` : 'sin instructor'}`
      : m.concepto;
    doc.font('R').fontSize(9.5);
    const alto = Math.max(14, doc.heightOfString(concepto, { width: esVuelo ? 200 : 320 }));
    if (y + alto > 700) { doc.addPage(); y = M; encabezado(); }
    doc.fillColor(C.tinta).text(fmtFechaCorta(esVuelo ? m.vuelo_fecha : m.fecha), col.fecha + 6, y, TNUM);
    doc.text(concepto, col.concepto, y, { width: esVuelo ? 200 : 320 });
    if (esVuelo) {
      doc.fillColor(C.gris).text(`${fmtTac(m.tac_inicial)} a ${fmtTac(m.tac_final)}`, col.tac, y, TNUM);
      doc.fillColor(C.tinta).text(horas(m.decimas), col.horas - 6, y, { width: 36, align: 'right', ...TNUM });
      doc.fillColor(C.gris).text(pesos(m.precio_hora), col.precio, y, { width: 56, align: 'right', ...TNUM });
    }
    doc.font('M').fillColor(m.importe < 0 ? C.verde : C.tinta)
      .text(pesos(m.importe), col.importe, y, { width: M + ancho - col.importe - 6, align: 'right', ...TNUM });
    y += alto + 6;
    doc.moveTo(M, y - 4).lineTo(M + ancho, y - 4).lineWidth(0.4).strokeColor(C.linea).stroke();
  }

  // ── Cómo pagar ────────────────────────────────────────────────────────────────
  y += 14;
  if (y > 640) { doc.addPage(); y = M; }
  const alto = 116;
  doc.roundedRect(M, y, ancho, alto, 6).lineWidth(1).strokeColor(C.celeste).stroke();
  doc.rect(M, y, 5, alto).fill(C.rojo);
  doc.font('CB').fontSize(12).fillColor(C.tinta).text('Cómo pagar', M + 20, y + 14);
  doc.font('R').fontSize(9).fillColor(C.gris).text('Alias', M + 20, y + 36);
  doc.font('CB').fontSize(17).fillColor(C.tinta).text(config.pago_alias || 'A confirmar con tesorería', M + 20, y + 47, { width: 250 });
  const datos = [
    ['CBU', config.pago_cbu], ['Titular', config.pago_titular], ['CUIT', config.pago_cuit], ['Banco', config.pago_banco]
  ].filter(([, v]) => v);
  let dy = y + 14;
  for (const [k, v] of datos) {
    doc.font('R').fontSize(9).fillColor(C.gris).text(k, M + 290, dy, { width: 50 });
    doc.font('M').fontSize(10).fillColor(C.tinta).text(v, M + 334, dy - 0.5, { width: ancho - 334 + 0, ...TNUM });
    dy += 17;
  }
  if (config.pago_instrucciones) {
    doc.font('R').fontSize(9).fillColor(C.gris).text(config.pago_instrucciones, M + 20, y + 80, { width: 250 });
  }

  // ── Sello de estado (se calcula al generar: refleja si ya se pagó) ────────────
  if (estado && ['pagado', 'sin_deuda'].includes(estado.estado)) {
    doc.save();
    doc.rotate(-12, { origin: [W - 150, 225] });
    doc.roundedRect(W - 232, 200, 164, 46, 6).lineWidth(2.5).strokeColor(C.verde).strokeOpacity(0.85).stroke();
    doc.font('CB').fontSize(24).fillColor(C.verde).fillOpacity(0.85)
      .text(estado.estado === 'pagado' ? 'PAGADO' : 'SIN DEUDA', W - 232, 210, { width: 164, align: 'center' });
    doc.restore();
    doc.fillOpacity(1).strokeOpacity(1);
  }

  // ── Pie: sello de integridad ──────────────────────────────────────────────────
  const pie = 800;
  doc.moveTo(M, pie - 10).lineTo(M + ancho, pie - 10).lineWidth(0.5).strokeColor(C.linea).stroke();
  doc.font('R').fontSize(7.5).fillColor(C.gris)
    .text(`Sello de integridad del libro de movimientos al cierre: ${cupon.sello.slice(0, 32)}`, M, pie - 2, { width: ancho, lineBreak: false });
  doc.text(`Cierre de ${nombrePeriodo(cupon.periodo)} generado el ${fmtFechaCorta(cupon.creado_en.slice(0, 10))}. Documento no válido como factura.`, M, pie + 9, { width: ancho, lineBreak: false });

  doc.end();
  return doc;
}

function capital(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

module.exports = { generarCupon, ALA };
