// Piezas compartidas entre vistas.
import {
  html, raw, get, post, icono, modal, pesos, horas, fecha, fechaCorta, fechaHora, tambor, chipVuelo,
  colorAvion, pedirTexto, toast, error, conBoton, nombrePeriodo
} from '../lib.js';

const TIPOS_MOV = { vuelo: 'avion', servicio: 'ticket', pago: 'pago', ajuste: 'ajuste', saldo_inicial: 'ajuste', anulacion: 'anular' };

export function tiraVuelo(v, { piloto = false, ordenAvion = {} } = {}) {
  const quien = piloto ? v.piloto : (v.tipo === 'instruccion' ? `Con ${v.instructor}` : 'Sin instructor');
  return html`
    <button type="button" class="tira ${v.estado === 'anulado' ? 'tira--anulado' : ''}" data-vuelo="${v.id}" style="--serie:${colorAvion(ordenAvion[v.avion_id])}">
      <span class="tira__banda"></span>
      <span class="tira__cuerpo">
        <span class="tira__avion"><span class="matricula">${v.matricula}</span><small>${fechaCorta(v.fecha)}${v.hora_salida ? html`<br>${v.hora_salida}–${v.hora_llegada}` : ''}</small></span>
        <span class="tira__linea1"><strong>${quien}</strong></span>
        <span class="tira__linea2">
          ${piloto && v.tipo === 'instruccion' ? html`<span>Con ${v.instructor}</span>` : ''}
          ${chipVuelo(v)}
        </span>
        ${v.notas ? html`<span class="tira__nota">${icono('nota')}<span>${v.notas}</span></span>` : ''}
      </span>
      <span class="tira__cifras"><span class="horas">${horas(v.decimas).replace(' h', '')}<small> h</small></span><span class="monto">${pesos(v.importe)}</span></span>
    </button>`;
}

export function mapaOrden(aviones) {
  return Object.fromEntries((aviones || []).map((a, i) => [a.id, a.orden || i + 1]));
}

// propio: las horas son las del piloto que mira, no el total del avión.
export function tarjetaAvion(a, { propio = false } = {}) {
  return html`
    <article class="avion" style="--serie:${colorAvion(a.orden)}">
      <div class="avion__cab">
        <span class="avion__marca"></span>
        <div><span class="matricula">${a.matricula}</span><small>${a.modelo}</small></div>
        ${tambor(a.mes_decimas, { tam: 'chico', enteros: 3, etiqueta: propio ? 'Tus horas en este avión este mes' : 'Horas voladas este mes' })}
      </div>
      <div class="avion__datos">
        <span>${propio ? 'Volaste' : 'Este mes'} <b>${horas(a.mes_decimas)}</b> en ${a.mes_vuelos} ${a.mes_vuelos === 1 ? 'vuelo' : 'vuelos'}${propio ? ' este mes' : ''}</span>
        ${a.tarifas?.solo ? html`<span>Solo <b>${pesos(a.tarifas.solo)}</b>/h</span>` : ''}
        ${a.tarifas?.instruccion ? html`<span>Con instructor <b>${pesos(a.tarifas.instruccion)}</b>/h</span>` : ''}
      </div>
    </article>`;
}

const ACCIONES_HIST = { alta: 'Cargado', edicion: 'Corregido', anulacion: 'Anulado', cierre: 'Entró en el cierre', retarifa: 'Precio actualizado' };
const CAMPOS = { fecha: 'Fecha', hora_salida: 'Salida', hora_llegada: 'Llegada', decimas: 'Horas', tipo: 'Tipo', precio_hora: 'Precio/h', importe: 'Importe', notas: 'Notas', avion_id: 'Avión', instructor_id: 'Instructor', piloto_id: 'Piloto' };

