// Utilidades del frontend: API, plantillas seguras, formatos, modales e íconos.

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

// ── API ─────────────────────────────────────────────────────────────────────
export class ErrorApi extends Error {
  constructor(msg, status, codigo) { super(msg); this.status = status; this.codigo = codigo; }
}
export async function api(metodo, url, cuerpo) {
  let r;
  try {
    r = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'X-A25': '1' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
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
    throw new ErrorApi(datos?.error || 'No se pudo completar la operación', r.status, datos?.codigo);
  }
  return datos;
}
export const get = (u) => api('GET', u);
export const post = (u, b = {}) => api('POST', u, b);
export const put = (u, b = {}) => api('PUT', u, b);

// ── Formatos (siempre es-AR) ────────────────────────────────────────────────
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function pesos(c, { signo = false } = {}) {
  if (c == null) return '—';
  const abs = Math.abs(c);
  const txt = abs % 100 === 0 ? nf0.format(abs / 100) : nf2.format(abs / 100);
  const s = c < 0 ? '−' : (signo && c > 0 ? '+' : '');
  return `${s}$ ${txt}`;
}
export const horas = (d) => `${((d || 0) / 10).toFixed(1).replace('.', ',')} h`;
export const tac = (d) => (d / 10).toFixed(1).replace('.', ',');
export function fecha(f) { if (!f) return '—'; const [y, m, d] = f.slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
export function fechaCorta(f) { const [, m, d] = f.slice(0, 10).split('-'); return `${Number(d)} ${MESES[Number(m) - 1].slice(0, 3)}`; }
export function fechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function nombrePeriodo(p) { const [y, m] = p.split('-').map(Number); return `${MESES[m - 1]} ${y}`; }
export function mesDe(p) { return MESES[Number(p.split('-')[1]) - 1]; }
export function hoyAR() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()); }
export function periodoHoy() { return hoyAR().slice(0, 7); }
export function sumarMeses(p, n) {
  const [y, m] = p.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
export function parseTac(v) {
  const s = String(v ?? '').trim().replace(',', '.');
  if (!/^\d{1,6}(\.\d)?$/.test(s)) return null;
  const [e, d = '0'] = s.split('.');
  return Number(e) * 10 + Number(d);
}
export function parsePesos(v) {
  let s = String(v ?? '').trim().replace(/\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
export const pesosInput = (c) => c == null ? '' : (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2).replace('.', ','));
export const iniciales = (n, a) => `${(n || '?')[0]}${(a || '')[0] || ''}`.toUpperCase();

// Color de identidad de cada avión (por orden en la flota, fijo, nunca por ranking).
export function colorAvion(orden) { return `var(--serie-${Math.min(Math.max(orden || 1, 1), 3)})`; }

// ── Tacómetro de tambor ─────────────────────────────────────────────────────
export function tambor(decimas, { tam = '', enteros = 4, desde = null } = {}) {
  const txt = String(Math.max(0, Math.round(decimas || 0))).padStart(enteros + 1, '0');
  const inicio = desde == null ? null : String(Math.max(0, Math.round(desde))).padStart(txt.length, '0');
  const tira = raw(Array.from({ length: 10 }, (_, i) => `<span>${i}</span>`).join(''));
  const digitos = [...txt].map((d, i) => {
    const dec = i === txt.length - 1;
    const n = inicio ? inicio[i] : d;
    return html`<span class="tac__d ${dec ? 'tac__d--dec' : ''}"><span class="tac__tira" style="--n:${n}" data-n="${d}">${tira}</span></span>`;
  });
  return html`<span class="tac ${tam ? 'tac--' + tam : ''}" role="img" aria-label="Tacómetro ${tac(decimas)}">${digitos}</span>`;
}
// Hace rodar los tambores hasta su valor final (después de pintarlos con `desde`).
export function rodar(el) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.querySelectorAll('.tac__tira[data-n]').forEach(t => t.style.setProperty('--n', t.dataset.n));
  }));
}

// ── Estados ─────────────────────────────────────────────────────────────────
export function chipCupon(c) {
  const mapa = {
    pagado: ['ok', 'Pagado'], sin_deuda: ['ok', c.total < 0 ? 'Saldo a favor' : 'Sin deuda'], incluido: ['neutro', 'Pasó al cupón siguiente'],
    parcial: ['pend', 'Pago parcial'], pendiente: [c.vencido ? 'mal' : 'pend', c.vencido ? 'Vencido' : 'Pendiente']
  };
  const [clase, txt] = mapa[c.estado] || ['neutro', c.estado];
  return html`<span class="chip chip--${clase}">${txt}</span>`;
}
export function chipVuelo(v) {
  if (v.estado === 'anulado') return html`<span class="chip chip--neutro">Anulado</span>`;
  if (v.estado === 'cerrado') return html`<span class="chip chip--ok">Facturado</span>`;
  return html`<span class="chip">A facturar</span>`;
}

