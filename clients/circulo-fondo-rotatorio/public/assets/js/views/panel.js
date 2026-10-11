// Panel diario de la Sede Central: lo que hay que resolver hoy, de todas las sedes, en uno o dos clics.

import { get, post, html, pintar, icono, pesos, fechaHora, error, toast, pedirTexto, confirmar, nombrePeriodo, capital, chipRendicion, chipSolicitud } from '../lib.js';
import { resolverSolicitud, puedeResolver } from './solicitudes.js';

export default async function panel(ctx) {
  const d = await get('/api/central/panel');
  const hoyLargo = capital(new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' }));
  const anterior = d.rendiciones.anterior;
  const enviadas = anterior.sedes.filter(s => ['enviada', 'en_cotejo', 'observada', 'aprobada'].includes(s.estado)).length;
  const alertasNd = d.sedes.filter(s => s.nd.pct > s.nd.umbral);
  const resolverPedido = ctx.puede('fondos.autorizar_extra');

  const filaSolicitud = (s) => html`<div class="item">
    <span class="item__icono">${icono('solicitud')}</span>
    <div class="item__texto"><a href="#/solicitudes/${s.id}"><strong>${s.descripcion}</strong></a>
      <small>${s.sede_nombre} · #${s.id} · ${fechaHora(s.creado_en)}${s.proveedor ? ` · ${s.proveedor}` : ''}${s.comentario && s.estado === 'en_revision' ? ` · ${s.comentario}` : ''}</small></div>
    <div class="item__monto">${pesos(s.monto_estimado)}<small>${chipSolicitud(s.estado)}</small></div>
    ${puedeResolver(ctx, s) ? html`<button class="btn btn--principal btn--chico" type="button" data-resolver="${s.id}">Resolver</button>` : ''}
  </div>`;

  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>Panel diario</h1><p>${hoyLargo} · todas las sedes</p></div>
      ${ctx.puede('gastos.pago_central') ? html`<div class="vista__acciones"><a class="btn btn--principal" href="#/central/pago">${icono('pago')} Pago directo</a></div>` : ''}</div>

    <div class="cifras">
      <div class="cifra"><span>Saldo de la Central</span><strong>${pesos(d.saldo_central)}</strong><small><a href="#/central/asignar">Asignar fondos</a></small></div>
      <div class="cifra ${d.pendientes.length ? 'cifra--alerta' : ''}"><span>Solicitudes por resolver</span><strong>${d.pendientes.length}</strong><small>${d.solicitudes_hoy.length} entraron hoy</small></div>
      <div class="cifra ${d.pedidos.length ? 'cifra--alerta' : ''}"><span>Pedidos de fondos extra</span><strong>${d.pedidos.length}</strong><small>los decide el Presidente</small></div>
      <div class="cifra"><span>Rendiciones de ${nombrePeriodo(anterior.periodo)}</span><strong>${enviadas} de ${anterior.sedes.length}</strong><small><a href="#/central/rendiciones">Ver recibidas</a></small></div>
    </div>

    ${alertasNd.map(s => html`<div class="aviso aviso--mal">${icono('alerta')}<span><b>${s.nombre}</b>: los gastos sin descripción (N/D) son el ${String(s.nd.pct).replace('.', ',')} % de lo gastado este mes (alerta desde ${s.nd.umbral} %).</span></div>`)}

    <div class="grilla grilla--panel">
      <div class="pila">
        <section class="pila">
          <h2>Por resolver</h2>
          ${d.pendientes.length ? html`<div class="lista">${d.pendientes.map(filaSolicitud)}</div>` : html`<div class="aviso aviso--ok">${icono('check')}<span>No hay solicitudes pendientes.</span></div>`}
        </section>

        ${d.pedidos.length ? html`<section class="pila"><h2>Pedidos de fondos extra</h2><div class="lista">
          ${d.pedidos.map(p => html`<div class="item">
            <span class="item__icono">${icono('enviar')}</span>
            <div class="item__texto"><strong>${p.sede_nombre} pide ${pesos(p.importe)} y todavía le quedan ${pesos(p.saldo_actual.total)}</strong><small>${p.justificacion} · ${p.pedido_por_nombre} · ${fechaHora(p.pedido_en)}</small></div>
            ${resolverPedido ? html`<div class="fila"><button class="btn btn--ok btn--chico" type="button" data-autorizar="${p.id}">Autorizar</button><button class="btn btn--sec btn--chico" type="button" data-rechazar="${p.id}">Rechazar</button></div>` : ''}
          </div>`)}</div></section>` : ''}

        ${d.para_pagar.length ? html`<section class="pila"><h2>Para pagar desde la Central</h2><div class="lista">
          ${d.para_pagar.map(s => html`<div class="item"><span class="item__icono item__icono--central">${icono('edificio')}</span>
            <div class="item__texto"><a href="#/solicitudes/${s.id}"><strong>${s.descripcion}</strong></a><small>${s.sede_nombre} · aprobada ${fechaHora(s.resuelto_en)}${s.proveedor ? ` · ${s.proveedor}` : ''}</small></div>
            <div class="item__monto">${pesos(s.monto_estimado)}</div>
            ${ctx.puede('gastos.pago_central') ? html`<a class="btn btn--principal btn--chico" href="#/central/pago?solicitud=${s.id}&sede=${s.sede_id}">Pagar</a>` : ''}</div>`)}
        </div></section>` : ''}

        <section class="pila"><h2>Entraron hoy</h2>
          ${d.solicitudes_hoy.length ? html`<div class="lista">${d.solicitudes_hoy.map(filaSolicitud)}</div>` : html`<p class="muted">Hoy no entraron solicitudes.</p>`}
        </section>
      </div>

      <section class="panel"><div class="panel__cab"><h3>${icono('edificio')} Sedes · ${nombrePeriodo(d.periodo)}</h3><a class="chico" href="#/central/sedes">Detalle</a></div>
        <div class="tabla-caja" style="border:0"><table class="tabla"><thead><tr><th>Sede</th><th class="num">Saldo</th><th>Rend. ${nombrePeriodo(anterior.periodo).split(' ')[0]}</th></tr></thead><tbody>
          ${d.sedes.map(s => {
            const r = anterior.sedes.find(x => x.sede_id === s.id);
            return html`<tr><td><a href="#/central/sedes/${s.id}">${s.nombre}</a><br><small class="muted">gastado ${pesos(s.gastado_sede + s.pagado_central)}${s.nd.pct > s.nd.umbral ? ' · ⚠ N/D' : ''}</small></td>
              <td class="num">${pesos(s.saldos.total)}</td>
              <td>${r && ['enviada', 'en_cotejo', 'observada', 'aprobada'].includes(r.estado) ? html`<a href="#/central/rendiciones/${s.id}/${anterior.periodo}">${chipRendicion(r.estado)}</a>` : chipRendicion(r?.estado || 'abierta')}</td></tr>`;
          })}
        </tbody></table></div>
      </section>
    </div>
  </div>`);

  ctx.el.querySelectorAll('[data-resolver]').forEach(b => b.addEventListener('click', () => {
    const s = [...d.pendientes, ...d.solicitudes_hoy].find(x => x.id === Number(b.dataset.resolver));
    resolverSolicitud(ctx, s, () => { ctx.recargar(); ctx.avisos(); });
  }));
  ctx.el.querySelectorAll('[data-autorizar]').forEach(b => b.addEventListener('click', async () => {
    const p = d.pedidos.find(x => x.id === Number(b.dataset.autorizar));
    if (!await confirmar({ titulo: `Autorizar ${pesos(p.importe)} para ${p.sede_nombre}`, texto: `Se suman al fondo de la sede y salen del saldo de la Central (${pesos(d.saldo_central)}).`, boton: 'Autorizar' })) return;
    try { await post(`/api/fondos/pedidos/${p.id}/resolver`, { autorizar: true }); toast('Fondos extra autorizados', 'ok'); ctx.recargar(); } catch (e) { error(e); }
  }));
  ctx.el.querySelectorAll('[data-rechazar]').forEach(b => b.addEventListener('click', async () => {
    const p = d.pedidos.find(x => x.id === Number(b.dataset.rechazar));
    const comentario = await pedirTexto({ titulo: `Rechazar el pedido de ${p.sede_nombre}`, label: 'Motivo (lo ve la sede)', boton: 'Rechazar', peligro: true });
    if (!comentario) return;
    try { await post(`/api/fondos/pedidos/${p.id}/resolver`, { autorizar: false, comentario }); toast('Pedido rechazado', 'ok'); ctx.recargar(); } catch (e) { error(e); }
  }));
}
