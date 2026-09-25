import { get, html, pintar, icono, pesos, horas, nombrePeriodo, periodoHoy, selectorMes } from '../lib.js';

export default async function reportes(ctx) {
  const periodo = ctx.query.periodo || periodoHoy();
  const r = await get(`/api/admin/reportes?periodo=${periodo}`);
  const tot = r.por_avion.reduce((s, a) => ({ vuelos: s.vuelos + a.vuelos, decimas: s.decimas + a.decimas, solo: s.solo + a.decimas_solo, inst: s.inst + a.decimas_instruccion, importe: s.importe + a.importe }), { vuelos: 0, decimas: 0, solo: 0, inst: 0, importe: 0 });

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab">
      <div><h1>Reporte de <span style="text-transform:capitalize">${nombrePeriodo(periodo)}</span></h1><p>Lo que voló cada avión y cada piloto en el mes.</p></div>
      <div class="vista__acciones">
        ${selectorMes(periodo)}
        <a class="btn btn--sec" href="/api/admin/reportes?periodo=${periodo}&formato=csv">${icono('descargar')} Excel (CSV)</a>
        <button class="btn btn--sec" type="button" data-imprimir>${icono('imprimir')} Imprimir</button>
      </div>
    </div>

    <section class="panel">
      <div class="panel__cab"><h2>Por avión</h2></div>
      ${r.por_avion.length ? html`<div class="tabla-caja"><table class="tabla">
        <thead><tr><th>Avión</th><th class="num">Vuelos</th><th class="num">Sin instructor</th><th class="num">Con instructor</th><th class="num">Total horas</th><th class="num">Importe</th></tr></thead>
        <tbody>${r.por_avion.map(a => html`<tr>
          <td><span class="matricula">${a.matricula}</span><div class="muted chico">${a.modelo}</div></td>
          <td class="num">${a.vuelos}</td><td class="num">${horas(a.decimas_solo)}</td><td class="num">${horas(a.decimas_instruccion)}</td>
          <td class="num"><strong>${horas(a.decimas)}</strong></td><td class="num monto">${pesos(a.importe)}</td></tr>`)}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${tot.vuelos}</td><td class="num">${horas(tot.solo)}</td><td class="num">${horas(tot.inst)}</td><td class="num">${horas(tot.decimas)}</td><td class="num">${pesos(tot.importe)}</td></tr></tfoot>
      </table></div>` : html`<p class="muted">No hay vuelos en ${nombrePeriodo(periodo)}.</p>`}
    </section>

    <div class="grilla grilla--2">
      <section class="panel">
        <div class="panel__cab"><h2>Por piloto</h2></div>
        ${r.por_piloto.length ? html`<div class="tabla-caja"><table class="tabla">
          <thead><tr><th>Piloto</th><th class="num">Vuelos</th><th class="num">Horas</th><th class="num">Importe</th></tr></thead>
          <tbody>${r.por_piloto.map(p => html`<tr data-href="#/admin/cuentas/${p.id}"><td>${p.apellido}, ${p.nombre}${p.decimas_instruccion ? html`<div class="muted chico">${horas(p.decimas_instruccion)} con instructor</div>` : ''}</td>
            <td class="num">${p.vuelos}</td><td class="num">${horas(p.decimas)}</td><td class="num monto">${pesos(p.importe)}</td></tr>`)}</tbody>
        </table></div>` : html`<p class="muted">Sin datos.</p>`}
      </section>
      <section class="panel">
        <div class="panel__cab"><h2>Por instructor</h2></div>
        ${r.por_instructor.length ? html`<div class="tabla-caja"><table class="tabla">
          <thead><tr><th>Instructor</th><th class="num">Vuelos</th><th class="num">Alumnos</th><th class="num">Horas</th></tr></thead>
          <tbody>${r.por_instructor.map(p => html`<tr><td>${p.apellido}, ${p.nombre}</td><td class="num">${p.vuelos}</td><td class="num">${p.alumnos}</td><td class="num">${horas(p.decimas)}</td></tr>`)}</tbody>
        </table></div>` : html`<p class="muted">No hubo vuelos de instrucción.</p>`}
      </section>
    </div>
  </div>`);

  ctx.el.addEventListener('click', (e) => {
    const mes = e.target.closest('[data-mes]');
    if (mes) return ctx.ir(`#/admin/reportes?periodo=${mes.dataset.mes}`);
    if (e.target.closest('[data-imprimir]')) return window.print();
    const fila = e.target.closest('tr[data-href]');
    if (fila) ctx.ir(fila.dataset.href);
  });
}
