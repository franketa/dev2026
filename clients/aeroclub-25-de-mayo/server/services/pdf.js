// Cupón de pago en PDF. Se genera al vuelo desde datos inmutables (cupón + movimientos del
// rango sellado), así que el mismo cupón siempre produce el mismo contenido.

const path = require('path');
const PDFDocument = require('pdfkit');
const { nombrePeriodo, fmtFechaCorta, fmtHoras, fmtTac, fechaDeSqlite } = require('../util');

const FONTS = path.join(__dirname, '..', 'fonts');
const ESCUDO = path.join(__dirname, '..', '..', 'public', 'assets', 'img', 'escudo.png');

// Ala roja del escudo, trazada del logo original (viewBox 0 0 720 720).
const ALA = 'M13.0 465.8 C30.0 465.0 91.0 462.5 115.0 461.2 C139.0 459.9 140.0 459.9 157.0 458.0 C174.0 456.1 200.0 452.7 217.0 449.6 C234.0 446.4 248.5 442.0 259.0 438.9 C269.5 435.8 273.0 433.9 280.0 430.9 C287.0 427.9 283.5 430.8 301.0 421.1 C318.5 411.4 362.5 384.9 385.0 372.7 C407.5 360.5 420.0 355.4 436.0 348.0 C452.0 340.6 467.5 333.9 481.0 328.3 C494.5 322.7 506.0 318.3 517.0 314.3 C528.0 310.4 538.0 307.1 547.0 304.4 C556.0 301.7 560.0 300.3 571.0 298.1 C582.0 295.9 602.5 292.5 613.0 291.1 C623.5 289.8 627.5 290.0 634.0 290.0 C640.5 290.0 645.5 290.2 652.0 291.0 C658.5 291.8 665.5 292.3 673.0 295.0 C680.5 297.7 691.0 304.8 697.0 307.4 C703.0 310.1 707.0 310.2 709.0 310.8 L709.0 318.0 C705.0 317.8 698.5 317.1 685.0 317.0 C671.5 316.9 641.5 317.1 628.0 317.6 C614.5 318.1 613.0 318.8 604.0 320.0 C595.0 321.2 583.5 323.0 574.0 325.0 C564.5 327.0 557.5 328.6 547.0 331.9 C536.5 335.1 521.5 340.2 511.0 344.4 C500.5 348.6 491.0 353.4 484.0 357.0 C477.0 360.6 476.0 361.2 469.0 365.9 C462.0 370.5 450.5 378.3 442.0 384.9 C433.5 391.4 426.5 397.4 418.0 405.3 C409.5 413.2 400.5 422.1 391.0 432.4 C381.5 442.8 370.5 455.5 361.0 467.3 C351.5 479.1 341.0 493.6 334.0 503.3 C327.0 513.0 325.5 515.0 319.0 525.4 C312.5 535.9 301.0 555.3 295.0 565.9 C289.0 576.5 286.0 584.1 283.0 589.0 C280.0 593.9 278.5 591.8 277.0 595.0 C275.5 598.2 274.5 605.8 274.0 608.0 C273.5 606.5 272.5 601.4 271.0 598.8 C269.5 596.2 269.0 599.4 265.0 592.1 C261.0 584.9 253.0 566.3 247.0 555.4 C241.0 544.5 235.0 534.9 229.0 526.7 C223.0 518.5 216.5 511.7 211.0 506.3 C205.5 500.9 200.0 497.1 196.0 494.1 C192.0 491.2 192.5 491.2 187.0 488.6 C181.5 485.9 169.5 480.5 163.0 478.1 C156.5 475.7 153.5 475.3 148.0 474.1 C142.5 473.0 138.0 472.0 130.0 471.1 C122.0 470.3 116.0 469.0 100.0 469.0 C84.0 469.0 48.5 471.2 34.0 471.4 C19.5 471.6 16.5 470.4 13.0 470.2 Z';

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
  doc.text(`Cierre de ${nombrePeriodo(cupon.periodo)} generado el ${fmtFechaCorta(fechaDeSqlite(cupon.creado_en))}. Documento no válido como factura.`, M, pie + 9, { width: ancho, lineBreak: false });

  doc.end();
  return doc;
}

function capital(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

module.exports = { generarCupon, ALA };
