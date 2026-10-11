// Utilidades del frontend: API, plantillas seguras, formatos, modales, íconos y adjuntos.

// ── HTML seguro ─────────────────────────────────────────────────────────────
class Seguro { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Seguro(String(s));
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function valor(v) {
  if (v == null || v === false) return '';
  if (v instanceof Seguro) return v.s;
  if (Array.isArray(v)) return v.map(valor).join('');
  return esc(v);
}
// Plantilla con escape automático: html`<p>${texto}</p>`
export function html(partes, ...vals) {
  let out = partes[0];
  for (let i = 0; i < vals.length; i++) out += valor(vals[i]) + partes[i + 1];
  return new Seguro(out);
}
export function pintar(el, contenido) { el.innerHTML = valor(contenido); return el; }
export const sel = (cond) => (cond ? raw('selected') : '');
export const chk = (cond) => (cond ? raw('checked') : '');

// ── API ─────────────────────────────────────────────────────────────────────
export class ErrorApi extends Error {
  constructor(msg, status, codigo, datos) { super(msg); this.status = status; this.codigo = codigo; this.datos = datos; }
}
export async function api(metodo, url, cuerpo, { crudo = null } = {}) {
  let r;
  try {
    r = await fetch(url, {
      method: metodo,
      headers: crudo ? { 'Content-Type': crudo.tipo, 'X-FR': '1', 'X-Archivo': encodeURIComponent(crudo.nombre || '') } : { 'Content-Type': 'application/json', 'X-FR': '1' },
      body: crudo ? crudo.blob : cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      credentials: 'same-origin'
    });
  } catch {
    throw new ErrorApi('Sin conexión. Revisá la señal y probá de nuevo.', 0);
  }
  let datos = null;
  try { datos = await r.json(); } catch { /* respuesta sin cuerpo */ }
  if (r.status === 401 && !url.startsWith('/api/auth/login')) {
    location.href = '/';
    throw new ErrorApi('Sesión vencida', 401);
  }
  if (!r.ok) {
    if (datos?.codigo === 'CAMBIAR_PASSWORD' && location.hash !== '#/perfil') location.hash = '#/perfil';
    throw new ErrorApi(datos?.error || 'No se pudo completar la operación', r.status, datos?.codigo, datos?.datos);
  }
  return datos;
}
export const get = (u) => api('GET', u);
export const post = (u, b = {}) => api('POST', u, b);
export const put = (u, b = {}) => api('PUT', u, b);
export const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '')).toString();

