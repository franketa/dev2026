import { get, html, raw, pintar, icono, pesos, horas, periodoHoy, selectorMes, datosForm } from '../lib.js';
import { tiraVuelo, mapaOrden, abrirVuelo, vacio } from './comun.js';

function resumen(vuelos) {
  const validos = vuelos.filter(v => v.estado !== 'anulado');
  return {
    n: validos.length,
    decimas: validos.reduce((s, v) => s + v.decimas, 0),
    importe: validos.reduce((s, v) => s + v.importe, 0),
    instruccion: validos.filter(v => v.tipo === 'instruccion').reduce((s, v) => s + v.decimas, 0)
  };
}

function cifrasResumen(r, { instructor = false } = {}) {
  return html`<div class="cifras">
    <div class="cifra"><span>Horas</span><strong>${horas(r.decimas)}</strong><small>${r.n} ${r.n === 1 ? 'vuelo' : 'vuelos'}</small></div>
    ${instructor ? html`<div class="cifra"><span>Alumnos distintos</span><strong>${r.alumnos}</strong></div>`
      : html`<div class="cifra"><span>Importe</span><strong>${pesos(r.importe)}</strong><small>${horas(r.instruccion)} con instructor</small></div>`}
  </div>`;
}

function conQuery(base, q) {
  const s = new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
  return `${base}${s ? '?' + s : ''}`;
}

export async function misVuelos(ctx) {
  const periodo = ctx.query.periodo || periodoHoy();
  const como = ctx.usuario.es_instructor && ctx.query.como === 'instructor' ? 'instructor' : 'piloto';
  const [{ vuelos }, { aviones }] = await Promise.all([
    get(conQuery('/api/vuelos', { periodo, como, incluir_anulados: 1 })),
    get('/api/aviones')
  ]);
  const orden = mapaOrden(aviones);
  const r = resumen(vuelos);
  if (como === 'instructor') r.alumnos = new Set(vuelos.filter(v => v.estado !== 'anulado').map(v => v.piloto_id)).size;

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab">
      <div><h1>${como === 'instructor' ? 'Vuelos como instructor' : 'Mis vuelos'}</h1><p>Tocá un vuelo para ver el detalle o corregirlo.</p></div>
      ${selectorMes(periodo)}
    </div>
    ${ctx.usuario.es_instructor ? html`<div class="pestanas" role="tablist">
      <button role="tab" type="button" data-como="piloto" aria-selected="${como === 'piloto'}">Como piloto</button>
      <button role="tab" type="button" data-como="instructor" aria-selected="${como === 'instructor'}">Como instructor</button>
    </div>` : ''}
    ${cifrasResumen(r, { instructor: como === 'instructor' })}
    ${vuelos.length
      ? html`<div class="tiras">${vuelos.map(v => tiraVuelo(v, { piloto: como === 'instructor', ordenAvion: orden }))}</div>`
      : vacio(`No hay vuelos en este mes.`, como === 'piloto' ? html`<a class="btn btn--principal" href="#/cargar">${icono('mas')} Cargar vuelo</a>` : '')}
  </div>`);

  ctx.el.addEventListener('click', (e) => {
    const mes = e.target.closest('[data-mes]');
    if (mes) ctx.ir(conQuery('#/vuelos', { periodo: mes.dataset.mes, como: como === 'instructor' ? 'instructor' : '' }));
    const tab = e.target.closest('[data-como]');
    if (tab) ctx.ir(conQuery('#/vuelos', { periodo, como: tab.dataset.como === 'instructor' ? 'instructor' : '' }));
    const t = e.target.closest('[data-vuelo]');
    if (t) abrirVuelo(Number(t.dataset.vuelo), ctx, { alCambiar: ctx.recargar });
  });
}

export async function vuelosAdmin(ctx) {
  const q = { periodo: ctx.query.periodo || periodoHoy(), avion_id: ctx.query.avion_id || '', piloto_id: ctx.query.piloto_id || '', estado: ctx.query.estado || '' };
  const [{ vuelos }, { aviones }, { usuarios }] = await Promise.all([
    get(conQuery('/api/vuelos', { ...q, incluir_anulados: 1 })),
    get('/api/admin/aviones'),
    get('/api/admin/usuarios')
  ]);
  const orden = mapaOrden(aviones);
  const r = resumen(vuelos);
  const sel = (v, actual) => String(v) === String(actual) ? raw('selected') : '';

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab">
      <div><h1>Vuelos</h1><p>Todos los vuelos cargados por los socios.</p></div>
      <div class="vista__acciones">
        <a class="btn btn--sec" href="/api/admin/reportes?periodo=${q.periodo}&formato=csv">${icono('descargar')} Excel (CSV)</a>
        <a class="btn btn--principal" href="#/cargar">${icono('mas')} Cargar para un socio</a>
      </div>
    </div>
    <form class="filtros" id="filtros">
      ${selectorMes(q.periodo)}
      <select class="select" name="avion_id" aria-label="Avión"><option value="">Todos los aviones</option>${aviones.map(a => html`<option value="${a.id}" ${sel(a.id, q.avion_id)}>${a.matricula}</option>`)}</select>
      <select class="select" name="piloto_id" aria-label="Piloto"><option value="">Todos los pilotos</option>${usuarios.map(u => html`<option value="${u.id}" ${sel(u.id, q.piloto_id)}>${u.apellido}, ${u.nombre}</option>`)}</select>
      <select class="select" name="estado" aria-label="Estado">
        <option value="">Vigentes</option>
        <option value="abierto" ${sel('abierto', q.estado)}>A facturar</option>
        <option value="cerrado" ${sel('cerrado', q.estado)}>Facturados</option>
        <option value="anulado" ${sel('anulado', q.estado)}>Anulados</option>
      </select>
    </form>
    <div class="cifras">
      <div class="cifra"><span>Horas</span><strong>${horas(r.decimas)}</strong><small>${r.n} ${r.n === 1 ? 'vuelo' : 'vuelos'}</small></div>
      <div class="cifra"><span>Con instructor</span><strong>${horas(r.instruccion)}</strong><small>${horas(r.decimas - r.instruccion)} solos</small></div>
      <div class="cifra"><span>Importe</span><strong>${pesos(r.importe)}</strong></div>
    </div>
    ${vuelos.length ? html`<div class="tiras">${vuelos.map(v => tiraVuelo(v, { piloto: true, ordenAvion: orden }))}</div>` : vacio('No hay vuelos con esos filtros.')}
  </div>`);

  const form = ctx.el.querySelector('#filtros');
  form.addEventListener('change', () => ctx.ir(conQuery('#/admin/vuelos', { ...q, ...datosForm(form) })));
  ctx.el.addEventListener('click', (e) => {
    const mes = e.target.closest('[data-mes]');
    if (mes) ctx.ir(conQuery('#/admin/vuelos', { ...q, periodo: mes.dataset.mes }));
    const t = e.target.closest('[data-vuelo]');
    if (t) abrirVuelo(Number(t.dataset.vuelo), ctx, { alCambiar: ctx.recargar });
  });
}
