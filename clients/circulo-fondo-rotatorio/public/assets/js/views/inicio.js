// Inicio de una sede: el saldo bien grande, los botones de todos los días y lo que está pendiente.

import { get, html, pintar, icono, pesos, fecha, nombrePeriodo, capital } from '../lib.js';
import { tarjetaSaldo, moverEfectivo, pedirFondosExtra } from './fondos.js';
import { itemSolicitud } from './solicitudes.js';

export default async function inicio(ctx) {
  const d = await get('/api/inicio');
  if (d.tipo !== 'sede') { location.reload(); return; } // la sesión cambió de usuario en otra pestaña
  const nombre = ctx.usuario.nombre;
  const alertas = [];
  if (d.rendicion_pendiente) {
    alertas.push(html`<div class="aviso">${icono('rendicion')}<span>La rendición de <b>${nombrePeriodo(d.rendicion_pendiente.periodo)}</b> ${d.rendicion_pendiente.estado === 'cerrada_firmada' ? 'está firmada pero todavía no se envió' : 'todavía no se cerró'}.
      ${ctx.puede('rendicion.cerrar') ? html` <a href="#/rendicion/${d.rendicion_pendiente.periodo}">Ir a la rendición</a>` : ''}</span></div>`);
  }
  if (d.nd.pct > d.nd.umbral) {
    alertas.push(html`<div class="aviso aviso--mal">${icono('alerta')}<span>Los gastos sin descripción (N/D) ya son el <b>${String(d.nd.pct).replace('.', ',')} %</b> de lo gastado este mes. Revisalos y asignales el rubro que corresponde.</span></div>`);
  }
  if (d.pedido_pendiente) alertas.push(html`<div class="aviso aviso--info">${icono('reloj')}<span>Pediste ${pesos(d.pedido_pendiente.importe)} de fondos extra: está esperando la respuesta del Presidente.</span></div>`);

  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>Hola, ${nombre}</h1><p>${d.sede.nombre} · ${capital(nombrePeriodo(d.periodo))}</p></div></div>
    ${tarjetaSaldo(d.saldos, `Fondo del mes ${pesos(d.fondo_recibido)}${d.fondo_extra ? ` (incluye ${pesos(d.fondo_extra)} extra)` : ''} · gastado ${pesos(d.gastado_sede)}${d.pagado_central ? ` · la Central pagó ${pesos(d.pagado_central)} con cargo a la sede` : ''}`)}
    ${alertas}
    <div class="acciones">
      ${ctx.puede('gastos.cargar') ? html`<a class="accion accion--principal" href="#/cargar">${icono('mas')}<span>Cargar gasto<small>en menos de un minuto</small></span></a>` : ''}
      ${ctx.puede('solicitudes.crear') ? html`<a class="accion" href="#/solicitudes/nueva">${icono('solicitud')}<span>Pedir aprobación<small>gastos que superan los topes</small></span></a>` : ''}
      ${ctx.puede('fondos.extraccion') ? html`<button class="accion" type="button" data-extraccion>${icono('efectivo')}<span>Sacar efectivo<small>del banco a la caja</small></span></button>` : ''}
      ${ctx.puede('fondos.pedir_extra') && !d.pedido_pendiente ? html`<button class="accion" type="button" data-extra>${icono('enviar')}<span>Pedir fondos extra<small>al Presidente</small></span></button>` : ''}
      ${ctx.puede('rendicion.cerrar') ? html`<a class="accion" href="#/rendicion">${icono('rendicion')}<span>Rendición del mes<small>cerrar, firmar y enviar</small></span></a>` : ''}
    </div>
    <div class="grilla grilla--2">
      <section class="pila">
        <div class="panel__cab" style="margin:0"><h2>Últimos gastos</h2><a href="#/gastos" class="chico">Ver todos</a></div>
        ${d.reciente.length ? html`<div class="lista">${d.reciente.map(g => html`<a class="item" href="#/gastos/${g.id}">
          <span class="item__icono ${g.pagado_por === 'central' ? 'item__icono--central' : ''}">${icono(g.pagado_por === 'central' ? 'edificio' : g.medio === 'efectivo' ? 'efectivo' : 'banco')}</span>
          <div class="item__texto"><strong>${g.proveedor}</strong><small>${fecha(g.fecha_pago)} · ${g.rubro}${g.adjunto_estado === 'pendiente' ? ' · foto pendiente' : ''}</small></div>
          <div class="item__monto">${pesos(g.bruto)}</div></a>`)}</div>` : html`<p class="muted">Todavía no hay gastos.</p>`}
      </section>
      <section class="pila">
        <div class="panel__cab" style="margin:0"><h2>Solicitudes</h2><a href="#/solicitudes" class="chico">Ver todas</a></div>
        ${d.solicitudes.length ? html`<div class="lista">${d.solicitudes.map(s => itemSolicitud(s, false))}</div>` : html`<p class="muted">No hay solicitudes.</p>`}
      </section>
    </div>
  </div>`);
  ctx.el.querySelector('[data-extraccion]')?.addEventListener('click', () => moverEfectivo(d.sede.id, 'extraccion', () => ctx.recargar()));
  ctx.el.querySelector('[data-extra]')?.addEventListener('click', () => pedirFondosExtra(d.saldos, () => ctx.recargar()));
}