function difHistorial(h) {
  if (!h.antes || !h.despues) return '';
  const a = JSON.parse(h.antes); const d = JSON.parse(h.despues);
  const fmt = (k, v) => v == null || v === '' ? '—' : k === 'decimas' ? horas(v) : (k === 'importe' || k === 'precio_hora') ? pesos(v) : k === 'fecha' ? fecha(v) : k === 'tipo' ? (v === 'solo' ? 'sin instructor' : 'con instructor') : v;
  const cambios = Object.keys(CAMPOS).filter(k => k in d && k in a && String(a[k]) !== String(d[k]));
  if (!cambios.length) return '';
  return html`<small>${cambios.map(k => `${CAMPOS[k]}: ${fmt(k, a[k])} → ${fmt(k, d[k])}`).join('; ')}</small>`;
}

// Hoja con el detalle de un vuelo: datos, historial y acciones permitidas.
export async function abrirVuelo(id, ctx, { alCambiar } = {}) {
  let datos;
  try { datos = await get(`/api/vuelos/${id}`); } catch (e) { error(e); return; }
  const { vuelo: v, historial } = datos;
  // Una vez aceptado, sólo tesorería corrige o anula un vuelo.
  const puedeModificar = v.estado === 'abierto' && ctx.esAdmin;
  const m = modal({
    titulo: html`<span class="matricula">${v.matricula}</span> el ${fecha(v.fecha)}`,
    subtitulo: `${v.piloto}${v.tipo === 'instruccion' ? ` con ${v.instructor}` : ', sin instructor'}`,
    contenido: html`<div class="pila">
      <div class="resultado"><div><span>Tiempo</span><strong>${horas(v.decimas)}</strong><small>${v.decimas * 6} minutos</small></div>
        <div><span>Importe</span><strong>${pesos(v.importe)}</strong><small>${pesos(v.precio_hora)} por hora</small></div></div>
      <dl class="detalle">
        <dt>Estado</dt><dd>${chipVuelo(v)}${v.cierre_periodo ? html` <span class="muted chico">cierre de ${v.cierre_periodo}</span>` : ''}</dd>
        ${v.hora_salida ? html`<dt>Horario</dt><dd>Salida ${v.hora_salida}, llegada ${v.hora_llegada}</dd>` : ''}
        <dt>Modelo</dt><dd>${v.modelo}</dd>
        ${v.notas ? html`<dt>Novedades</dt><dd>${v.notas}</dd>` : ''}
        ${v.motivo_anulacion ? html`<dt>Motivo de anulación</dt><dd>${v.motivo_anulacion}</dd>` : ''}
        <dt>Cargado por</dt><dd>${v.cargado_por_nombre}</dd>
      </dl>
      <div class="pila" style="gap:8px"><h3>Historial</h3>
        <ul class="historial">${historial.map(h => html`<li><strong>${ACCIONES_HIST[h.accion] || h.accion}</strong> ${h.usuario ? `por ${h.usuario}` : 'automáticamente'}<small>${fechaHora(h.creado_en)}</small>${difHistorial(h)}${h.accion === 'anulacion' && h.despues ? html`<small>Motivo: ${JSON.parse(h.despues).motivo}</small>` : ''}</li>`)}</ul>
      </div>
      ${puedeModificar ? html`<div class="modal__acciones">
          <button class="btn btn--peligro" type="button" data-anular>${icono('anular')} Anular</button>
          <a class="btn btn--sec" href="#/vuelos/${v.id}/editar">${icono('editar')} Corregir</a>
        </div>` : v.estado === 'cerrado' ? html`<p class="aviso aviso--info">${icono('info')}<span>Este vuelo ya entró en el cierre del mes. Si hay un error, tesorería lo corrige con un ajuste en la cuenta.</span></p>`
        : v.estado === 'abierto' && !ctx.esStaff ? html`<p class="aviso aviso--info">${icono('info')}<span>Los vuelos no se pueden modificar una vez aceptados. Si hay un error, avisale a tesorería.</span></p>` : ''}
    </div>`
  });
  m.el.querySelector('a[href*="editar"]')?.addEventListener('click', () => m.cerrar());
  m.el.querySelector('[data-anular]')?.addEventListener('click', async () => {
    const motivo = await pedirTexto({ titulo: 'Anular vuelo', texto: 'El vuelo no se borra: queda anulado y visible en el historial.', label: 'Motivo', placeholder: 'Ej.: lo cargué dos veces', boton: 'Anular vuelo', peligro: true });
    if (!motivo) return;
    try {
      await post(`/api/vuelos/${v.id}/anular`, { motivo });
      toast('Vuelo anulado', 'ok');
      m.cerrar();
      alCambiar?.();
    } catch (e) { error(e); }
  });
}

