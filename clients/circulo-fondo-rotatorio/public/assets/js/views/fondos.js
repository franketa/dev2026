// Fondos de una sede: saldo en banco y en efectivo, movimientos del mes, extracciones y pedidos de fondos extra.

import {
  get, post, html, pintar, icono, pesos, fecha, fechaHora, error, toast, conBoton, modal, parsePesos, mascaraPesos, hoyAR,
  selectorMes, periodoHoy, nombrePeriodo, capital, chip, vacio, qs, chipRendicion
} from '../lib.js';

export function tarjetaSaldo(saldos, pie = '') {
  return html`<section class="saldo" aria-label="Saldo de la sede">
    <div class="saldo__etiqueta">Saldo disponible</div>
    <div class="saldo__total">${pesos(saldos.total)}</div>
    <div class="saldo__cuentas">
      <div class="saldo__cuenta"><span>${icono('banco')}En el banco</span><strong>${pesos(saldos.banco)}</strong></div>
      <div class="saldo__cuenta"><span>${icono('efectivo')}En efectivo</span><strong>${pesos(saldos.efectivo)}</strong></div>
    </div>
    ${pie ? html`<div class="saldo__pie">${pie}</div>` : ''}
  </section>`;
}

// Extracción (banco → efectivo) o depósito (efectivo → banco).
export function moverEfectivo(sedeId, tipo, alTerminar) {
  const extraccion = tipo === 'extraccion';
  const m = modal({
    titulo: extraccion ? 'Sacar efectivo del banco' : 'Depositar efectivo en el banco',
    subtitulo: extraccion ? 'La plata pasa del banco a la caja de efectivo de la sede.' : 'La plata pasa de la caja de efectivo al banco.',
    contenido: html`<form class="form" novalidate>
      <div class="campo"><label for="me-imp">Importe</label><div class="input-pref"><span>$</span><input class="input input--monto" id="me-imp" name="importe" inputmode="decimal" required autofocus></div></div>
      <div class="campo"><label for="me-f">Fecha</label><input class="input" type="date" id="me-f" name="fecha" value="${hoyAR()}" max="${hoyAR()}"></div>
      <div class="campo"><label for="me-n">Nota <span class="muted chico">(opcional)</span></label><input class="input" id="me-n" name="nota" maxlength="200" placeholder="Ej.: caja chica de la quincena"></div>
      <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">Registrar</button></div>
    </form>`
  });
  const f = m.el.querySelector('form');
  mascaraPesos(f.importe);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    conBoton(f.querySelector('[type=submit]'), async () => {
      try {
        await post(`/api/fondos/${tipo}`, { sede_id: sedeId, importe: parsePesos(f.importe.value), fecha: f.fecha.value, nota: f.nota.value });
        m.cerrar(); toast(extraccion ? 'Extracción registrada' : 'Depósito registrado', 'ok'); alTerminar?.();
      } catch (ex) { error(ex); }
    });
  });
}

export function pedirFondosExtra(saldos, alTerminar) {
  const m = modal({
    titulo: 'Pedir fondos extra', subtitulo: 'Lo autoriza o rechaza el Presidente. Le mostramos cuánto te queda.',
    contenido: html`<form class="form" novalidate>
      <div class="aviso aviso--info">${icono('info')}<span>Hoy la sede tiene ${pesos(saldos.total)} (banco ${pesos(saldos.banco)} · efectivo ${pesos(saldos.efectivo)}).</span></div>
      <div class="campo"><label for="pe-imp">¿Cuánto necesitás?</label><div class="input-pref"><span>$</span><input class="input input--monto" id="pe-imp" name="importe" inputmode="decimal" required autofocus></div></div>
      <div class="campo"><label for="pe-j">¿Para qué?</label><textarea class="input textarea" id="pe-j" name="justificacion" required placeholder="Contá por qué no alcanza el fondo del mes"></textarea></div>
      <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">${icono('enviar')} Enviar pedido</button></div>
    </form>`
  });
  const f = m.el.querySelector('form');
  mascaraPesos(f.importe);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    conBoton(f.querySelector('[type=submit]'), async () => {
      try { await post('/api/fondos/pedidos', { importe: parsePesos(f.importe.value), justificacion: f.justificacion.value }); m.cerrar(); toast('Pedido enviado al Presidente', 'ok'); alTerminar?.(); } catch (ex) { error(ex); }
    });
  });
}

const TIPO_MOV = {
  asignacion: ['Fondo rotatorio', 'flechas'], fondo_extra: ['Fondos extra', 'flechas'], extraccion: ['Extracción', 'efectivo'], deposito: ['Depósito', 'banco'],
  gasto: ['Gasto', 'pago'], anulacion: ['Contraasiento', 'anular'], saldo_inicial: ['Saldo inicial', 'banco'], ingreso: ['Ingreso', 'banco'], pago_central: ['Pago directo', 'edificio']
};
export function itemMovimiento(m) {
  const [t, ic] = TIPO_MOV[m.tipo] || [m.tipo, 'cuenta'];
  return html`<div class="item ${m.anulado ? 'item--anulado' : ''}">
    <span class="item__icono">${icono(ic)}</span>
    <div class="item__texto"><strong>${m.concepto}</strong><small>${fecha(m.fecha)} · ${t} · ${m.cuenta === 'efectivo' ? 'efectivo' : 'banco'} · #${m.id}${m.creado_por_nombre ? ` · ${m.creado_por_nombre}` : ''}</small></div>
    <div class="item__monto ${m.importe < 0 ? 'monto-neg' : 'monto-pos'}">${pesos(m.importe, { signo: true })}</div>
    ${m.gasto_id ? html`<a class="btn btn--fantasma btn--chico" href="#/gastos/${m.gasto_id}" aria-label="Ver gasto">${icono('der')}</a>` : ''}
  </div>`;
}

