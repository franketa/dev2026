// Sede Central: asignación mensual del fondo, saldos de las sedes y comprobantes de retención.

import {
  get, post, html, pintar, icono, pesos, fecha, error, toast, conBoton, modal, parsePesos, mascaraPesos, pesosInput, hoyAR,
  selectorMes, periodoHoy, sumarMeses, nombrePeriodo, chip, vacio, pedirTexto, fmtCuit
} from '../lib.js';
import { itemMovimiento } from './fondos.js';

export async function asignar(ctx) {
  const periodo = ctx.query.periodo || periodoHoy();
  const d = await get(`/api/central/asignacion?periodo=${periodo}`);
  const mov = await get(`/api/central/movimientos?periodo=${periodo}`);
  const puede = ctx.puede('fondos.asignar');
  const faltan = d.sedes.filter(s => !s.asignada);

  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>Asignar fondos</h1><p>Transferencia del fondo rotatorio de cada sede. Sale del saldo de la Central.</p></div>
      <div class="vista__acciones">${selectorMes(periodo, { max: sumarMeses(periodoHoy(), 1) })}
        ${ctx.puede('central.ingresos') ? html`<button class="btn btn--sec" type="button" data-ingreso>${icono('mas')} Ingreso a la Central</button>` : ''}</div></div>

    <section class="saldo"><div class="saldo__etiqueta">Saldo de la cuenta de la Central</div><div class="saldo__total">${pesos(d.saldo_central)}</div>
      <div class="saldo__pie">Al empezar ${nombrePeriodo(periodo)}: ${pesos(mov.saldo_inicial)}</div></section>

    <form class="pila" id="f" novalidate>
      <div class="tabla-caja"><table class="tabla"><thead><tr><th>Sede</th><th class="num">Saldo actual</th><th>Fondo de ${nombrePeriodo(periodo)}</th><th>N.º de transferencia</th></tr></thead><tbody>
        ${d.sedes.map(s => html`<tr>
          <td><strong>${s.sede_nombre}</strong>${s.sugerido && !s.asignada ? html`<br><small class="muted">mes anterior ${pesos(s.sugerido)}</small>` : ''}</td>
          <td class="num">${pesos(s.saldos.total)}</td>
          <td>${s.asignada ? html`<strong>${pesos(s.asignada.importe)}</strong> ${chip('ok', 'Asignado')} <small class="muted">${fecha(s.asignada.fecha)}</small>
              ${puede ? html`<button class="btn btn--fantasma btn--chico" type="button" data-anular="${s.asignada.id}" aria-label="Anular asignación">${icono('anular')}</button>` : ''}`
            : puede ? html`<div class="input-pref"><span>$</span><input class="input" name="imp-${s.sede_id}" inputmode="decimal" value="${s.sugerido ? pesosInput(s.sugerido) : ''}" placeholder="0" style="min-width:150px"></div>` : chip('pend', 'Sin asignar')}</td>
          <td>${s.asignada ? (s.asignada.referencia || '—') : puede ? html`<input class="input" name="ref-${s.sede_id}" placeholder="Opcional" style="min-width:130px">` : ''}</td>
        </tr>`)}
      </tbody></table></div>
      ${puede && faltan.length ? html`<div class="fila">
        <div class="campo" style="max-width:220px"><label for="fecha">Fecha de la transferencia</label><input class="input" type="date" id="fecha" name="fecha" value="${hoyAR()}"></div>
        <span style="flex:1"></span>
        <strong id="total"></strong>
        <button class="btn btn--principal btn--grande" type="submit">${icono('flechas')} Asignar</button></div>` : ''}
    </form>

    <section class="pila"><h2>Movimientos de la cuenta de la Central · ${nombrePeriodo(periodo)}</h2>
      ${mov.movimientos.length ? html`<div class="lista">${mov.movimientos.map(itemMovimiento)}</div>` : vacio('Sin movimientos en este mes.', 'cuenta')}</section>
  </div>`);

  const f = ctx.el.querySelector('#f');
  f.querySelectorAll('input[name^=imp-]').forEach(i => { mascaraPesos(i); i.addEventListener('input', total); });
  function items() {
    return faltan.map(s => ({ sede_id: s.sede_id, importe: parsePesos(f[`imp-${s.sede_id}`]?.value), referencia: f[`ref-${s.sede_id}`]?.value })).filter(x => x.importe);
  }
  function total() {
    const t = items().reduce((s, x) => s + x.importe, 0);
    const el = ctx.el.querySelector('#total');
    if (el) el.textContent = t ? `Total ${pesos(t)}` : '';
  }
  total();
  ctx.el.querySelectorAll('[data-mes]').forEach(b => b.addEventListener('click', () => ctx.ir(`#/central/asignar?periodo=${b.dataset.mes}`)));
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const lista = items();
    if (!lista.length) return toast('Cargá el monto de al menos una sede', 'mal');
    conBoton(f.querySelector('[type=submit]'), async () => {
      try { await post('/api/central/asignacion', { periodo, fecha: f.fecha.value, items: lista }); toast(`Fondo asignado a ${lista.length} sede${lista.length === 1 ? '' : 's'}`, 'ok'); ctx.recargar(); } catch (ex) { error(ex); }
    });
  });
  ctx.el.querySelectorAll('[data-anular]').forEach(b => b.addEventListener('click', async () => {
    const motivo = await pedirTexto({ titulo: 'Anular la asignación', texto: 'Se revierte la transferencia: vuelve al saldo de la Central. Sólo se puede si la sede todavía no usó esa plata.', label: 'Motivo', boton: 'Anular', peligro: true });
    if (!motivo) return;
    try { await post(`/api/central/asignaciones/${b.dataset.anular}/anular`, { motivo }); toast('Asignación anulada', 'ok'); ctx.recargar(); } catch (e) { error(e); }
  }));
  ctx.el.querySelector('[data-ingreso]')?.addEventListener('click', () => {
    const m = modal({
      titulo: 'Ingreso a la cuenta de la Central', subtitulo: 'Fondos que llegan a la Central (por ejemplo, la transferencia de la Fuerza).',
      contenido: html`<form class="form" novalidate>
        <div class="campo"><label>Importe</label><div class="input-pref"><span>$</span><input class="input input--monto" name="importe" inputmode="decimal" required></div></div>
        <div class="campo"><label>Fecha</label><input class="input" type="date" name="fecha" value="${hoyAR()}"></div>
        <div class="campo"><label>Concepto</label><input class="input" name="concepto" placeholder="Ej.: transferencia de fondos de la Fuerza"></div>
        ${mov.movimientos.length || d.saldo_central ? '' : html`<label class="check"><input type="checkbox" name="saldo_inicial" checked>Es el saldo inicial de la cuenta</label>`}
        <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">Registrar ingreso</button></div>
      </form>`
    });
    const fi = m.el.querySelector('form');
    mascaraPesos(fi.importe);
    fi.addEventListener('submit', (e) => {
      e.preventDefault();
      conBoton(fi.querySelector('[type=submit]'), async () => {
        try { await post('/api/central/ingresos', { importe: parsePesos(fi.importe.value), fecha: fi.fecha.value, concepto: fi.concepto.value, saldo_inicial: !!fi.saldo_inicial?.checked }); m.cerrar(); toast('Ingreso registrado', 'ok'); ctx.recargar(); } catch (ex) { error(ex); }
      });
    });
  });
}

