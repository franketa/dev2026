// Piezas compartidas entre vistas.
import {
  html, raw, get, post, icono, modal, pesos, horas, fecha, fechaCorta, fechaHora, tambor, chipVuelo,
  colorAvion, pedirTexto, toast, error, conBoton
} from '../lib.js';

const TIPOS_MOV = { vuelo: 'avion', pago: 'pago', ajuste: 'ajuste', saldo_inicial: 'ajuste', anulacion: 'anular' };

export function tiraVuelo(v, { piloto = false, ordenAvion = {} } = {}) {
  const quien = piloto ? v.piloto : (v.tipo === 'instruccion' ? `Con ${v.instructor}` : 'Sin instructor');
  return html`
    <button type="button" class="tira ${v.estado === 'anulado' ? 'tira--anulado' : ''}" data-vuelo="${v.id}" style="--serie:${colorAvion(ordenAvion[v.avion_id])}">
      <span class="tira__banda"></span>
      <span class="tira__cuerpo">
        <span class="tira__avion"><span class="matricula">${v.matricula}</span><small>${fechaCorta(v.fecha)}</small></span>
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

export function tarjetaAvion(a) {
  return html`
    <article class="avion" style="--serie:${colorAvion(a.orden)}">
      <div class="avion__cab">
        <span class="avion__marca"></span>
        <div><span class="matricula">${a.matricula}</span><small>${a.modelo}</small></div>
        ${tambor(a.mes_decimas, { tam: 'chico', enteros: 3, etiqueta: 'Horas voladas este mes' })}
      </div>
      <div class="avion__datos">
        <span>Este mes <b>${horas(a.mes_decimas)}</b> en ${a.mes_vuelos} ${a.mes_vuelos === 1 ? 'vuelo' : 'vuelos'}</span>
        ${a.tarifas?.solo ? html`<span>Solo <b>${pesos(a.tarifas.solo)}</b>/h</span>` : ''}
        ${a.tarifas?.instruccion ? html`<span>Con instructor <b>${pesos(a.tarifas.instruccion)}</b>/h</span>` : ''}
      </div>
    </article>`;
}

const ACCIONES_HIST = { alta: 'Cargado', edicion: 'Corregido', anulacion: 'Anulado', cierre: 'Entró en el cierre', retarifa: 'Precio actualizado' };
const CAMPOS = { fecha: 'Fecha', decimas: 'Horas', tipo: 'Tipo', precio_hora: 'Precio/h', importe: 'Importe', notas: 'Notas', avion_id: 'Avión', instructor_id: 'Instructor', piloto_id: 'Piloto' };

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
  const puedeModificar = v.estado === 'abierto' && (ctx.esAdmin || v.piloto_id === ctx.usuario.id);
  const m = modal({
    titulo: html`<span class="matricula">${v.matricula}</span> el ${fecha(v.fecha)}`,
    subtitulo: `${v.piloto}${v.tipo === 'instruccion' ? ` con ${v.instructor}` : ', sin instructor'}`,
    contenido: html`<div class="pila">
      <div class="resultado"><div><span>Tiempo</span><strong>${horas(v.decimas)}</strong><small>${v.decimas * 6} minutos</small></div>
        <div><span>Importe</span><strong>${pesos(v.importe)}</strong><small>${pesos(v.precio_hora)} por hora</small></div></div>
      <dl class="detalle">
        <dt>Estado</dt><dd>${chipVuelo(v)}${v.cierre_periodo ? html` <span class="muted chico">cierre de ${v.cierre_periodo}</span>` : ''}</dd>
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
        </div>` : v.estado === 'cerrado' ? html`<p class="aviso aviso--info">${icono('info')}<span>Este vuelo ya entró en el cierre del mes. Si hay un error, tesorería lo corrige con un ajuste en la cuenta.</span></p>` : ''}
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

export function listaMovimientos(movs, { admin = false } = {}) {
  if (!movs.length) return html`<div class="vacio"><p>Todavía no hay movimientos en la cuenta.</p></div>`;
  return html`<div class="movs">${movs.map(m => html`
    <div class="mov mov--${m.tipo} ${m.anulado_por ? 'mov--anulado' : ''}">
      <span class="mov__icono">${icono(TIPOS_MOV[m.tipo] || 'cuenta')}</span>
      <div class="mov__texto"><strong>${m.concepto}</strong>
        <small>${fecha(m.fecha)}${m.cierre_periodo ? `, cierre ${m.cierre_periodo}` : ''}${admin && m.autor ? `, cargado por ${m.autor}` : ''}, movimiento #${m.id}${m.anulado_por ? `, anulado por #${m.anulado_por}` : ''}</small></div>
      <span class="monto ${m.importe < 0 ? 'monto--neg' : ''}">${pesos(m.importe, { signo: true })}</span>
      ${admin ? html`<div class="mov__acciones">
        <button class="btn btn--fantasma btn--chico" type="button" data-editar-mov="${m.id}">${icono('editar')} Editar</button>
        ${!m.anulado_por && m.tipo !== 'anulacion' ? html`<button class="btn btn--fantasma btn--chico" type="button" data-anular-mov="${m.id}">${icono('anular')} Anular</button>` : ''}
        <button class="btn btn--fantasma btn--chico" type="button" data-borrar-mov="${m.id}" style="color:var(--peligro)">${icono('x')} Borrar</button>
      </div>` : ''}
    </div>`)}</div>`;
}

export function vacio(texto, accion = '') {
  return html`<div class="vacio"><p>${texto}</p>${accion}</div>`;
}

export { raw, conBoton };
