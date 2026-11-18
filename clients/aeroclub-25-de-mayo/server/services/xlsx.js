// Escritor mínimo de .xlsx: un libro con una hoja, encabezado fijo y celdas de texto, fecha o número.
// Un .xlsx es un zip con seis XML; se arma a mano para no sumar una dependencia por un solo archivo.
const zlib = require('zlib');

// ── Zip ─────────────────────────────────────────────────────────────────────
const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zip(archivos) {
  const ahora = new Date();
  const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
  const dia = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
  const locales = [];
  const central = [];
  let offset = 0;
  for (const [ruta, contenido] of archivos) {
    const nombre = Buffer.from(ruta, 'utf8');
    const crudo = Buffer.from(contenido, 'utf8');
    const comprimido = zlib.deflateRawSync(crudo);
    // Lo que comparten la cabecera local y la del directorio: versión, flags (UTF-8), deflate, fecha, crc y tamaños.
    const comun = Buffer.alloc(26);
    comun.writeUInt16LE(20, 0);
    comun.writeUInt16LE(0x0800, 2);
    comun.writeUInt16LE(8, 4);
    comun.writeUInt16LE(hora, 6);
    comun.writeUInt16LE(dia, 8);
    comun.writeUInt32LE(crc32(crudo), 10);
    comun.writeUInt32LE(comprimido.length, 14);
    comun.writeUInt32LE(crudo.length, 18);
    comun.writeUInt16LE(nombre.length, 22);
    comun.writeUInt16LE(0, 24);

    const firmaLocal = Buffer.alloc(4);
    firmaLocal.writeUInt32LE(0x04034B50);
    locales.push(firmaLocal, comun, nombre, comprimido);

    const cabCentral = Buffer.alloc(6);
    cabCentral.writeUInt32LE(0x02014B50, 0);
    cabCentral.writeUInt16LE(20, 4);
    const colaCentral = Buffer.alloc(14);       // comentario, disco, atributos internos y externos
    colaCentral.writeUInt32LE(offset, 10);
    central.push(cabCentral, comun, colaCentral, nombre);

    offset += 4 + comun.length + nombre.length + comprimido.length;
  }
  const directorio = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054B50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, directorio, fin]);
}

// ── Hoja ────────────────────────────────────────────────────────────────────
// XML 1.0 no admite caracteres de control (salvo tab y saltos de línea): se sacan.
const esc = (v) => String(v)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function letraColumna(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// 'AAAA-MM-DD' → número de serie de Excel (días desde el 30/12/1899).
function serieFecha(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000) + 25569;
}

// Estilos (cellXfs): 0 normal, 1 encabezado, 2 encabezado de campo opcional, 3 texto, 4 fecha, 5 importe, 6 horas.
const ESTILO = { texto: 3, fecha: 4, importe: 5, horas: 6 };
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="0.0"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font><font><sz val="10"/><name val="Arial"/><family val="2"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF18274F"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5F6B82"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD5E0EA"/></left><right style="thin"><color rgb="FFD5E0EA"/></right><top style="thin"><color rgb="FFD5E0EA"/></top><bottom style="thin"><color rgb="FFD5E0EA"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="165" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="4" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="166" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function celda(ref, valor, tipo) {
  const s = ESTILO[tipo] ?? ESTILO.texto;
  if (valor == null || valor === '') return `<c r="${ref}" s="${s}"/>`;
  if (tipo === 'fecha') return `<c r="${ref}" s="${s}"><v>${serieFecha(valor)}</v></c>`;
  if (tipo === 'importe' || tipo === 'horas') return `<c r="${ref}" s="${s}"><v>${Number(valor)}</v></c>`;
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(valor)}</t></is></c>`;
}

// columnas: [{ titulo, ancho, tipo: 'texto' | 'fecha' | 'importe' | 'horas', opcional }]; filas: una lista de valores por fila.
// Las fechas van como 'AAAA-MM-DD' y los números ya en su unidad (pesos, horas). El texto nunca se interpreta como fórmula.
function libro({ hoja, columnas, filas }) {
  const ultima = letraColumna(columnas.length - 1);
  const cols = columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho || 12}" customWidth="1"/>`).join('');
  const encabezado = `<row r="1" ht="22" customHeight="1">${columnas.map((c, i) =>
    `<c r="${letraColumna(i)}1" s="${c.opcional ? 2 : 1}" t="inlineStr"><is><t>${esc(c.titulo)}</t></is></c>`).join('')}</row>`;
  const cuerpo = filas.map((fila, f) =>
    `<row r="${f + 2}">${columnas.map((c, i) => celda(`${letraColumna(i)}${f + 2}`, fila[i], c.tipo)).join('')}</row>`).join('');
  const xmlHoja = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${ultima}${filas.length + 1}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${encabezado}${cuerpo}</sheetData></worksheet>`;

  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(hoja)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', ESTILOS],
    ['xl/worksheets/sheet1.xml', xmlHoja]
  ]);
}

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

module.exports = { libro, serieFecha, MIME_XLSX };
