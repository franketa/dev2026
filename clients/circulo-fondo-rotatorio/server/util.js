// Utilidades compartidas. Convenciones de todo el sistema:
//   - Plata: enteros en centavos (nunca floats).
//   - Alícuotas: enteros en cienmilésimos (2,5 % → 2500).
//   - Fechas de negocio: 'YYYY-MM-DD' en hora de Argentina; períodos 'YYYY-MM'.

const crypto = require('crypto');

const TZ = 'America/Argentina/Buenos_Aires';

class ErrorNegocio extends Error {
  constructor(mensaje, status = 400, codigo, datos) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.datos = datos;
  }
}

const fmtFecha = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

function hoy(d = new Date()) { return fmtFecha.format(d); }
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

// Importe que llega de la API: entero en centavos (el frontend ya lo convierte).
function centavos(v, { cero = false } = {}) {
  const n = typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : v;
  if (!Number.isSafeInteger(n) || n < 0 || (!cero && n === 0)) return null;
  return n;
}

const fmtNum0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const fmtNum2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtPesos(c) {
  const neg = c < 0;
  const abs = Math.abs(c);
  const txt = abs % 100 === 0 ? fmtNum0.format(abs / 100) : fmtNum2.format(abs / 100);
  return `${neg ? '−' : ''}$ ${txt}`;
}
// Siempre con dos decimales (listados formales: PDF, Excel).
function fmtPesos2(c) { return `${c < 0 ? '−' : ''}$ ${fmtNum2.format(Math.abs(c) / 100)}`; }
function fmtFechaCorta(fecha) { if (!fecha) return ''; const [y, m, d] = fecha.slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
function fmtFechaHora(iso) {
  return new Date(iso).toLocaleString('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
// 2500 → "2,5 %"
function fmtAlicuota(a) { return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 }).format(a / 1000)} %`; }

// ── CUIT ────────────────────────────────────────────────────────────────────
const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const PREFIJOS_CUIT = ['20', '23', '24', '25', '26', '27', '30', '33', '34', '50', '51', '55'];
function soloDigitos(v) { return String(v ?? '').replace(/\D/g, ''); }
function digitoCuit(diez) {
  const suma = PESOS_CUIT.reduce((s, p, i) => s + p * Number(diez[i]), 0);
  const r = 11 - (suma % 11);
  return r === 11 ? 0 : r === 10 ? null : r;
}
// Devuelve el CUIT normalizado (11 dígitos) o null si el formato o el dígito verificador no dan.
function validarCuit(v) {
  const d = soloDigitos(v);
  if (d.length !== 11 || !PREFIJOS_CUIT.includes(d.slice(0, 2))) return null;
  const dv = digitoCuit(d.slice(0, 10));
  return dv !== null && dv === Number(d[10]) ? d : null;
}
function fmtCuit(d) { return d && d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d[10]}` : (d || ''); }

// CAE / CAEA: 14 dígitos.
function validarCae(v) {
  const d = soloDigitos(v);
  return /^\d{14}$/.test(d) ? d : null;
}

// Razón social para comparar: sin tildes, sin signos, sin formas societarias.
const FORMAS = /\b(s\.?\s?a\.?\s?u?|s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?\s?s\.?|s\.?\s?h\.?|s\.?\s?c\.?\s?a\.?|sociedad anonima|srl|sa|sas|saic|sacif|sociedad|de responsabilidad limitada|argentina|arg)\b/g;
function normalizarRazon(v) {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').replace(FORMAS, ' ').replace(/\s+/g, ' ').trim();
}

// Distancia de Levenshtein acotada (para avisar "¿no será este?" al dar de alta un proveedor).
function distancia(a, b) {
  if (a === b) return 0;
  const m = a.length; const n = b.length;
  if (!m || !n) return m + n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

function normalizarEmail(v) {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '').toLowerCase();
}

function limpiarTexto(v, max = 500) {
  if (v == null) return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
}

// JSON canónico (claves ordenadas): la misma información da siempre el mismo hash.
function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

// Importe de una retención: base × alícuota, redondeado al centavo. A VALIDAR CON EL CONTADOR (ver DECISIONES.md).
function importeRetencion(base, alicuota) { return Math.round((base * alicuota) / 100000); }

module.exports = {
  TZ, ErrorNegocio, hoy, periodoDe, periodoActual, sumarMeses, ultimoDia, sumarDias, nombrePeriodo, MESES,
  esFecha, esPeriodo, parsePesos, centavos, fmtPesos, fmtPesos2, fmtFechaCorta, fmtFechaHora, fmtAlicuota,
  soloDigitos, digitoCuit, validarCuit, fmtCuit, validarCae, normalizarRazon, distancia,
  normalizarEmail, limpiarTexto, canonico, sha256, importeRetencion
};