// ── Formatos (siempre es-AR) ────────────────────────────────────────────────
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function pesos(c, { signo = false, decimales = false } = {}) {
  if (c == null) return '—';
  const abs = Math.abs(c);
  const txt = abs % 100 === 0 && !decimales ? nf0.format(abs / 100) : nf2.format(abs / 100);
  const s = c < 0 ? '−' : (signo && c > 0 ? '+' : '');
  return `${s}$ ${txt}`;
}
export function fecha(f) { if (!f) return '—'; const [y, m, d] = f.slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
export function fechaCorta(f) { const [, m, d] = f.slice(0, 10).split('-'); return `${Number(d)} ${MESES[Number(m) - 1].slice(0, 3)}`; }
export function fechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function nombrePeriodo(p) { const [y, m] = p.split('-').map(Number); return `${MESES[m - 1]} ${y}`; }
export const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export function hoyAR() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()); }
export function periodoHoy() { return hoyAR().slice(0, 7); }
export function sumarMeses(p, n) {
  const [y, m] = p.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
export function parsePesos(v) {
  let s = String(v ?? '').trim().replace(/\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
export const pesosInput = (c) => (c == null ? '' : (c % 100 === 0 ? nf0.format(c / 100) : nf2.format(c / 100)));
export const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '');
export function fmtCuit(c) { const d = soloDigitos(c); return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d[10]}` : (c || ''); }
export function cuitValido(v) {
  const d = soloDigitos(v);
  if (d.length !== 11) return false;
  const suma = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].reduce((s, p, i) => s + p * Number(d[i]), 0);
  const r = 11 - (suma % 11);
  const dv = r === 11 ? 0 : r === 10 ? null : r;
  return dv !== null && dv === Number(d[10]);
}
export const alicuota = (a) => `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 }).format(a / 1000)} %`;
export const iniciales = (n, a) => `${(n || '?')[0]}${(a || '')[0] || ''}`.toUpperCase();

// Formatea el monto mientras se escribe ("1234567" → "1.234.567"), respetando la coma decimal.
export function mascaraPesos(input) {
  input.addEventListener('input', () => {
    const v = input.value;
    const [ent, dec] = v.replace(/[^\d,]/g, '').split(',');
    const e = (ent || '').replace(/^0+(?=\d)/, '');
    const conPuntos = e.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    input.value = dec !== undefined ? `${conPuntos},${dec.slice(0, 2)}` : conPuntos;
  });
}

// ── Etiquetas ───────────────────────────────────────────────────────────────
export const TIPOS_GASTO = { fijo: 'Fijo', caja_chica: 'Caja chica', con_solicitud: 'Con solicitud' };
export const MEDIOS = { transferencia: 'Transferencia', efectivo: 'Efectivo' };
export const ESTADOS_SOL = { pendiente: ['pend', 'Pendiente'], en_revision: ['info', 'En revisión'], aprobada: ['ok', 'Aprobada'], rechazada: ['mal', 'Rechazada'], ejecutada: ['neutro', 'Pagada'] };
export const ESTADOS_REN = { abierta: ['pend', 'Abierta'], cerrada_firmada: ['info', 'Cerrada y firmada'], enviada: ['ok', 'Enviada'], en_cotejo: ['info', 'En cotejo'], observada: ['mal', 'Observada'], aprobada: ['ok', 'Aprobada'] };
export const chip = (clase, txt) => html`<span class="chip chip--${clase}">${txt}</span>`;
export const chipSolicitud = (e) => chip(...(ESTADOS_SOL[e] || ['neutro', e]));
export const chipRendicion = (e) => chip(...(ESTADOS_REN[e] || ['neutro', e]));
export const chipTipo = (t) => chip(t === 'fijo' ? 'info' : t === 'con_solicitud' ? 'pend' : 'neutro', TIPOS_GASTO[t] || t);

// ── Toasts ──────────────────────────────────────────────────────────────────
export function toast(msg, tipo = '') {
  let caja = document.querySelector('.toasts');
  if (!caja) { caja = document.createElement('div'); caja.className = 'toasts'; caja.setAttribute('role', 'status'); document.body.append(caja); }
  const t = document.createElement('div');
  t.className = `toast ${tipo ? 'toast--' + tipo : ''}`;
  t.textContent = msg;
  caja.append(t);
  setTimeout(() => t.remove(), tipo === 'mal' ? 7000 : 3500);
}
export function error(e) { toast(e?.message || 'Algo salió mal', 'mal'); }

// ── Modales ─────────────────────────────────────────────────────────────────
export function modal({ titulo, subtitulo, contenido, ancho = false, alCerrar }) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  pintar(fondo, html`
    <div class="modal ${ancho ? 'modal--ancho' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
      <div class="modal__cab">
        <div><h2 id="modal-titulo">${titulo}</h2>${subtitulo ? html`<p>${subtitulo}</p>` : ''}</div>
        <button class="modal__cerrar" type="button" data-cerrar aria-label="Cerrar">${icono('x')}</button>
      </div>
      <div class="modal__cuerpo">${contenido}</div>
    </div>`);
  const anterior = document.activeElement;
  const cerrar = (v) => {
    fondo.remove();
    document.removeEventListener('keydown', teclas);
    if (!document.querySelector('.modal-fondo')) document.body.style.overflow = '';
    anterior?.focus?.();
    alCerrar?.(v);
  };
  const teclas = (e) => { if (e.key === 'Escape' && fondo === [...document.querySelectorAll('.modal-fondo')].pop()) cerrar(null); };
  fondo.addEventListener('click', (e) => { if (e.target === fondo || e.target.closest('[data-cerrar]')) cerrar(null); });
  document.addEventListener('keydown', teclas);
  document.body.append(fondo);
  document.body.style.overflow = 'hidden';
  const foco = fondo.querySelector('[autofocus], input:not([type=hidden]), select, textarea') || fondo.querySelector('.modal__cerrar');
  foco?.focus();
  return { el: fondo.querySelector('.modal'), cerrar };
}

export function confirmar({ titulo, texto, contenido = null, boton = 'Confirmar', peligro = false }) {
  return new Promise((ok) => {
    const m = modal({
      titulo, alCerrar: (v) => ok(!!v),
      contenido: html`<div class="pila">${contenido || html`<p>${texto}</p>`}
        <div class="modal__acciones">
          <button class="btn btn--sec" data-cerrar type="button">Cancelar</button>
          <button class="btn ${peligro ? 'btn--peligro' : 'btn--principal'}" data-si type="button">${boton}</button>
        </div></div>`
    });
    m.el.querySelector('[data-si]').addEventListener('click', () => m.cerrar(true));
  });
}

export function pedirTexto({ titulo, texto, label, boton = 'Confirmar', placeholder = '', peligro = false, opcional = false }) {
  return new Promise((ok) => {
    const m = modal({
      titulo, alCerrar: (v) => ok(v ?? null),
      contenido: html`<form class="form" novalidate>
        ${texto ? html`<p>${texto}</p>` : ''}
        <div class="campo"><label for="pt-in">${label}</label><textarea id="pt-in" class="input textarea" placeholder="${placeholder}" maxlength="500"></textarea></div>
        <div class="modal__acciones">
          <button class="btn btn--sec" data-cerrar type="button">Cancelar</button>
          <button class="btn ${peligro ? 'btn--peligro' : 'btn--principal'}" type="submit">${boton}</button>
        </div></form>`
    });
    m.el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = m.el.querySelector('textarea').value.trim();
      if (!v && !opcional) { m.el.querySelector('textarea').setAttribute('aria-invalid', 'true'); return; }
      m.cerrar(v);
    });
  });
}

// Deshabilita el botón mientras corre la acción, así nadie guarda dos veces.
export async function conBoton(btn, fn) {
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
}

export function datosForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value;
  }
  return out;
}

export function selectorMes(periodo, { max = periodoHoy(), min = null } = {}) {
  return html`<div class="selector-mes" data-selector-mes>
    <button type="button" data-mes="${sumarMeses(periodo, -1)}" aria-label="Mes anterior" ${min && periodo <= min ? raw('disabled') : ''}>${icono('izq')}</button>
    <strong>${capital(nombrePeriodo(periodo))}</strong>
    <button type="button" data-mes="${sumarMeses(periodo, 1)}" aria-label="Mes siguiente" ${periodo >= max ? raw('disabled') : ''}>${icono('der')}</button>
  </div>`;
}

export const cargando = () => html`<div class="cargando" aria-label="Cargando"></div>`;
export const vacio = (texto, ic = 'info') => html`<div class="vacio">${icono(ic)}<p>${texto}</p></div>`;

// ── Adjuntos: se achican en el navegador y suben en segundo plano ──────────
// Fotos: máximo 1600 px de lado, JPEG calidad 0,7. Un escaneo de 85 MB termina pesando unos cientos de KB.
export async function comprimir(archivo) {
  if (archivo.type === 'application/pdf') {
    if (archivo.size > 6 * 1024 * 1024) throw new Error('El PDF es muy pesado (máximo 6 MB). Sacale una foto en su lugar.');
    return { blob: archivo, tipo: 'application/pdf', nombre: archivo.name };
  }
  if (!archivo.type.startsWith('image/')) throw new Error('Elegí una foto o un PDF');
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('No se pudo abrir la foto')); i.src = url; });
    const escala = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(img.naturalWidth * escala);
    lienzo.height = Math.round(img.naturalHeight * escala);
    lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.7));
    return { blob, tipo: 'image/jpeg', nombre: (archivo.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Cola de subidas con reintentos (1 s, 3 s, 9 s, 27 s…). Si no sube, el gasto ya quedó guardado
// con "adjunto pendiente" y se puede reintentar desde su detalle.
const cola = [];
let subiendo = false;
export function subirEnSegundoPlano(entidad, id, archivo) {
  cola.push({ entidad, id, archivo, intentos: 0 });
  procesarCola();
}
async function procesarCola() {
  if (subiendo) return;
  subiendo = true;
  while (cola.length) {
    const t = cola[0];
    try {
      const c = t.comprimido || (t.comprimido = await comprimir(t.archivo));
      await api('POST', `/api/adjuntos/${t.entidad}/${t.id}`, undefined, { crudo: c });
      cola.shift();
      toast('Se subió la foto del comprobante', 'ok');
    } catch (e) {
      t.intentos++;
      if (e.status && e.status < 500 && e.status !== 0) { cola.shift(); toast(`No se pudo subir la foto: ${e.message}`, 'mal'); continue; }
      if (t.intentos >= 6) { cola.shift(); toast('La foto no se pudo subir. El gasto quedó guardado con "adjunto pendiente".', 'mal'); continue; }
      await new Promise(r => setTimeout(r, 1000 * 3 ** (t.intentos - 1)));
    }
  }
  subiendo = false;
}
export const subidasPendientes = () => cola.length;
window.addEventListener('beforeunload', (e) => { if (cola.length) { e.preventDefault(); e.returnValue = ''; } });

// ── Íconos (trazo 2px) ──────────────────────────────────────────────────────
const P = {
  inicio: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  cuenta: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2.4.6 4 2.3 4 5.2"/>',
  panel: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  rendicion: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  edificio: '<path d="M4 21V5l8-3 8 3v16"/><path d="M9 21v-4h6v4M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01"/>',
  escudo: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  izq: '<path d="M15 18l-6-6 6-6"/>',
  der: '<path d="M9 18l6-6-6-6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  alerta: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  pdf: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 14h6M9 17h4"/>',
  excel: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 12l6 6M15 12l-6 6"/>',
  pago: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  anular: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  descargar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  candado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  cadena: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  foto: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  campana: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  enviar: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  firma: '<path d="M3 17c3-3 4-9 7-9 2 0 0 7 2 7s3-3 4-3 1 2 2 2h3"/><path d="M3 21h18"/>',
  banco: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  efectivo: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
  flechas: '<path d="M7 7h13l-3-3M17 17H4l3 3"/>',
  solicitud: '<path d="M9 3h6l1 2h3v16H5V5h3z"/><path d="M9 12l2 2 4-4"/>',
  proveedor: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 13v8h14v-8"/>',
  retencion: '<path d="M4 4h16v16H4z"/><path d="M8 16L16 8M9 9h.01M15 15h.01"/>',
  enviada: '<path d="M4 4h16v13H4z"/><path d="M4 4l8 7 8-7"/><path d="M15 20l2 2 4-4"/>',
  recargar: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  ojo: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  ojoNo: '<path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.2M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/>'
};
export function icono(nombre) {
  return raw(`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[nombre] || ''}</svg>`);
}

export function verContrasenas(raiz) {
  raiz.querySelectorAll('input[type=password]').forEach((input) => {
    const caja = document.createElement('div');
    caja.className = 'input-pass';
    input.replaceWith(caja);
    caja.append(input);
    caja.insertAdjacentHTML('beforeend', `<button class="input-pass__ver" type="button" aria-label="Mostrar contraseña" aria-pressed="false">${icono('ojo')}</button>`);
    const btn = caja.lastElementChild;
    btn.addEventListener('click', () => {
      const ver = input.type === 'password';
      input.type = ver ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(ver));
      btn.innerHTML = String(icono(ver ? 'ojoNo' : 'ojo'));
    });
  });
}

// Marca: dos alas en chevron (no usa escudos oficiales).
export const marca = (clase = '') => raw(`<svg class="marca ${clase}" viewBox="0 0 36 24" aria-hidden="true"><path d="M0 14 L18 4 L36 14 L30 14 L18 8 L6 14 Z" fill="#6CACE4"/><path d="M4 22 L18 13 L32 22 L26 22 L18 17 L10 22 Z" fill="currentColor"/></svg>`);

// Catálogos (rubros, reglas, alícuotas…): se piden una vez por sesión.
let catalogos = null;
export async function cat(recargar = false) {
  if (!catalogos || recargar) catalogos = await get('/api/catalogos');
  return catalogos;
}
export const rubrosImputables = (c) => c.rubros.filter(r => r.imputable);
