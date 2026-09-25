import { get, html, raw, pintar, icono, pesos, horas, fecha, fechaCorta, nombrePeriodo, periodoHoy, selectorMes, colorAvion, esc } from '../lib.js';
import { tarjetaAvion, abrirVuelo, mapaOrden } from './comun.js';

// Ancho real aproximado del gráfico: se dibuja a escala 1:1 para que el texto no se deforme.
function anchoGrafico() {
  const vw = window.innerWidth;
  const util = vw >= 960 ? vw - 248 - 72 - 42 : vw - 32 - 42;
  return Math.round(Math.max(300, Math.min(900, vw >= 1100 ? util * 2 / 3 - 16 : util)));
}

// Barras apiladas de horas por día, una serie por avión (color fijo por avión).
function grafico(periodo, porDia, aviones) {
  const [y, m] = periodo.split('-').map(Number);
  const dias = new Date(y, m, 0).getDate();
  const W = anchoGrafico(); const H = 190; const izq = 30; const abajo = 22; const arriba = 8;
  const plotW = W - izq; const plotH = H - abajo - arriba;
  const porFecha = {};
  for (const r of porDia) (porFecha[r.fecha] ||= {})[r.avion_id] = r.decimas;
  const totales = Array.from({ length: dias }, (_, i) => Object.values(porFecha[`${periodo}-${String(i + 1).padStart(2, '0')}`] || {}).reduce((s, d) => s + d, 0));
  const maxDec = Math.max(20, ...totales);
  const paso = maxDec <= 40 ? 10 : maxDec <= 80 ? 20 : 50;          // décimas: líneas cada 1, 2 o 5 horas
  const tope = Math.ceil(maxDec / paso) * paso;
  const yEsc = (d) => arriba + plotH - (d / tope) * plotH;
  const colW = plotW / dias;
  const barW = Math.max(4, Math.min(16, colW - 4));

  let marcas = '';
  for (let v = 0; v <= tope; v += paso) {
    marcas += `<line class="${v === 0 ? 'grafico__base' : 'grafico__grilla'}" x1="${izq}" x2="${W}" y1="${yEsc(v)}" y2="${yEsc(v)}"/>`;
    marcas += `<text class="grafico__eje" x="${izq - 6}" y="${yEsc(v) + 4}" text-anchor="end">${v / 10}</text>`;
  }
  let barras = '';
  for (let i = 0; i < dias; i++) {
    const f = `${periodo}-${String(i + 1).padStart(2, '0')}`;
    const x = izq + i * colW + (colW - barW) / 2;
    let base = 0;
    const segs = aviones.filter(a => porFecha[f]?.[a.id]);
    segs.forEach((a, k) => {
      const d = porFecha[f][a.id];
      const y0 = yEsc(base); const y1 = yEsc(base + d);
      const alto = Math.max(1, y0 - y1 - (k > 0 ? 2 : 0));      // 2px de separación entre segmentos
      const top = y0 - (k > 0 ? 2 : 0) - alto;
      const r = k === segs.length - 1 ? Math.min(4, alto, barW / 2) : 0;
      barras += `<path style="fill:${colorAvion(a.orden)}" d="M${x},${top + alto}V${top + r}q0,-${r} ${r},-${r}h${barW - 2 * r}q${r},0 ${r},${r}V${top + alto}Z"/>`;
      base += d;
    });
    if ((i + 1) === 1 || (i + 1) % 5 === 0) barras += `<text class="grafico__eje" x="${izq + i * colW + colW / 2}" y="${H - 6}" text-anchor="middle">${i + 1}</text>`;
    barras += `<rect class="grafico__hit" data-dia="${i}" x="${izq + i * colW}" y="${arriba}" width="${colW}" height="${plotH}" tabindex="${totales[i] ? 0 : -1}" aria-label="${esc(`${i + 1}: ${horas(totales[i])}`)}"/>`;
  }
  return { svg: raw(`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Horas voladas por día en ${esc(nombrePeriodo(periodo))}">${marcas}${barras}</svg>`), porFecha, dias, W, izq, colW };
}

