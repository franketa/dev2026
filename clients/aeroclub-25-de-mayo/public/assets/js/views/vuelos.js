import { get, html, raw, pintar, icono, pesos, horas, fecha, periodoHoy, selectorMes, datosForm, ayuda } from '../lib.js';
import { tiraVuelo, mapaOrden, abrirVuelo, vacio } from './comun.js';

function resumen(vuelos) {
  const validos = vuelos.filter(v => v.estado !== 'anulado');
  const suma = (lista, campo) => lista.reduce((s, v) => s + v[campo], 0);
  const facturados = validos.filter(v => v.estado === 'cerrado');
  const abiertos = validos.filter(v => v.estado === 'abierto');
  return {
    n: validos.length,
    decimas: suma(validos, 'decimas'),
    importe: suma(validos, 'importe'),
    instruccion: suma(validos.filter(v => v.tipo === 'instruccion'), 'decimas'),
    facturados: { n: facturados.length, decimas: suma(facturados, 'decimas'), importe: suma(facturados, 'importe') },
    abiertos: { n: abiertos.length, decimas: suma(abiertos, 'decimas'), importe: suma(abiertos, 'importe') }
  };
}

const cantVuelos = (n) => `${n} ${n === 1 ? 'vuelo' : 'vuelos'}`;

// Lo volado en el mes, separado en lo que ya entró en un cupón y lo que entra en el próximo cierre:
// sumado en un solo importe confundía (parecía una deuda).
function cifrasResumen(r, { instructor = false } = {}) {
  const solos = r.decimas - r.instruccion;
  return html`<div class="cifras">
    <div class="cifra"><span>Horas</span><strong>${horas(r.decimas)}</strong><small>${cantVuelos(r.n)}${r.instruccion ? `: ${horas(r.instruccion)} con instructor${solos ? ` y ${horas(solos)} solo` : ''}` : ''}</small></div>
    ${instructor ? html`<div class="cifra"><span>Alumnos distintos</span><strong>${r.alumnos}</strong></div>` : html`
      <div class="cifra"><span>Ya facturado ${ayuda(html`<p>Vuelos de este mes que ya entraron en un cierre: ${cantVuelos(r.facturados.n)}, ${horas(r.facturados.decimas)}. Están en tu cupón y en tu saldo; no se vuelven a cobrar.</p>`, '¿Qué es lo ya facturado?')}</span><strong>${pesos(r.facturados.importe)}</strong><small>${r.facturados.n ? `${cantVuelos(r.facturados.n)}, ${horas(r.facturados.decimas)}` : 'Ninguno todavía'}</small></div>
      <div class="cifra"><span>Para el próximo cierre ${ayuda(html`<p>Vuelos de este mes que todavía no entraron en un cierre: ${cantVuelos(r.abiertos.n)}, ${horas(r.abiertos.decimas)}. No están en tu saldo: se suman en el próximo cierre y van en ese cupón.</p>`, '¿Qué es para el próximo cierre?')}</span><strong>${pesos(r.abiertos.importe)}</strong><small>${r.abiertos.n ? `${cantVuelos(r.abiertos.n)}, ${horas(r.abiertos.decimas)}` : 'Nada pendiente'}</small></div>`}
  </div>`;
}

// Todo lo volado desde el primer vuelo cargado en el sistema, con el desglose por avión.
function historico(h, { instructor = false } = {}) {
  if (!h.vuelos) return '';
  const solos = h.decimas - h.decimas_instruccion;
  return html`<section class="panel">
    <div class="panel__cab"><div><h2>Desde el principio</h2><p>Todo lo ${instructor ? 'que diste' : 'que volaste'} desde el ${fecha(h.desde)}.</p></div></div>
    <div class="pila"><div class="cifras">
      <div class="cifra"><span>Horas totales</span><strong>${horas(h.decimas)}</strong><small>${cantVuelos(h.vuelos)}</small></div>
      ${instructor ? '' : html`
        <div class="cifra"><span>Con instructor</span><strong>${horas(h.decimas_instruccion)}</strong></div>
        <div class="cifra"><span>Solo</span><strong>${horas(solos)}</strong></div>`}
    </div>
    ${h.por_avion.length > 1 ? html`<div class="tabla-caja"><table class="tabla">
      <thead><tr><th>Avión</th><th class="num">Vuelos</th>${instructor ? '' : html`<th class="num">Con instructor</th>`}<th class="num">Horas</th></tr></thead>
      <tbody>${h.por_avion.map(a => html`<tr>
        <td><span class="matricula">${a.matricula}</span><div class="muted chico">${a.modelo}</div></td>
        <td class="num">${a.vuelos}</td>${instructor ? '' : html`<td class="num">${horas(a.decimas_instruccion)}</td>`}<td class="num"><strong>${horas(a.decimas)}</strong></td></tr>`)}</tbody>
    </table></div>` : ''}</div>
  </section>`;
}

