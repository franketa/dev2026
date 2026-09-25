import { get, post, html, pintar, icono, pesos, horas, fecha, fechaHora, nombrePeriodo, chipCupon, modal, confirmar, toast, error, conBoton } from '../lib.js';
import { modalPago } from './cuenta.js';

function tablaSimulacion(r) {
  return html`<div class="tabla-caja"><table class="tabla">
    <thead><tr><th>Socio</th><th class="num">Horas</th><th class="num">Saldo anterior</th><th class="num">Vuelos</th><th class="num">Pagos</th><th class="num">Ajustes</th><th class="num">Total</th></tr></thead>
    <tbody>${r.cupones.map(c => html`<tr>
      <td>${c.apellido}, ${c.nombre}</td><td class="num">${horas(c.decimas)}</td><td class="num">${pesos(c.saldo_anterior)}</td>
      <td class="num">${pesos(c.total_vuelos)}</td><td class="num">${pesos(c.total_pagos)}</td><td class="num">${pesos(c.total_ajustes)}</td>
      <td class="num monto">${pesos(c.total)}</td></tr>`)}</tbody>
    <tfoot><tr><td>${r.cupones.length} cupones</td><td class="num">${horas(r.cierre.total_decimas)}</td><td></td><td class="num">${pesos(r.cierre.total_vuelos)}</td><td></td><td></td><td class="num">${pesos(r.cierre.total_cupones)}</td></tr></tfoot>
  </table></div>`;
}

async function cerrarMes(periodo, ctx) {
  const ok = await confirmar({
    titulo: `Cerrar ${nombrePeriodo(periodo)}`,
    texto: 'Los vuelos del mes quedan facturados y ya no se pueden editar. Se genera un cupón por socio. Esta acción no se deshace.',
    boton: `Cerrar ${nombrePeriodo(periodo).split(' ')[0]}`
  });
  if (!ok) return;
  try {
    const r = await post('/api/admin/cierres', { periodo });
    toast(`${nombrePeriodo(periodo)} cerrado: ${r.cupones.length} cupones generados`, 'ok');
    ctx.ir(`#/admin/cierres/${r.cierre.id}`);
  } catch (e) { error(e); }
}

