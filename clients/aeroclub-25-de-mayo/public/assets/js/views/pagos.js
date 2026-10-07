// Pagos que informan los socios desde la app: tesorería mira el comprobante y confirma o rechaza.
import {
  get, post, html, raw, pintar, icono, pesos, fecha, fechaHora, periodoHoy, selectorMes, nombrePeriodo, modal, pedirTexto, toast, error, conBoton, datosForm, hoyAR,
  pesosInput, nombreLista, nombreCompleto, chipInforme, opcionesMedio, MEDIOS
} from '../lib.js';
import { vacio } from './comun.js';

const urlComprobante = (p) => `/api/admin/pagos-informados/${p.id}/comprobante`;

function vistaComprobante(p) {
  if (!p.comprobante_id) return html`<p class="muted chico">Sin comprobante adjunto.</p>`;
  if (p.comprobante_tipo === 'application/pdf') {
    return html`<a class="btn btn--sec" href="${urlComprobante(p)}" target="_blank" rel="noopener">${icono('pdf')} Ver comprobante (PDF)</a>`;
  }
  return html`<a class="comprobante" href="${urlComprobante(p)}" target="_blank" rel="noopener" aria-label="Ver comprobante en grande"><img src="${urlComprobante(p)}" alt="Comprobante de ${nombreCompleto(p)}"></a>`;
}

// Revisión de un pago informado. Tesorería puede corregir importe, fecha o medio antes de confirmar.
export function revisarPago(p, alTerminar) {
  const m = modal({
    titulo: `Pago informado por ${nombreCompleto(p)}`,
    subtitulo: `El ${fechaHora(p.creado_en)}. Revisá que el dinero haya llegado antes de confirmar.`,
    contenido: html`<form class="form" novalidate>
      ${vistaComprobante(p)}
      ${p.nota ? html`<p class="aviso aviso--info">${icono('nota')}<span>${p.nota}</span></p>` : ''}
      <div class="fila-campos">
        <div class="campo"><label for="rp-imp">Importe</label><input class="input" id="rp-imp" name="importe" inputmode="decimal" value="${pesosInput(p.importe)}" required></div>
        <div class="campo"><label for="rp-fecha">Fecha</label><input class="input" id="rp-fecha" type="date" name="fecha" value="${p.fecha}" max="${hoyAR()}" required></div>
      </div>
      <div class="campo"><label for="rp-medio">Medio</label><select class="select" id="rp-medio" name="medio">${opcionesMedio(p.medio)}</select></div>
      <p class="campo__ayuda">Si llegó otro monto, corregilo: el socio ve lo que se confirmó.</p>
      <div class="modal__acciones">
        <button class="btn btn--peligro" type="button" data-rechazar>${icono('x')} Rechazar</button>
        <button class="btn btn--principal" type="submit">${icono('check')} Confirmar pago</button>
      </div>
    </form>`
  });
  const form = m.el.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    conBoton(form.querySelector('[type=submit]'), async () => {
      try {
        const r = await post(`/api/admin/pagos-informados/${p.id}/confirmar`, datosForm(form));
        toast(`Pago confirmado. Saldo de ${p.nombre}: ${pesos(r.saldo)}`, 'ok');
        m.cerrar();
        alTerminar?.();
      } catch (err) { error(err); }
    });
  });
  m.el.querySelector('[data-rechazar]').addEventListener('click', async () => {
    const motivo = await pedirTexto({
      titulo: 'Rechazar pago informado', texto: `${nombreCompleto(p)} va a ver el motivo en su cuenta.`,
      label: 'Motivo', placeholder: 'Ej.: la transferencia no llegó a la cuenta del club', boton: 'Rechazar', peligro: true
    });
    if (!motivo) return;
    try {
      await post(`/api/admin/pagos-informados/${p.id}/rechazar`, { motivo });
      toast('Pago rechazado', 'ok');
      m.cerrar();
      alTerminar?.();
    } catch (err) { error(err); }
  });
}

