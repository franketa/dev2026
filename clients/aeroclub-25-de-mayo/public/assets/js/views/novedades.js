// Novedades de la flota: mantenimiento revisa lo que anotan los pilotos y lo marca como verificado.
// Al verificarla, sale del panel de tesorería y del inicio de los pilotos; queda en "Verificadas".
import { get, post, html, raw, pintar, icono, fecha, fechaHora, periodoHoy, selectorMes, colorAvion, modal, toast, error, conBoton } from '../lib.js';
import { vacio } from './comun.js';

function tarjeta(n, { verificar }) {
  return html`<article class="novedad" style="--serie:${colorAvion(n.orden)}">
    <div class="novedad__cab">
      <span class="matricula">${n.matricula}</span>
      <span class="muted chico">${fecha(n.fecha)}${n.hora_salida ? `, ${n.hora_salida}–${n.hora_llegada}` : ''}, ${n.piloto}</span>
    </div>
    <p class="novedad__texto">${n.notas}</p>
    ${n.novedad_revisada_en
      ? html`<p class="novedad__revision">${icono('check')}<span>${n.revisada_por_nombre ? `Verificada por ${n.revisada_por_nombre}` : 'Marcada como revisada'} el ${fechaHora(n.novedad_revisada_en)}${n.novedad_comentario ? html`<br><b>${n.novedad_comentario}</b>` : ''}</span></p>`
      : verificar ? html`<div><button class="btn btn--principal btn--chico" type="button" data-verificar="${n.id}" data-escritura>${icono('check')} Marcar verificada</button></div>` : ''}
  </article>`;
}

function pedirVerificacion(n) {
  return new Promise((ok) => {
    const m = modal({
      titulo: `Verificar novedad de ${n.matricula}`,
      subtitulo: 'Sale del panel de tesorería y de los pilotos. Queda en el historial.',
      alCerrar: (v) => ok(v ?? null),
      contenido: html`<form class="form" novalidate>
        <p class="aviso aviso--info">${icono('nota')}<span>${n.notas}</span></p>
        <div class="campo"><label for="nv-com">Comentario <span class="muted">(opcional)</span></label>
          <textarea class="textarea" id="nv-com" name="comentario" maxlength="300" placeholder="Ej.: se cambió la cubierta, se completó el aceite"></textarea></div>
        <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">${icono('check')} Marcar verificada</button></div>
      </form>`
    });
    const form = m.el.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      conBoton(form.querySelector('[type=submit]'), async () => {
        try {
          const r = await post(`/api/mantenimiento/novedades/${n.id}/verificar`, { comentario: form.comentario.value });
          m.cerrar(r.novedad);
        } catch (err) { error(err); }
      });
    });
  });
}

export default async function novedades(ctx) {
  const ver = ctx.query.ver === 'verificadas' ? 'verificadas' : 'pendientes';
  const periodo = ctx.query.periodo || periodoHoy();
  const avion = ctx.query.avion || '';
  const qs = new URLSearchParams({ estado: ver === 'verificadas' ? 'verificada' : 'pendiente', ...(avion ? { avion } : {}), ...(ver === 'verificadas' ? { periodo } : {}) });
  const d = await get(`/api/mantenimiento/novedades?${qs}`);
  const puede = ['admin', 'mantenimiento'].includes(ctx.usuario.rol);
  const url = (cambios) => {
    const q = new URLSearchParams({ ...(ver === 'verificadas' ? { ver } : {}), ...(avion ? { avion } : {}), ...(ver === 'verificadas' ? { periodo } : {}), ...cambios });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    return `#/mantenimiento${q.toString() ? `?${q}` : ''}`;
  };

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab"><div><h1>Novedades de la flota</h1><p>Lo que anotan los pilotos al cargar el vuelo. Al verificarla, sale de los paneles y queda en el historial.</p></div></div>
    <div class="pestanas" role="tablist">
      <button type="button" role="tab" data-ver="pendientes" aria-selected="${ver === 'pendientes'}">Por verificar</button>
      <button type="button" role="tab" data-ver="verificadas" aria-selected="${ver === 'verificadas'}">Verificadas</button>
    </div>
    <form class="filtros" id="filtros">
      ${ver === 'verificadas' ? selectorMes(periodo) : ''}
      <select class="select" name="avion" aria-label="Avión">
        <option value="">Todos los aviones</option>
        ${d.aviones.map(a => html`<option value="${a.id}" ${String(a.id) === avion ? raw('selected') : ''}>${a.matricula} · ${a.modelo}</option>`)}
      </select>
    </form>
    ${d.novedades.length
      ? html`<div class="novedades">${d.novedades.map(n => tarjeta(n, { verificar: puede }))}</div>`
      : vacio(ver === 'pendientes' ? 'No hay novedades por verificar.' : 'No hay novedades verificadas en ese mes.')}
  </div>`);

  ctx.el.querySelector('#filtros').addEventListener('change', (e) => {
    if (e.target.name === 'avion') ctx.ir(url({ avion: e.target.value }));
  });
  ctx.el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-ver]');
    if (t) return ctx.ir(url({ ver: t.dataset.ver === 'verificadas' ? 'verificadas' : '' }));
    const mes = e.target.closest('[data-mes]');
    if (mes) return ctx.ir(url({ periodo: mes.dataset.mes }));
    const b = e.target.closest('[data-verificar]');
    if (b) {
      const n = d.novedades.find(x => x.id === Number(b.dataset.verificar));
      const r = await pedirVerificacion(n);
      if (!r) return;
      toast(`Novedad de ${n.matricula} verificada`, 'ok');
      ctx.recargar();
    }
  });
}