// ── Toasts ──────────────────────────────────────────────────────────────────
export function toast(msg, tipo = '') {
  let caja = document.querySelector('.toasts');
  if (!caja) { caja = document.createElement('div'); caja.className = 'toasts'; caja.setAttribute('role', 'status'); document.body.append(caja); }
  const t = document.createElement('div');
  t.className = `toast ${tipo ? 'toast--' + tipo : ''}`;
  t.textContent = msg;
  caja.append(t);
  setTimeout(() => t.remove(), tipo === 'mal' ? 6000 : 3500);
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
  const cerrar = (valor) => {
    fondo.remove();
    document.removeEventListener('keydown', teclas);
    document.body.style.overflow = '';
    anterior?.focus?.();
    alCerrar?.(valor);
  };
  const teclas = (e) => { if (e.key === 'Escape') cerrar(null); };
  fondo.addEventListener('click', (e) => { if (e.target === fondo || e.target.closest('[data-cerrar]')) cerrar(null); });
  document.addEventListener('keydown', teclas);
  document.body.append(fondo);
  document.body.style.overflow = 'hidden';
  const foco = fondo.querySelector('[autofocus], input, select, textarea') || fondo.querySelector('.modal__cerrar');
  foco?.focus();
  return { el: fondo.querySelector('.modal'), cerrar };
}

export function confirmar({ titulo, texto, boton = 'Confirmar', peligro = false }) {
  return new Promise((ok) => {
    const m = modal({
      titulo, alCerrar: (v) => ok(!!v),
      contenido: html`<div class="pila"><p>${texto}</p>
        <div class="modal__acciones">
          <button class="btn btn--sec" data-cerrar type="button">Cancelar</button>
          <button class="btn ${peligro ? 'btn--peligro' : 'btn--principal'}" data-si type="button">${boton}</button>
        </div></div>`
    });
    m.el.querySelector('[data-si]').addEventListener('click', () => m.cerrar(true));
  });
}

export function pedirTexto({ titulo, texto, label, boton = 'Confirmar', placeholder = '', peligro = false }) {
  return new Promise((ok) => {
    const m = modal({
      titulo, alCerrar: (v) => ok(v ?? null),
      contenido: html`<form class="form" novalidate>
        ${texto ? html`<p>${texto}</p>` : ''}
        <div class="campo"><label for="pt-in">${label}</label><textarea id="pt-in" class="textarea" required placeholder="${placeholder}" maxlength="200"></textarea></div>
        <div class="modal__acciones">
          <button class="btn btn--sec" data-cerrar type="button">Cancelar</button>
          <button class="btn ${peligro ? 'btn--peligro' : 'btn--principal'}" type="submit">${boton}</button>
        </div></form>`
    });
    m.el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = m.el.querySelector('textarea').value.trim();
      if (!v) { m.el.querySelector('textarea').setAttribute('aria-invalid', 'true'); return; }
      m.cerrar(v);
    });
  });
}

// Deshabilita el botón mientras corre la acción, así nadie guarda dos veces.
export async function conBoton(btn, fn) {
  if (btn.disabled) return;
  btn.disabled = true;
  const txt = btn.innerHTML;
  btn.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = txt; }
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
    <strong>${nombrePeriodo(periodo)}</strong>
    <button type="button" data-mes="${sumarMeses(periodo, 1)}" aria-label="Mes siguiente" ${periodo >= max ? raw('disabled') : ''}>${icono('der')}</button>
  </div>`;
}

export const cargando = () => html`<div class="cargando" aria-label="Cargando"></div>`;

// ── Íconos (trazo 2px, estilo propio) ───────────────────────────────────────
const P = {
  inicio: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  avion: '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  cuenta: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2.4.6 4 2.3 4 5.2"/>',
  panel: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  cierre: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  hangar: '<path d="M2 20V10l10-6 10 6v10"/><path d="M6 20v-7h12v7"/>',
  reporte: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  escudo: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  izq: '<path d="M15 18l-6-6 6-6"/>',
  der: '<path d="M9 18l6-6-6-6"/>',
  flecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  alerta: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  nota: '<path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4"/>',
  pdf: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 14h6M9 17h4"/>',
  wa: '<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.4z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2z"/>',
  pago: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  anular: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  ajuste: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  descargar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  llave: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M16 7l3 3M14 9l2 2"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  instructor: '<path d="M22 10L12 5 2 10l10 5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
  cadena: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  imprimir: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'
};
export function icono(nombre) {
  return raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[nombre] || ''}</svg>`);
}

// Ala roja del escudo (trazada del logo original).
export const ALA = 'M14 466L122 461L170 457L212 451L260 439L302 421L344 398L380 375L446 343L506 318L554 302L560 302L584 295L608 291L656 291L680 297L704 312L710 314L710 318L632 317L572 325L542 333L506 346L470 365L446 381L416 407L368 458L344 489L314 533L272 609L254 568L236 536L212 507L200 496L188 489L176 483L152 475L122 470L86 469L26 472L14 470Z';
export const ala = (clase) => raw(`<svg class="${clase}" viewBox="0 280 720 340" aria-hidden="true"><path d="${ALA}"/></svg>`);

export function hoyLargo() {
  const s = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