export default async function fondos(ctx) {
  const sedeParam = ctx.params.id || ctx.query.sede || '';
  const periodo = ctx.query.periodo || periodoHoy();
  const d = await get(`/api/fondos?${qs({ sede_id: sedeParam, periodo })}`);
  const e = d.estado;
  const esPropia = ctx.usuario.sede_id === d.sede.id;
  const abierta = d.rendicion === 'abierta';
  const ESTADO_PED = { pendiente: ['pend', 'Esperando al Presidente'], autorizado: ['ok', 'Autorizado'], rechazado: ['mal', 'Rechazado'] };

  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div>
      ${ctx.esSede ? '' : html`<a class="volver" href="#/central/sedes">${icono('izq')} Sedes</a>`}
      <h1>${ctx.esSede ? 'Fondos' : d.sede.nombre}</h1><p>Saldo de la sede, movimientos del mes y pedidos de fondos extra.</p></div>
      <div class="vista__acciones">${selectorMes(periodo)}</div></div>

    ${tarjetaSaldo(e.saldos, `${capital(nombrePeriodo(periodo))}: recibido ${pesos(e.fondo_recibido)}${e.fondo_extra ? ` (incluye ${pesos(e.fondo_extra)} extra)` : ''} · gastado ${pesos(e.gastado_sede)}${e.pagado_central ? ` · pagado por la Central ${pesos(e.pagado_central)}` : ''}`)}

    ${esPropia ? html`<div class="acciones">
      ${ctx.puede('fondos.extraccion') ? html`<button class="accion" type="button" data-mover="extraccion">${icono('efectivo')}<span>Sacar efectivo<small>banco → efectivo</small></span></button>
        <button class="accion" type="button" data-mover="deposito">${icono('banco')}<span>Depositar efectivo<small>efectivo → banco</small></span></button>` : ''}
      ${ctx.puede('fondos.pedir_extra') ? html`<button class="accion" type="button" data-extra>${icono('enviar')}<span>Pedir fondos extra<small>lo autoriza el Presidente</small></span></button>` : ''}
    </div>` : ''}

    <div class="grilla grilla--panel">
      <section class="pila">
        <div class="panel__cab" style="margin:0"><h2>Movimientos de ${nombrePeriodo(periodo)}</h2>${chipRendicion(d.rendicion)}</div>
        ${!abierta ? html`<div class="aviso aviso--info">${icono('candado')}<span>El mes está cerrado: no se pueden registrar movimientos.</span></div>` : ''}
        <div class="cifras">
          <div class="cifra"><span>Saldo al empezar el mes</span><strong>${pesos(e.saldo_inicial.total)}</strong></div>
          <div class="cifra"><span>Recibido en el mes</span><strong>${pesos(e.fondo_recibido)}</strong></div>
          <div class="cifra"><span>Gastos (${e.gastos})</span><strong>${pesos(e.gastado_sede + e.pagado_central)}</strong></div>
        </div>
        ${d.movimientos.length ? html`<div class="lista">${d.movimientos.map(itemMovimiento)}</div>` : vacio('Sin movimientos en este mes.', 'cuenta')}
      </section>
      <section class="panel"><div class="panel__cab"><h3>${icono('enviar')} Pedidos de fondos extra</h3></div>
        ${d.pedidos.length ? html`<ul class="historial">${d.pedidos.map(p => html`<li><strong>${pesos(p.importe)}</strong> ${chip(...ESTADO_PED[p.estado])}<br>${p.justificacion}
          ${p.comentario ? html`<br><em>${p.comentario}</em>` : ''}<small>Pidió ${p.pedido_por_nombre} el ${fechaHora(p.pedido_en)} · le quedaban ${pesos(p.saldo_banco + p.saldo_efectivo)}${p.resuelto_por_nombre ? ` · resolvió ${p.resuelto_por_nombre}` : ''}</small></li>`)}</ul>`
          : html`<p class="muted chico">No hubo pedidos.</p>`}
      </section>
    </div>
  </div>`);

  ctx.el.querySelectorAll('[data-mes]').forEach(b => b.addEventListener('click', () => ctx.ir(`#${ctx.params.id ? `/central/sedes/${ctx.params.id}` : '/fondos'}?periodo=${b.dataset.mes}`)));
  ctx.el.querySelectorAll('[data-mover]').forEach(b => b.addEventListener('click', () => moverEfectivo(d.sede.id, b.dataset.mover, () => ctx.recargar())));
  ctx.el.querySelector('[data-extra]')?.addEventListener('click', () => pedirFondosExtra(e.saldos, () => ctx.recargar()));
}
