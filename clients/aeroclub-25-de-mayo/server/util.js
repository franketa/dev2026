// Utilidades compartidas. Convenciones de todo el sistema:
//   - Plata: enteros en centavos (nunca floats).
//   - Tacómetro y horas: enteros en décimas de hora (2345.6 → 23456).
//   - Fechas de negocio: 'YYYY-MM-DD' en hora de Argentina; períodos 'YYYY-MM'.

const TZ = 'America/Argentina/Buenos_Aires';

class ErrorNegocio extends Error {
  constructor(mensaje, status = 400, codigo) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

const fmtFecha = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

function hoy(d = new Date()) { return fmtFecha.format(d); }
function horaAR(d = new Date()) { return Number(fmtHora.format(d).slice(0, 2)); }
function periodoDe(fecha) { return fecha.slice(0, 7); }
function periodoActual() { return periodoDe(hoy()); }

function sumarMeses(periodo, n) {
  const [y, m] = periodo.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

function ultimoDia(periodo) {
  const [y, m] = periodo.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${periodo}-${String(d).padStart(2, '0')}`;
}

function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function nombrePeriodo(periodo) {
  const [y, m] = periodo.split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
}

function esFecha(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
function esPeriodo(s) { return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s); }

// "2345,6" | "2345.6" | 2345.6 → 23456 décimas. Rechaza más de un decimal.
function parseTac(v) {
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(',', '.');
  if (!/^\d{1,6}(\.\d)?$/.test(s)) return null;
  const [ent, dec = '0'] = s.split('.');
  return Number(ent) * 10 + Number(dec);
}
function fmtTac(decimas) { return (decimas / 10).toFixed(1).replace('.', ','); }

// "96.000" | "96000,50" | 96000 → centavos. Acepta separador de miles con punto (formato AR).
function parsePesos(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
  if (typeof v !== 'string') return null;
  let s = v.trim().replace(/\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

const fmtNum = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
function fmtPesos(centavos) {
  const neg = centavos < 0;
  const abs = Math.abs(centavos);
  const txt = abs % 100 === 0 ? fmtNum.format(abs / 100) : new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(abs / 100);
  return `${neg ? '−' : ''}$ ${txt}`;
}
function fmtHoras(decimas) { return `${(decimas / 10).toFixed(1).replace('.', ',')} h`; }
function fmtFechaCorta(fecha) { const [y, m, d] = fecha.split('-'); return `${d}/${m}/${y}`; }

// Importe de un vuelo: precio por hora × décimas / 10, redondeado al centavo.
function importeVuelo(precioHora, decimas) { return Math.round((precioHora * decimas) / 10); }

// Teléfono → formato internacional para wa.me (Argentina: 54 9 + área sin 0 + número sin 15).
function telefonoWhatsApp(tel) {
  if (!tel) return null;
  let d = String(tel).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) {
    d = d.slice(2);
    if (d.startsWith('9')) d = d.slice(1);
  }
  if (d.startsWith('0')) d = d.slice(1);
  // Saca el "15" después del código de área (área de 2 a 4 dígitos) si el número quedó largo.
  if (d.length === 12) {
    for (const largoArea of [2, 3, 4]) {
      if (d.slice(largoArea, largoArea + 2) === '15') { d = d.slice(0, largoArea) + d.slice(largoArea + 2); break; }
    }
  }
  if (d.length !== 10) return null;
  return '549' + d;
}

function limpiarTexto(v, max = 500) {
  if (v == null) return null;
  const s = String(v).replace(/\s+$/g, '').replace(/^\s+/g, '').slice(0, max);
  return s || null;
}

module.exports = {
  TZ, ErrorNegocio, hoy, horaAR, periodoDe, periodoActual, sumarMeses, ultimoDia, sumarDias, nombrePeriodo,
  esFecha, esPeriodo, parseTac, fmtTac, parsePesos, fmtPesos, fmtHoras, fmtFechaCorta, importeVuelo,
  telefonoWhatsApp, limpiarTexto, MESES
};
