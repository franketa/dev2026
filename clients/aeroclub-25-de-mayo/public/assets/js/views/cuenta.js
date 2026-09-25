import {
  get, post, put, html, raw, pintar, icono, pesos, horas, fecha, nombrePeriodo, chipCupon, modal, pedirTexto, toast, error, conBoton,
  hoyAR, pesosInput, datosForm, ala
} from '../lib.js';
import { listaMovimientos } from './comun.js';

function bloqueSaldo(d, { admin }) {
  const debe = d.saldo > 0;
  return html`
    <section class="saldo">
      ${ala('saldo__ala')}
      <div>
        <div class="saldo__etiqueta">${debe ? (admin ? 'Debe' : 'Tu saldo a pagar') : d.saldo < 0 ? 'Saldo a favor' : 'Saldo'}</div>
        <div class="saldo__monto">${pesos(Math.abs(d.saldo))}</div>
        <div class="saldo__estado">${debe ? html`<span class="chip chip--pend">Pendiente de pago</span>` : html`<span class="chip chip--ok">Al día</span>`}</div>
      </div>
      <div class="saldo__pie">
        <div><span>Vuelos a facturar en el próximo cierre</span><strong>${pesos(d.abiertos.importe)}</strong></div>
        <div><span>Horas sin facturar</span><strong>${horas(d.abiertos.decimas)}</strong></div>
      </div>
    </section>`;
}

function tablaCupones(cupones, { admin }) {
  if (!cupones.length) return html`<p class="muted">Todavía no hay cupones: se generan en el cierre de cada mes.</p>`;
  return html`<div class="tabla-caja"><table class="tabla tabla--tarjetas">
    <thead><tr><th>Mes</th><th>Cupón</th><th class="num">Horas</th><th class="num">Total</th><th>Estado</th><th></th></tr></thead>
    <tbody>${cupones.map(c => html`<tr>
      <td class="celda-ppal" style="text-transform:capitalize"><strong>${nombrePeriodo(c.periodo)}</strong></td>
      <td data-label="Cupón">${c.numero}<div class="muted chico">Vence ${fecha(c.vencimiento)}</div></td>
      <td class="num" data-label="Horas">${horas(c.decimas)}</td>
      <td class="num monto" data-label="Total">${pesos(c.total)}</td>
      <td data-label="Estado">${chipCupon(c)}</td>
      <td class="celda-acciones"><div class="tabla__acciones">
        <a class="btn btn--sec btn--chico" href="/api/${admin ? 'admin/' : ''}cupones/${c.id}/pdf" target="_blank" rel="noopener">${icono('pdf')} PDF</a>
      </div></td></tr>`)}</tbody></table></div>`;
}