function conQuery(base, q) {
  const s = new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
  return `${base}${s ? '?' + s : ''}`;
}

export async function misVuelos(ctx) {
  const periodo = ctx.query.periodo || periodoHoy();
  const como = ctx.usuario.es_instructor && ctx.query.como === 'instructor' ? 'instructor' : 'piloto';
  const [{ vuelos }, { aviones }, hist] = await Promise.all([
    get(conQuery('/api/vuelos', { periodo, como, incluir_anulados: 1 })),
    get('/api/aviones'),
    get(conQuery('/api/mis-horas', { como: como === 'instructor' ? 'instructor' : '' }))
  ]);
  const orden = mapaOrden(aviones);
  const r = resumen(vuelos);
  if (como === 'instructor') r.alumnos = new Set(vuelos.filter(v => v.estado !== 'anulado').map(v => v.piloto_id)).size;

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab">
      <div><h1>${como === 'instructor' ? 'Vuelos como instructor' : 'Mis vuelos'}</h1><p>Tocá un vuelo para ver el detalle.</p></div>
      <div class="vista__acciones">
        ${selectorMes(periodo)}
        ${hist.vuelos ? html`<a class="btn btn--sec" href="${conQuery('/api/mis-horas', { formato: 'csv', como: como === 'instructor' ? 'instructor' : '' })}" download>${icono('descargar')} Descargar ${como === 'instructor' ? 'horas dadas' : 'mis horas'} (Excel)</a>` : ''}
      </div>
    </div>
    ${ctx.usuario.es_instructor ? html`<div class="pestanas" role="tablist">
      <button role="tab" type="button" data-como="piloto" aria-selected="${como === 'piloto'}">Como piloto</button>
      <button role="tab" type="button" data-como="instructor" aria-selected="${como === 'instructor'}">Como instructor</button>
    </div>` : ''}
    ${cifrasResumen(r, { instructor: como === 'instructor' })}
    ${vuelos.length
      ? html`<div class="tiras">${vuelos.map(v => tiraVuelo(v, { piloto: como === 'instructor', ordenAvion: orden }))}</div>`
      : vacio(`No hay vuelos en este mes.`, como === 'piloto' ? html`<a class="btn btn--principal" href="#/cargar">${icono('mas')} Cargar vuelo</a>` : '')}
    ${historico(hist, { instructor: como === 'instructor' })}
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
        <a class="btn btn--principal" href="#/cargar" data-escritura>${icono('mas')} Cargar para un socio</a>
      </div>
    </div>
    <form class="filtros" id="filtros">
      ${selectorMes(q.periodo)}
      <select class="select" name="avion_id" aria-label="Avión"><option value="">Todos los aviones</option>${aviones.map(a => html`<option value="${a.id}" ${sel(a.id, q.avion_id)}>${a.matricula}</option>`)}</select>
      <select class="select" name="piloto_id" aria-label="Piloto"><option value="">Todos los pilotos</option>${usuarios.map(u => html`<option value="${u.id}" ${sel(u.id, q.piloto_id)}>${u.apellido}, ${u.nombre}</option>`)}</select>
      <select class="select" name="estado" aria-label="Estado">
        <option value="">Vigentes</option>
        <option value="abierto" ${sel('abierto', q.estado)}>Para el próximo cierre</option>
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