export async function cierres(ctx) {
  const { cierres: lista, proximo } = await get('/api/admin/cierres');
  const pendiente = proximo.pendientes[0];

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab"><div><h1>Cierres y cupones</h1><p>Cada mes se congela lo volado y se genera el cupón de cada socio.</p></div></div>

    <section class="cierre-proximo">
      ${pendiente ? html`
        <div><p class="muted">Listo para cerrar</p><h2 style="text-transform:capitalize">${nombrePeriodo(pendiente)}</h2></div>
        <p>${proximo.automatico ? `El sistema lo cierra solo el ${fecha(proximo.fecha)} a las ${proximo.hora} h. Si querés, revisalo y cerralo ahora.` : 'El cierre automático está apagado.'}
          ${proximo.pendientes.length > 1 ? ` Hay ${proximo.pendientes.length} meses pendientes: se cierran en orden.` : ''}</p>
        <div class="vista__acciones">
          <button class="btn btn--sec" type="button" data-simular="${pendiente}">${icono('lista')} Ver cómo quedaría</button>
          <button class="btn btn--principal" type="button" data-cerrar-mes="${pendiente}">${icono('cierre')} Cerrar ahora</button>
        </div>`
      : html`
        <div><p class="muted">Mes en curso</p><h2 style="text-transform:capitalize">${nombrePeriodo(proximo.periodo)}</h2></div>
        <p>${proximo.automatico ? `Se cierra solo el ${fecha(proximo.fecha)} a las ${proximo.hora} h: los vuelos se facturan y se generan los cupones.` : 'El cierre automático está apagado: cuando termine el mes, cerralo desde acá.'}</p>`}
    </section>

    <section class="panel">
      <div class="panel__cab"><h2>Cierres anteriores</h2></div>
      ${lista.length ? html`<div class="tabla-caja"><table class="tabla">
        <thead><tr><th>Mes</th><th>Cerrado</th><th class="num">Vuelos</th><th class="num">Horas</th><th class="num">Cupones</th><th class="num">A cobrar</th></tr></thead>
        <tbody>${lista.map(c => html`<tr data-href="#/admin/cierres/${c.id}">
          <td style="text-transform:capitalize"><strong>${nombrePeriodo(c.periodo)}</strong></td>
          <td>${fechaHora(c.creado_en)}<div class="muted chico">${c.automatico ? 'Automático' : `Por ${c.cerrado_por_nombre}`}</div></td>
          <td class="num">${c.cantidad_vuelos}</td><td class="num">${horas(c.total_decimas)}</td>
          <td class="num">${c.cantidad_cupones}</td><td class="num monto">${pesos(c.total_cupones)}</td></tr>`)}</tbody>
      </table></div>` : html`<p class="muted">Todavía no hubo ningún cierre.</p>`}
    </section>
  </div>`);

  ctx.el.addEventListener('click', async (e) => {
    const fila = e.target.closest('tr[data-href]');
    if (fila) return ctx.ir(fila.dataset.href);
    const cm = e.target.closest('[data-cerrar-mes]');
    if (cm) return cerrarMes(cm.dataset.cerrarMes, ctx);
    const sim = e.target.closest('[data-simular]');
    if (sim) {
      await conBoton(sim, async () => {
        try {
          const r = await get(`/api/admin/cierres/simular?periodo=${sim.dataset.simular}`);
          const m = modal({
            titulo: `Así quedaría ${nombrePeriodo(sim.dataset.simular)}`,
            subtitulo: `${r.cierre.cantidad_vuelos} vuelos, ${horas(r.cierre.total_decimas)}. Es una vista previa: todavía no se guardó nada.`,
            ancho: true,
            contenido: html`<div class="pila">${r.cupones.length ? tablaSimulacion(r) : html`<p class="muted">No hay vuelos ni saldos: no se generaría ningún cupón.</p>`}
              <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Volver</button><button class="btn btn--principal" type="button" data-confirmar>${icono('cierre')} Cerrar el mes</button></div></div>`
          });
          m.el.querySelector('[data-confirmar]').addEventListener('click', () => { m.cerrar(); cerrarMes(sim.dataset.simular, ctx); });
        } catch (err) { error(err); }
      });
    }
  });
}

export async function detalleCierre(ctx) {
  const { cierre, cupones } = await get(`/api/admin/cierres/${ctx.params.id}`);
  const filtro = ctx.query.ver || 'todos';
  const cobrados = cupones.filter(c => ['pagado', 'sin_deuda', 'incluido'].includes(c.estado)).length;
  const enviados = cupones.filter(c => c.envios > 0).length;
  const aCobrar = cupones.reduce((s, c) => s + (c.restante || 0), 0);
  const visibles = cupones.filter(c => filtro === 'todos' || (filtro === 'sin_enviar' && !c.envios && c.total > 0) || (filtro === 'impagos' && c.restante > 0));

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab">
      <div><a class="volver" href="#/admin/cierres">${icono('izq')} Cierres</a><h1 style="text-transform:capitalize">${nombrePeriodo(cierre.periodo)}</h1>
        <p>Cerrado el ${fechaHora(cierre.creado_en)} ${cierre.automatico ? 'automáticamente' : `por ${cierre.cerrado_por_nombre}`}. ${cierre.cantidad_vuelos} vuelos, ${horas(cierre.total_decimas)}.</p></div>
    </div>

    <div class="cifras">
      <div class="cifra"><span>Total del cierre</span><strong>${pesos(cierre.total_cupones)}</strong><small>${cupones.length} cupones</small></div>
      <div class="cifra"><span>Falta cobrar</span><strong>${pesos(aCobrar)}</strong></div>
      <div class="cifra progreso"><span>Enviados ${enviados} de ${cupones.length}, cobrados ${cobrados}</span>
        <div class="progreso__barra" role="img" aria-label="${cobrados} cobrados de ${cupones.length}"><span style="width:${cupones.length ? cobrados / cupones.length * 100 : 0}%"></span></div></div>
    </div>

    <section class="panel">
      <div class="panel__cab">
        <div class="pestanas" role="tablist" style="border:0">
          <button type="button" role="tab" data-ver="todos" aria-selected="${filtro === 'todos'}">Todos</button>
          <button type="button" role="tab" data-ver="sin_enviar" aria-selected="${filtro === 'sin_enviar'}">Sin enviar</button>
          <button type="button" role="tab" data-ver="impagos" aria-selected="${filtro === 'impagos'}">Sin cobrar</button>
        </div>
      </div>
      ${visibles.length ? html`<div class="tabla-caja"><table class="tabla">
        <thead><tr><th>Socio</th><th class="num">Horas</th><th class="num">Total</th><th>Estado</th><th>Envío</th><th></th></tr></thead>
        <tbody>${visibles.map(c => html`<tr>
          <td><a href="#/admin/cuentas/${c.usuario_id}"><strong>${c.apellido}, ${c.nombre}</strong></a><div class="muted chico">${c.numero}</div></td>
          <td class="num">${horas(c.decimas)}</td>
          <td class="num monto">${pesos(c.total)}</td>
          <td>${chipCupon(c)}${c.restante && c.estado === 'parcial' ? html`<div class="muted chico">Faltan ${pesos(c.restante)}</div>` : ''}</td>
          <td>${c.envios ? html`<span class="chip chip--ok">Enviado</span><div class="muted chico">${fechaHora(c.ultimo_envio)}</div>` : c.whatsapp ? html`<span class="muted chico">Sin enviar</span>` : html`<a class="chico" href="#/admin/socios">Falta el celular</a>`}</td>
          <td><div class="tabla__acciones">
            ${c.whatsapp && c.total > 0 ? html`<a class="btn btn--wa btn--chico" href="${c.whatsapp}" target="_blank" rel="noopener" data-enviar="${c.id}">${icono('wa')} WhatsApp</a>` : ''}
            <a class="btn btn--sec btn--chico" href="/api/admin/cupones/${c.id}/pdf" target="_blank" rel="noopener">${icono('pdf')} PDF</a>
            ${c.restante > 0 ? html`<button class="btn btn--sec btn--chico" type="button" data-pago="${c.id}">${icono('pago')} Pago</button>` : ''}
          </div></td></tr>`)}</tbody>
      </table></div>` : html`<p class="muted">No hay cupones en esta lista.</p>`}
    </section>
    <p class="muted chico">El link del cupón que se manda por WhatsApp es privado y no se puede adivinar. El PDF siempre muestra el estado de pago actualizado.</p>
  </div>`);

  ctx.el.addEventListener('click', (e) => {
    const ver = e.target.closest('[data-ver]');
    if (ver) return ctx.ir(`#/admin/cierres/${cierre.id}?ver=${ver.dataset.ver}`);
    const env = e.target.closest('[data-enviar]');
    if (env) {
      // El link abre WhatsApp en otra pestaña; acá dejamos registrado el envío.
      post(`/api/admin/cupones/${env.dataset.enviar}/envio`, { canal: 'whatsapp' }).then(() => setTimeout(ctx.recargar, 600)).catch(error);
    }
    const pago = e.target.closest('[data-pago]');
    if (pago) {
      const c = cupones.find(x => x.id === Number(pago.dataset.pago));
      modalPago({ id: c.usuario_id, nombre: c.nombre, apellido: c.apellido }, c.restante, ctx.recargar);
    }
  });
}