export async function miCuenta(ctx) {
  const d = await get('/api/cuenta');
  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab"><div><h1>Mi cuenta</h1><p>Tus cupones y todos los movimientos de tu cuenta en el club.</p></div></div>
    ${bloqueSaldo(d, { admin: false })}
    <section class="panel"><div class="panel__cab"><h2>Cupones</h2></div>${tablaCupones(d.cupones, { admin: false })}</section>
    <section class="panel"><div class="panel__cab"><h2>Movimientos</h2><p>Los vuelos aparecen acá cuando entran en el cierre del mes.</p></div>${listaMovimientos(d.movimientos)}</section>
  </div>`);
}

export async function cuentaSocio(ctx) {
  const id = Number(ctx.params.id);
  const d = await get(`/api/admin/cuentas/${id}`);
  const u = d.usuario;

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab">
      <div><a class="volver" href="#/admin/cuentas">${icono('izq')} Cuentas</a><h1>${u.nombre} ${u.apellido}</h1>
        <p>${[u.email, u.telefono, u.licencia].filter(Boolean).join(', ')}${u.activo ? '' : ' (dado de baja)'}</p></div>
      <div class="vista__acciones">
        <button class="btn btn--sec" type="button" data-ajuste>${icono('ajuste')} Ajuste manual</button>
        <button class="btn btn--principal" type="button" data-pago>${icono('pago')} Registrar pago</button>
      </div>
    </div>
    ${bloqueSaldo(d, { admin: true })}
    <section class="panel"><div class="panel__cab"><h2>Cupones</h2></div>${tablaCupones(d.cupones, { admin: true })}</section>
    <section class="panel">
      <div class="panel__cab"><h2>Movimientos</h2><p>Podés anular, editar o borrar movimientos. Cada cambio queda en Registro con tu nombre y el motivo.</p></div>
      ${listaMovimientos(d.movimientos, { admin: true })}
    </section>
  </div>`);

  ctx.el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-pago]')) modalPago(u, d.saldo, ctx.recargar);
    if (e.target.closest('[data-ajuste]')) modalAjuste(u, ctx.recargar);
    const ed = e.target.closest('[data-editar-mov]');
    if (ed) return modalEditarMovimiento(d.movimientos.find(m => m.id === Number(ed.dataset.editarMov)), ctx.recargar);
    const br = e.target.closest('[data-borrar-mov]');
    if (br) {
      const m = d.movimientos.find(x => x.id === Number(br.dataset.borrarMov));
      const motivo = await pedirTexto({
        titulo: `Borrar movimiento #${m.id}`,
        texto: `${m.concepto} (${pesos(m.importe, { signo: true })}). Desaparece de la cuenta y los cupones se recalculan.${m.anulado_por ? ' También se borra su anulación.' : ''}`,
        label: 'Motivo', placeholder: 'Ej.: pago duplicado', boton: 'Borrar', peligro: true
      });
      if (!motivo) return;
      try { await post(`/api/admin/movimientos/${m.id}/borrar`, { motivo }); toast('Movimiento borrado', 'ok'); ctx.recargar(); } catch (err) { error(err); }
      return;
    }
    const an = e.target.closest('[data-anular-mov]');
    if (an) {
      const motivo = await pedirTexto({
        titulo: `Anular movimiento #${an.dataset.anularMov}`,
        texto: 'Se registra un movimiento inverso que lo compensa. El original queda visible, tachado.',
        label: 'Motivo', placeholder: 'Ej.: el pago era de otro socio', boton: 'Anular', peligro: true
      });
      if (!motivo) return;
      try { await post(`/api/admin/movimientos/${an.dataset.anularMov}/anular`, { motivo }); toast('Movimiento anulado', 'ok'); ctx.recargar(); } catch (err) { error(err); }
    }
  });
}

function modalEditarMovimiento(m, alTerminar) {
  const credito = m.importe < 0;
  const modal_ = modal({
    titulo: `Editar movimiento #${m.id}`,
    subtitulo: 'Los cupones y el saldo del socio se recalculan solos.',
    contenido: html`<form class="form" novalidate>
      <div class="campo"><label for="em-con">Concepto</label><input class="input" id="em-con" name="concepto" value="${m.concepto}" maxlength="200" required></div>
      <div class="segmentado">
        <label><input type="radio" name="sentido" value="cargo" ${credito ? '' : raw('checked')}><span>Cargo<small>Suma a lo que debe</small></span></label>
        <label><input type="radio" name="sentido" value="credito" ${credito ? raw('checked') : ''}><span>Crédito<small>Resta de lo que debe</small></span></label>
      </div>
      <div class="fila-campos">
        <div class="campo"><label for="em-imp">Importe</label><input class="input" id="em-imp" name="importe" inputmode="decimal" value="${pesosInput(Math.abs(m.importe))}" required></div>
        <div class="campo"><label for="em-fecha">Fecha</label><input class="input" id="em-fecha" type="date" name="fecha" value="${m.fecha}" max="${hoyAR()}" required></div>
      </div>
      ${m.tipo === 'pago' ? html`<div class="campo"><label for="em-medio">Medio</label><select class="select" id="em-medio" name="medio">
        ${['transferencia', 'efectivo', 'mercadopago', 'cheque', 'otro'].map(x => html`<option value="${x}" ${x === m.medio ? raw('selected') : ''}>${x === 'mercadopago' ? 'Mercado Pago' : x.charAt(0).toUpperCase() + x.slice(1)}</option>`)}
      </select></div>` : ''}
      <div class="campo"><label for="em-mot">Motivo del cambio</label><textarea class="textarea" id="em-mot" name="motivo" maxlength="200" required placeholder="Ej.: el importe estaba mal tipeado"></textarea></div>
      <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">Guardar cambios</button></div>
    </form>`
  });
  const form = modal_.el.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = datosForm(form);
    if (!d.motivo.trim()) { form.motivo.setAttribute('aria-invalid', 'true'); form.motivo.focus(); return; }
    conBoton(form.querySelector('[type=submit]'), async () => {
      try {
        const r = await put(`/api/admin/movimientos/${m.id}`, d);
        toast(`Movimiento corregido. Saldo: ${pesos(r.saldo)}`, 'ok');
        modal_.cerrar();
        alTerminar?.();
      } catch (err) { error(err); }
    });
  });
}

