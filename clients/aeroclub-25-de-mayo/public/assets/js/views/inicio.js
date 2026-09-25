import { get, html, pintar, icono, pesos, horas, fecha, nombrePeriodo, mesDe, chipCupon, ala, hoyLargo } from '../lib.js';
import { tiraVuelo, tarjetaAvion, mapaOrden, abrirVuelo, vacio } from './comun.js';

export default async function inicio(ctx) {
  const d = await get('/api/inicio');
  const { usuario } = ctx;
  const orden = mapaOrden(d.aviones);
  const debe = d.saldo > 0;
  const cup = d.ultimo_cupon;
  const cierre = d.proximo_cierre;

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab"><div><h1>Hola, ${usuario.nombre}</h1><p>${hoyLargo()}</p></div></div>

    <section class="saldo" aria-label="Tu saldo">
      ${ala('saldo__ala')}
      <div>
        <div class="saldo__etiqueta">${debe ? 'Tu saldo a pagar' : d.saldo < 0 ? 'Tenés saldo a favor' : 'Tu cuenta'}</div>
        <div class="saldo__monto">${pesos(Math.abs(d.saldo))}</div>
        <div class="saldo__estado">${debe
          ? html`<span class="chip chip--pend">${cup && cup.estado === 'parcial' ? 'Pago parcial registrado' : cup?.vencido ? 'Cupón vencido' : cup ? `Vence el ${fecha(cup.vencimiento)}` : 'Pendiente'}</span>`
          : html`<span class="chip chip--ok">Estás al día</span>`}</div>
      </div>
      <div class="saldo__pie">
        <div><span>Volaste en ${mesDe(d.periodo)}</span><strong>${horas(d.mes.decimas)}</strong></div>
        <div><span>A facturar en el cierre</span><strong>${pesos(d.abiertos.importe)}</strong></div>
        ${d.instruccion ? html`<div><span>Como instructor</span><strong>${horas(d.instruccion.decimas)}</strong></div>` : ''}
      </div>
    </section>

    <a class="cta-cargar" href="#/cargar">${icono('avion')}<div><strong>Cargar vuelo</strong><span>Recién aterrizaste: anotá las horas</span></div>${icono('der')}</a>

    <div class="grilla grilla--2">
      <section class="panel">
        <div class="panel__cab"><h2>Último cupón</h2>${cup ? html`<a class="btn btn--fantasma btn--chico" href="#/cuenta">Ver cuenta</a>` : ''}</div>
        ${cup ? html`
          <div class="pila" style="gap:12px">
            <div class="avion__cab" style="gap:12px">
              <div><strong class="monto" style="font-size:1.6rem">${pesos(Math.max(cup.total, 0))}</strong><div class="muted chico">Cupón ${cup.numero} de ${nombrePeriodo(cup.periodo)}</div></div>
              <span style="margin-left:auto">${chipCupon(cup)}</span>
            </div>
            <a class="btn btn--sec" href="/api/cupones/${cup.id}/pdf" target="_blank" rel="noopener">${icono('pdf')} Ver cupón en PDF</a>
          </div>`
        : html`<p class="muted">Tu primer cupón se genera en el cierre de ${nombrePeriodo(cierre.periodo)}, el ${fecha(cierre.fecha)}.</p>`}
      </section>

      <section class="panel">
        <div class="panel__cab"><h2>Últimos vuelos</h2><a class="btn btn--fantasma btn--chico" href="#/vuelos">Ver todos</a></div>
        ${d.ultimos_vuelos.length
          ? html`<div class="tiras">${d.ultimos_vuelos.map(v => tiraVuelo(v, { ordenAvion: orden }))}</div>`
          : vacio('Todavía no cargaste vuelos.', html`<a class="btn btn--principal" href="#/cargar">Cargar el primero</a>`)}
      </section>
    </div>

    <section class="pila">
      <h2>La flota</h2>
      <div class="grilla grilla--2">${d.aviones.map(a => tarjetaAvion(a))}</div>
    </section>
  </div>`);

  ctx.el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-vuelo]');
    if (t) abrirVuelo(Number(t.dataset.vuelo), ctx, { alCambiar: ctx.recargar });
  });
}