// Un movimiento anulado y su anulación se compensan: para leer la cuenta sin ruido, se ocultan los dos.
export function sinAnulados(movs) {
  return movs.filter(m => !m.anulado_por && m.tipo !== 'anulacion');
}

export function listaMovimientos(movs, { admin = false } = {}) {
  if (!movs.length) return html`<div class="vacio"><p>Todavía no hay movimientos en la cuenta.</p></div>`;
  return html`<div class="movs">${movs.map(m => html`
    <div class="mov mov--${m.tipo} ${m.anulado_por ? 'mov--anulado' : ''}">
      <span class="mov__icono">${icono(TIPOS_MOV[m.tipo] || 'cuenta')}</span>
      <div class="mov__texto"><strong>${m.concepto}</strong>
        <small>${fecha(m.fecha)}${m.cierre_periodo ? `, cierre ${m.cierre_periodo}` : ''}${admin && m.autor ? `, cargado por ${m.autor}` : ''}, movimiento #${m.id}${m.anulado_por ? `, anulado por #${m.anulado_por}` : ''}</small></div>
      <span class="monto ${m.importe < 0 ? 'monto--neg' : ''}">${pesos(m.importe, { signo: true })}</span>
      ${m.ticket_id || (admin && m.tipo !== 'servicio') ? html`<div class="mov__acciones">
        ${m.ticket_id ? html`<a class="btn btn--fantasma btn--chico" href="/api/tickets/${m.ticket_id}/pdf" target="_blank" rel="noopener">${icono('pdf')} Ticket</a>` : ''}
        ${admin && m.ticket_id ? html`<a class="btn btn--fantasma btn--chico" href="#/admin/tickets?periodo=${m.fecha.slice(0, 7)}" data-escritura>${icono('anular')} Anular desde Tickets</a>` : ''}
        ${admin && !m.ticket_id ? html`
          <button class="btn btn--fantasma btn--chico" type="button" data-editar-mov="${m.id}" data-escritura>${icono('editar')} Editar</button>
          ${!m.anulado_por && m.tipo !== 'anulacion' ? html`<button class="btn btn--fantasma btn--chico" type="button" data-anular-mov="${m.id}" data-escritura>${icono('anular')} Anular</button>` : ''}
          <button class="btn btn--fantasma btn--chico" type="button" data-borrar-mov="${m.id}" data-escritura style="color:var(--peligro)">${icono('x')} Borrar</button>` : ''}
      </div>` : ''}
    </div>`)}</div>`;
}

// Filas "concepto … importe" que terminan en un total: el contenido de los "?" de saldos.
function cuenta(filas, total, nota = '') {
  return html`<div class="compo">
    ${filas.filter(Boolean).map(([k, v]) => html`<div class="compo__fila"><span>${k}</span><b>${pesos(v, { signo: true })}</b></div>`)}
    <div class="compo__fila compo__total"><span>${total[0]}</span><b>${pesos(total[1])}</b></div>
    ${nota ? html`<p class="compo__nota">${nota}</p>` : ''}
  </div>`;
}