export function modalPago(u, sugerido, alTerminar) {
  const m = modal({
    titulo: 'Registrar pago',
    subtitulo: `${u.nombre} ${u.apellido}`,
    contenido: html`<form class="form" novalidate>
      <div class="fila-campos">
        <div class="campo"><label for="p-imp">Importe</label><input class="input" id="p-imp" name="importe" inputmode="decimal" value="${sugerido > 0 ? pesosInput(sugerido) : ''}" placeholder="0" required autofocus></div>
        <div class="campo"><label for="p-fecha">Fecha</label><input class="input" id="p-fecha" type="date" name="fecha" value="${hoyAR()}" max="${hoyAR()}" required></div>
      </div>
      <div class="campo"><label for="p-medio">Medio</label>
        <select class="select" id="p-medio" name="medio"><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="mercadopago">Mercado Pago</option><option value="cheque">Cheque</option><option value="otro">Otro</option></select></div>
      <div class="campo"><label for="p-nota">Nota <span class="muted">(opcional)</span></label><input class="input" id="p-nota" name="nota" maxlength="200" placeholder="Ej.: comprobante 00123"></div>
      <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">${icono('check')} Registrar pago</button></div>
    </form>`
  });
  const form = m.el.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    conBoton(form.querySelector('[type=submit]'), async () => {
      try {
        const r = await post('/api/admin/pagos', { usuario_id: u.id, ...datosForm(form) });
        toast(`Pago registrado. Saldo: ${pesos(r.saldo)}`, 'ok');
        m.cerrar();
        alTerminar?.();
      } catch (err) { error(err); }
    });
  });
}

function modalAjuste(u, alTerminar) {
  const m = modal({
    titulo: 'Ajuste manual',
    subtitulo: `${u.nombre} ${u.apellido}`,
    contenido: html`<form class="form" novalidate>
      <div class="segmentado">
        <label><input type="radio" name="sentido" value="cargo" checked><span>Cargo<small>Suma a lo que debe</small></span></label>
        <label><input type="radio" name="sentido" value="credito"><span>Crédito<small>Resta de lo que debe</small></span></label>
      </div>
      <div class="campo"><label for="a-imp">Importe</label><input class="input" id="a-imp" name="importe" inputmode="decimal" placeholder="0" required autofocus></div>
      <div class="campo"><label for="a-mot">Motivo</label><textarea class="textarea" id="a-mot" name="motivo" maxlength="200" required placeholder="Ej.: cuota social de septiembre"></textarea></div>
      <label class="check"><input type="checkbox" name="saldo_inicial"><span>Es el saldo que traía en la planilla de Excel<br><small class="muted">Se marca como saldo inicial en la cuenta.</small></span></label>
      <p class="aviso aviso--info">${icono('info')}<span>Queda registrado con tu nombre y la fecha. Si te equivocás, lo podés editar o borrar desde la cuenta del socio.</span></p>
      <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">Registrar ajuste</button></div>
    </form>`
  });
  const form = m.el.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = datosForm(form);
    if (!d.motivo.trim()) { form.motivo.setAttribute('aria-invalid', 'true'); form.motivo.focus(); return; }
    conBoton(form.querySelector('[type=submit]'), async () => {
      try {
        const r = await post('/api/admin/ajustes', { usuario_id: u.id, importe: d.importe, sentido: d.sentido, motivo: d.motivo, tipo: d.saldo_inicial ? 'saldo_inicial' : 'ajuste' });
        toast(`Ajuste registrado. Saldo: ${pesos(r.saldo)}`, 'ok');
        m.cerrar();
        alTerminar?.();
      } catch (err) { error(err); }
    });
  });
}