export default async function panel(ctx) {
  const periodo = ctx.query.periodo || periodoHoy();
  const d = await get(`/api/admin/panel?periodo=${periodo}`);
  const aviones = d.aviones.length ? d.aviones : d.por_avion;
  const orden = mapaOrden(aviones);
  const totalDec = d.por_avion.reduce((s, a) => s + a.decimas, 0);
  const totalImp = d.por_avion.reduce((s, a) => s + a.importe, 0);
  const totalVuelos = d.por_avion.reduce((s, a) => s + a.vuelos, 0);
  const g = grafico(periodo, d.por_dia, d.por_avion.map(a => ({ ...a, orden: orden[a.id] })));
  const pc = d.proximo_cierre;
  const alertas = [
    ...d.aviones.filter(a => a.huecos).map(a => html`<a class="aviso" href="#/admin/flota/${a.id}/tacometro">${icono('alerta')}<span><b>${a.matricula}</b>: ${a.huecos} ${a.huecos === 1 ? 'tramo' : 'tramos'} del tacómetro sin cargar.</span></a>`),
    ...d.aviones.filter(a => a.inspeccion_restante != null && a.inspeccion_restante <= 100).map(a => html`<a class="aviso ${a.inspeccion_restante <= 0 ? 'aviso--mal' : ''}" href="#/admin/flota">${icono('reloj')}<span><b>${a.matricula}</b>: ${a.inspeccion_restante > 0 ? `faltan ${horas(a.inspeccion_restante)} para la inspección.` : 'inspección vencida.'}</span></a>`)
  ];

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab"><div><h1>Panel</h1><p>Cómo viene el mes en el aeroclub.</p></div>${selectorMes(periodo)}</div>

    <div class="cifras">
      <div class="cifra"><span>Horas voladas</span><strong>${horas(totalDec)}</strong><small>${totalVuelos} vuelos de ${d.pilotos_activos} ${d.pilotos_activos === 1 ? 'piloto' : 'pilotos'}</small></div>
      <div class="cifra"><span>Facturación de vuelos</span><strong>${pesos(totalImp)}</strong></div>
      <div class="cifra"><span>Cobrado en ${nombrePeriodo(periodo).split(' ')[0]}</span><strong>${pesos(d.cobrado.total)}</strong><small>${d.cobrado.pagos} ${d.cobrado.pagos === 1 ? 'pago' : 'pagos'}</small></div>
      <div class="cifra"><span>Deuda de socios hoy</span><strong>${pesos(d.deuda.total)}</strong><small><a href="#/admin/cuentas?ver=deudores">${d.deuda.socios} ${d.deuda.socios === 1 ? 'socio' : 'socios'} con saldo</a></small></div>
    </div>

    <div class="grilla grilla--panel">
      <section class="panel" style="min-width:0">
        <div class="panel__cab"><h2>Horas por día</h2><a class="btn btn--fantasma btn--chico" href="#/admin/reportes?periodo=${periodo}">Ver tabla</a></div>
        <div class="grafico" id="grafico">
          <div class="grafico__leyenda">${d.por_avion.map(a => html`<span><i style="--c:${colorAvion(orden[a.id])}"></i><b class="matricula">${a.matricula}</b> ${horas(a.decimas)}</span>`)}</div>
          ${totalDec ? g.svg : html`<div class="vacio"><p>Todavía no hay vuelos en ${nombrePeriodo(periodo)}.</p></div>`}
        </div>
      </section>

      <section class="cierre-proximo">
        <div><p class="muted">Próximo cierre</p><h2 style="text-transform:capitalize">${nombrePeriodo(pc.periodo)}</h2></div>
        <p>${pc.pendientes.length ? html`<strong>El mes ya terminó.</strong> ${pc.automatico ? `Se cierra solo el ${fecha(pc.fecha)} a las ${pc.hora} h, o cerralo ahora.` : 'El cierre automático está apagado: cerralo a mano.'}`
          : pc.automatico ? `El sistema lo cierra solo el ${fecha(pc.fecha)} a las ${pc.hora} h y genera los cupones.` : 'El cierre automático está apagado.'}</p>
        <a class="btn ${pc.pendientes.length ? 'btn--principal' : 'btn--sec'}" href="#/admin/cierres">${icono('cierre')} ${pc.pendientes.length ? 'Revisar y cerrar' : 'Ver cierres'}</a>
      </section>
    </div>

    ${alertas.length ? html`<section class="pila"><h2>Para revisar</h2><div class="alertas">${alertas}</div></section>` : ''}

    <div class="grilla grilla--2">
      <section class="pila"><h2>La flota</h2>${d.aviones.map(a => tarjetaAvion(a, { admin: true }))}</section>
      <section class="panel">
        <div class="panel__cab"><h2>Novedades de los pilotos</h2></div>
        ${d.novedades.length ? d.novedades.map(v => html`
          <button type="button" class="nota-vuelo" data-vuelo="${v.id}" style="text-align:left;background:none;border:0;border-bottom:1px solid var(--linea-2);cursor:pointer;width:100%">
            <p>${v.notas}</p><small><b class="matricula">${v.matricula}</b>, ${fechaCorta(v.fecha)}, ${v.piloto}</small>
          </button>`) : html`<p class="muted">Cuando un piloto anota algo al cargar el vuelo (aceite, cubiertas, radio), aparece acá.</p>`}
      </section>
    </div>
  </div>`);

  // Tooltip por día
  const caja = ctx.el.querySelector('#grafico');
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.hidden = true;
  caja.append(tip);
  const mostrar = (hit) => {
    const i = Number(hit.dataset.dia);
    const f = `${periodo}-${String(i + 1).padStart(2, '0')}`;
    const valores = g.porFecha[f];
    if (!valores) { tip.hidden = true; return; }
    const total = Object.values(valores).reduce((s, x) => s + x, 0);
    pintar(tip, html`<b>${fechaCorta(f)}</b>${d.por_avion.filter(a => valores[a.id]).map(a => html`<div><span><i style="--c:${colorAvion(orden[a.id])}"></i>${a.matricula}</span><span>${horas(valores[a.id])}</span></div>`)}<div><span>Total</span><span>${horas(total)}</span></div>`);
    const svg = caja.querySelector('svg');
    const escala = svg.getBoundingClientRect().width / g.W;
    tip.style.left = `${(g.izq + i * g.colW + g.colW / 2) * escala}px`;
    tip.style.top = `${svg.offsetTop + 10}px`;
    tip.hidden = false;
  };
  caja.addEventListener('mouseover', (e) => { const h = e.target.closest('.grafico__hit'); if (h) mostrar(h); });
  caja.addEventListener('focusin', (e) => { const h = e.target.closest('.grafico__hit'); if (h) mostrar(h); });
  caja.addEventListener('mouseleave', () => { tip.hidden = true; });
  caja.addEventListener('focusout', () => { tip.hidden = true; });

  ctx.el.addEventListener('click', (e) => {
    const mes = e.target.closest('[data-mes]');
    if (mes) ctx.ir(`#/panel?periodo=${mes.dataset.mes}`);
    const v = e.target.closest('[data-vuelo]');
    if (v) abrirVuelo(Number(v.dataset.vuelo), ctx, { alCambiar: ctx.recargar });
  });
}