// Cómo se forma el saldo: el último cupón y lo que pasó después del cierre. Los vuelos abiertos no
// están en el saldo: se avisa aparte.
export function detalleSaldo(c, { abiertos, proximo, propio = true } = {}) {
  const filas = [
    c.cupon ? [`Cupón de ${nombrePeriodo(c.cupon.periodo)} (N.º ${c.cupon.numero})`, c.cupon.total] : c.anterior ? ['Saldo anterior', c.anterior] : null,
    c.pagos ? ['Pagos desde el cierre', c.pagos] : null,
    c.servicios ? ['Servicios cargados a la cuenta', c.servicios] : null,
    c.ajustes ? ['Ajustes', c.ajustes] : null,
    c.vuelos ? ['Vuelos', c.vuelos] : null
  ];
  if (!filas.some(Boolean)) filas.push(['Sin movimientos todavía', 0]);
  const nota = abiertos?.importe
    ? `Los vuelos que ${propio ? 'cargaste' : 'cargó'} después del último cierre (${pesos(abiertos.importe)}) todavía no están en este saldo: se suman${proximo ? ` en el cierre de ${nombrePeriodo(proximo.periodo)}, el ${fecha(proximo.fecha)}` : ' en el próximo cierre'}.`
    : '';
  return cuenta(filas, [c.saldo < 0 ? 'Saldo a favor' : 'Saldo', Math.abs(c.saldo)], nota);
}

// Los vuelos que todavía no entraron en un cierre y lo que quedaría en el próximo cupón.
export function detalleProximoCierre(c, abiertos, proximo) {
  return cuenta([
    [`${abiertos.vuelos} ${abiertos.vuelos === 1 ? 'vuelo' : 'vuelos'} sin facturar (${horas(abiertos.decimas)})`, abiertos.importe],
    c.saldo ? [c.saldo > 0 ? 'Más lo que debés hoy' : 'Menos tu saldo a favor', c.saldo] : null
  ], ['Próximo cupón, si no pagás antes', Math.max(c.saldo + abiertos.importe, 0)],
  `Los vuelos se facturan en el cierre de ${nombrePeriodo(proximo.periodo)}, el ${fecha(proximo.fecha)}. El derecho de aeronave del mes también se suma ese día.`);
}

// Datos para transferir, con el botón para informar el pago al lado (que nadie diga "no lo vi").
export function cajaPago(p) {
  const hay = p.alias || p.cbu;
  return html`<section class="panel pagar">
    <div class="panel__cab"><div><h2>Cómo pagar</h2><p>Transferí y después informá el pago: así tesorería lo encuentra y lo descuenta de tu saldo.</p></div></div>
    <div class="pagar__cuerpo">
      <div class="pagar__datos">
        ${hay ? '' : html`<p class="muted">Tesorería todavía no cargó los datos para transferir. Consultalos en el club.</p>`}
        ${p.alias ? html`<div class="pagar__alias"><span>Alias</span><strong>${p.alias}</strong><button class="btn btn--sec btn--chico" type="button" data-copiar="${p.alias}">Copiar</button></div>` : ''}
        <dl class="detalle">
          ${p.cbu ? html`<dt>CBU / CVU</dt><dd><span class="pagar__cbu">${p.cbu}</span> <button class="btn btn--fantasma btn--chico" type="button" data-copiar="${p.cbu}">Copiar</button></dd>` : ''}
          ${p.titular ? html`<dt>Titular</dt><dd>${p.titular}</dd>` : ''}
          ${p.cuit ? html`<dt>CUIT</dt><dd>${p.cuit}</dd>` : ''}
          ${p.banco ? html`<dt>Banco</dt><dd>${p.banco}</dd>` : ''}
        </dl>
      </div>
      ${p.qr ? html`<a class="pagar__qr" href="/api/pago-qr" target="_blank" rel="noopener" aria-label="Ver el QR en grande"><img src="/api/pago-qr" alt="QR para pagar"><small>Tocá para agrandar</small></a>` : ''}
    </div>
    ${p.instrucciones ? html`<p class="muted chico">${p.instrucciones}</p>` : ''}
    <button class="btn btn--principal btn--ancho" type="button" data-informar>${icono('informar')} Informar el pago</button>
  </section>`;
}

export function vacio(texto, accion = '') {
  return html`<div class="vacio"><p>${texto}</p>${accion}</div>`;
}

export { raw, conBoton };