export async function sedes(ctx) {
  const periodo = ctx.query.periodo || periodoHoy();
  const d = await get(`/api/central/resumen?periodo=${periodo}`);
  const tablero = await get(`/api/rendiciones/tablero?periodo=${periodo}`);
  const tot = d.sedes.reduce((a, s) => ({ fondo: a.fondo + s.fondo_recibido, gastado: a.gastado + s.gastado_sede + s.pagado_central, saldo: a.saldo + s.saldos.total }), { fondo: 0, gastado: 0, saldo: 0 });
  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>Sedes y saldos</h1><p>Cada sede es un centro de costo. Tocá una para ver sus movimientos.</p></div><div class="vista__acciones">${selectorMes(periodo)}</div></div>
    <div class="cifras">
      <div class="cifra"><span>Saldo de la Central</span><strong>${pesos(d.saldo)}</strong></div>
      <div class="cifra"><span>Fondos asignados en ${nombrePeriodo(periodo)}</span><strong>${pesos(tot.fondo)}</strong></div>
      <div class="cifra"><span>Gastado por las sedes</span><strong>${pesos(tot.gastado)}</strong></div>
      <div class="cifra"><span>Saldo en las sedes</span><strong>${pesos(tot.saldo)}</strong></div>
    </div>
    <div class="tabla-caja"><table class="tabla"><thead><tr><th>Sede</th><th class="num">Recibido</th><th class="num">Gastado</th><th class="num">Pagó la Central</th><th class="num">Banco</th><th class="num">Efectivo</th><th>Rendición</th></tr></thead><tbody>
      ${d.sedes.map(s => {
        const r = tablero.sedes.find(x => x.sede_id === s.id);
        return html`<tr><td><a href="#/central/sedes/${s.id}?periodo=${periodo}"><strong>${s.nombre}</strong></a><br><small class="muted">${s.gastos} gastos</small></td>
          <td class="num">${pesos(s.fondo_recibido)}${s.fondo_extra ? html`<br><small class="muted">+${pesos(s.fondo_extra)} extra</small>` : ''}</td>
          <td class="num">${pesos(s.gastado_sede)}</td><td class="num">${pesos(s.pagado_central)}</td>
          <td class="num">${pesos(s.saldos.banco)}</td><td class="num">${pesos(s.saldos.efectivo)}</td>
          <td><a href="#/central/rendiciones/${s.id}/${periodo}">${chip(...({ abierta: ['pend', 'Abierta'], cerrada_firmada: ['info', 'Firmada'], enviada: ['ok', 'Enviada'] }[r?.estado] || ['neutro', r?.estado || '—']))}</a></td></tr>`;
      })}
    </tbody></table></div>
  </div>`);
  ctx.el.querySelectorAll('[data-mes]').forEach(b => b.addEventListener('click', () => ctx.ir(`#/central/sedes?periodo=${b.dataset.mes}`)));
}