export function tablaInformes(pagos, { socio = true, revisar = false } = {}) {
  return html`<div class="tabla-caja"><table class="tabla tabla--tarjetas">
    <thead><tr>${socio ? html`<th>Socio</th>` : ''}<th>Pago</th><th class="num">Importe</th><th>Estado</th><th></th></tr></thead>
    <tbody>${pagos.map(p => html`<tr>
      ${socio ? html`<td class="celda-ppal"><a href="#/admin/cuentas/${p.usuario_id}"><strong>${nombreLista(p)}</strong></a><div class="muted chico">Informado el ${fechaHora(p.creado_en)}</div></td>` : ''}
      <td data-label="Pago" ${socio ? '' : raw('class="celda-ppal"')}>${MEDIOS[p.medio] || p.medio}, ${fecha(p.fecha)}${p.nota ? html`<div class="muted chico">${p.nota}</div>` : ''}${p.comprobante_id ? html`<div class="chico muted con-icono">${icono('foto')} Con comprobante</div>` : ''}</td>
      <td class="num monto" data-label="Importe">${pesos(p.importe)}</td>
      <td data-label="Estado">${chipInforme(p)}${p.estado === 'rechazado' && p.motivo_rechazo ? html`<div class="muted chico">${p.motivo_rechazo}</div>` : ''}${p.revisado_por_nombre ? html`<div class="muted chico">Por ${p.revisado_por_nombre}</div>` : ''}</td>
      <td class="celda-acciones"><div class="tabla__acciones">
        ${revisar && p.estado === 'pendiente' ? html`<button class="btn btn--principal btn--chico" type="button" data-revisar="${p.id}" data-escritura>${icono('check')} Revisar</button>` : ''}
        ${p.comprobante_id ? html`<a class="btn btn--sec btn--chico" href="${revisar ? urlComprobante(p) : `/api/pagos-informados/${p.id}/comprobante`}" target="_blank" rel="noopener">${icono('foto')} Comprobante</a>` : ''}
      </div></td></tr>`)}</tbody></table></div>`;
}

// "Por revisar": todos los pendientes. "Historial": todos los informados, mes por mes (por fecha del pago).
export default async function pagosInformados(ctx) {
  const ver = ['historial', 'todos'].includes(ctx.query.ver) ? 'historial' : 'pendiente';
  const periodo = ctx.query.periodo || periodoHoy();
  const { pagos } = await get(`/api/admin/pagos-informados?${ver === 'pendiente' ? 'estado=pendiente' : `periodo=${periodo}`}`);
  const total = pagos.filter(p => p.estado === 'pendiente').reduce((s, p) => s + p.importe, 0);
  const confirmado = pagos.filter(p => p.estado === 'confirmado').reduce((s, p) => s + p.importe, 0);

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab"><div><h1>Pagos informados</h1><p>Lo que los socios avisan que pagaron desde la app. No toca su cuenta hasta que lo confirmás.</p></div></div>
    <div class="pestanas" role="tablist">
      <button type="button" role="tab" data-ver="pendiente" aria-selected="${ver === 'pendiente'}">Por revisar</button>
      <button type="button" role="tab" data-ver="historial" aria-selected="${ver === 'historial'}">Historial</button>
    </div>
    ${ver === 'historial' ? html`<div class="filtros">${selectorMes(periodo)}</div>` : ''}
    ${ver === 'pendiente' && pagos.length ? html`<div class="cifras"><div class="cifra"><span>Por revisar</span><strong>${pesos(total)}</strong><small>${pagos.length} ${pagos.length === 1 ? 'pago' : 'pagos'}</small></div></div>` : ''}
    ${ver === 'historial' && pagos.length ? html`<div class="cifras">
      <div class="cifra"><span>Informados</span><strong>${pagos.length}</strong></div>
      <div class="cifra"><span>Confirmados</span><strong>${pesos(confirmado)}</strong><small>${pagos.filter(p => p.estado === 'confirmado').length} pagos</small></div>
      ${total ? html`<div class="cifra"><span>Por revisar</span><strong>${pesos(total)}</strong></div>` : ''}
    </div>` : ''}
    <section class="panel">${pagos.length ? tablaInformes(pagos, { revisar: true }) : vacio(ver === 'pendiente' ? 'No hay pagos para revisar.' : `No se informaron pagos de ${nombrePeriodo(periodo)}.`)}</section>
  </div>`);

  ctx.el.addEventListener('click', (e) => {
    const v = e.target.closest('[data-ver]');
    if (v) return ctx.ir(`#/admin/pagos${v.dataset.ver === 'historial' ? '?ver=historial' : ''}`);
    const mes = e.target.closest('[data-mes]');
    if (mes) return ctx.ir(`#/admin/pagos?ver=historial&periodo=${mes.dataset.mes}`);
    const r = e.target.closest('[data-revisar]');
    if (r) revisarPago(pagos.find(p => p.id === Number(r.dataset.revisar)), ctx.recargar);
  });
}