export async function certificados(ctx) {
  const { certificados: lista } = await get('/api/certificados');
  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>Comprobantes de retención</h1><p>Se generan solos al registrar un pago con retenciones. Numeración correlativa única del Círculo.</p></div></div>
    <div class="aviso">${icono('alerta')}<span>Las alícuotas y regímenes están pendientes de validación por el contador del Círculo.</span></div>
    ${lista.length ? html`<div class="tabla-caja"><table class="tabla"><thead><tr><th>N.º</th><th>Fecha</th><th>Proveedor</th><th>Sede</th><th class="num">Bruto</th><th class="num">Retenido</th><th class="num">Neto</th><th></th></tr></thead><tbody>
      ${lista.map(c => html`<tr ${c.anulado ? html`style="opacity:.55"` : ''}><td><strong>${String(c.numero).padStart(8, '0')}</strong>${c.anulado ? html`<br>${chip('mal', 'Anulado')}` : ''}</td><td>${fecha(c.fecha)}</td>
        <td>${c.proveedor}<br><small class="muted">${fmtCuit(c.cuit)}</small></td><td>${c.sede_nombre}${c.pagado_por === 'central' ? html`<br><small class="muted">pagó la Central</small>` : ''}</td>
        <td class="num">${pesos(c.bruto, { decimales: true })}</td><td class="num">${pesos(c.total, { decimales: true })}</td><td class="num">${pesos(c.neto, { decimales: true })}</td>
        <td><a class="btn btn--sec btn--chico" href="/api/certificados/${c.id}/pdf" target="_blank" rel="noopener">${icono('pdf')} PDF</a> <a class="btn btn--fantasma btn--chico" href="#/gastos/${c.gasto_id}">Gasto</a></td></tr>`)}
    </tbody></table></div>` : vacio('Todavía no hay comprobantes de retención.', 'retencion')}
  </div>`);
}
