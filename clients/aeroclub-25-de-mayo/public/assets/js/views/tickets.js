// Tickets de servicios (hangaraje, combustible, etc.) y registro de aeronaves de terceros.
// Rampa arma tickets con los servicios de la tabla; tesorería además agrega eventos y otros conceptos.
import {
  get, post, put, html, raw, pintar, icono, pesos, fecha, hoyAR, periodoHoy, selectorMes, modal, confirmar, toast, error,
  conBoton, datosForm, parsePesos, pesosInput, nombreLista, nombreCompleto, rolTexto, chipTicket, linkWa, opcionesMedio, MEDIOS
} from '../lib.js';
import { vacio } from './comun.js';

const UNIDADES = { unidad: ['unidad', 'unidades'], hora: ['hora', 'horas'], litro: ['litro', 'litros'], noche: ['noche', 'noches'], dia: ['día', 'días'], mes: ['mes', 'meses'] };
const unidadPlural = (u) => UNIDADES[u]?.[1] || '';

// "40,5" → 4050 (centésimas); null si no es válido.
function parseCantidad(v) {
  const s = String(v ?? '').trim().replace(',', '.');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
  const [e, d = ''] = s.split('.');
  const n = Number(e) * 100 + Number(d.padEnd(2, '0'));
  return n > 0 ? n : null;
}

const EVENTOS = { total: 'Evento, pago total', anticipo: 'Evento, anticipo' };

// Cuadro para cargar un evento (alquiler del hangar, bautismos, cenas…): qué es, si se cobra
// completo o es un anticipo, y el importe. Devuelve el ítem o null si se cancela.
function pedirEvento(it = {}) {
  return new Promise((ok) => {
    const m = modal({
      titulo: it.evento ? 'Editar evento' : 'Evento',
      subtitulo: 'Queda escrito en el ticket y en la cuenta.',
      alCerrar: (v) => ok(v ?? null),
      contenido: html`<form class="form" novalidate>
        <div class="campo"><label for="ev-detalle">Descripción del evento</label>
          <textarea class="textarea" id="ev-detalle" name="detalle" maxlength="300" required autofocus placeholder="Ej.: alquiler del hangar para el cumpleaños del 15 de noviembre">${it.detalle || ''}</textarea></div>
        <fieldset class="campo" style="border:0;padding:0;margin:0"><legend class="campo__label" style="padding:0;margin-bottom:6px">En concepto de</legend>
          <div class="segmentado">
            <label><input type="radio" name="evento" value="total" ${it.evento === 'anticipo' ? '' : raw('checked')}><span>Pago total<small>El evento queda pago</small></span></label>
            <label><input type="radio" name="evento" value="anticipo" ${it.evento === 'anticipo' ? raw('checked') : ''}><span>Anticipo<small>Seña, falta el resto</small></span></label>
          </div>
        </fieldset>
        <div class="campo"><label for="ev-importe">Importe</label><input class="input" id="ev-importe" name="importe" inputmode="decimal" value="${pesosInput(it.precio)}" placeholder="0" required></div>
        <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">${it.evento ? 'Guardar' : 'Agregar'}</button></div>
      </form>`
    });
    const form = m.el.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = datosForm(form);
      const precio = parsePesos(d.importe);
      if (!d.detalle.trim()) { form.detalle.setAttribute('aria-invalid', 'true'); form.detalle.focus(); return; }
      if (!precio || precio <= 0) { form.importe.setAttribute('aria-invalid', 'true'); form.importe.focus(); return; }
      m.cerrar({ evento: d.evento, detalle: d.detalle.trim(), precio });
    });
  });
}

const base = (ctx) => (ctx.usuario.rol === 'rampa' ? '#/rampa' : '#/admin');
const urlTicketPdf = (ctx, t) => (ctx.usuario.rol === 'rampa' ? `/api/rampa/tickets/${t.id}/pdf` : `/api/admin/tickets/${t.id}/pdf`);

function waTicket(t) {
  const estado = t.estado === 'anulado' ? 'Quedó anulado.' : t.cobrado_en_acto ? 'Ya está pagado.' : 'Se suma a tu cuenta del club.';
  return linkWa(t.telefono, `Hola ${t.nombre}. Te enviamos el ticket ${t.numero_txt} del Aeroclub 25 de Mayo${t.matricula ? ` por servicios a ${t.matricula}` : ''}: ${t.resumen}. Total ${pesos(t.total)}. ${estado} Descargalo acá: ${location.origin}/t/${t.token}`);
}

function accionesTicket(ctx, t, { anular = false } = {}) {
  const wa = t.estado !== 'anulado' ? waTicket(t) : null;
  return html`
    ${wa ? html`<a class="btn btn--wa btn--chico" href="${wa}" target="_blank" rel="noopener">${icono('wa')} WhatsApp</a>` : ''}
    <a class="btn btn--sec btn--chico" href="${urlTicketPdf(ctx, t)}" target="_blank" rel="noopener">${icono('pdf')} PDF</a>
    ${anular && t.estado !== 'anulado' ? html`<button class="btn btn--fantasma btn--chico" type="button" data-anular-ticket="${t.id}" data-escritura style="color:var(--peligro)">${icono('anular')} Anular</button>` : ''}`;
}

function tablaTickets(ctx, lista, { anular = false } = {}) {
  if (!lista.length) return vacio('No hay tickets en este mes.');
  return html`<div class="tabla-caja"><table class="tabla tabla--tarjetas">
    <thead><tr><th>Ticket</th><th>A cargo de</th><th>Detalle</th><th class="num">Total</th><th>Cobro</th><th></th></tr></thead>
    <tbody>${lista.map(t => html`<tr class="${t.estado === 'anulado' ? 'fila--anulada' : ''}">
      <td class="celda-ppal"><strong>${t.numero_txt}</strong> ${t.matricula ? html`<span class="matricula">${t.matricula}</span>` : ''}${t.piloto ? html`<div class="chico">Piloto: ${t.piloto}</div>` : ''}<div class="muted chico">${fecha(t.fecha)}${t.origen === 'cierre' ? ', cierre del mes' : t.creado_por_nombre ? `, ${t.creado_por_nombre}` : ''}</div></td>
      <td data-label="A cargo de">${t.transitos ? html`<span class="chip chip--neutro">Tránsito</span>` : html`${nombreLista(t)}${t.usuario_rol === 'externo' ? html` <span class="chip chip--neutro">Externo</span>` : ''}`}</td>
      <td data-label="Detalle" class="chico">${t.resumen}${t.motivo_anulacion ? html`<div class="muted">Anulado: ${t.motivo_anulacion}</div>` : ''}</td>
      <td class="num monto" data-label="Total">${pesos(t.total)}</td>
      <td data-label="Cobro">${chipTicket(t)}</td>
      <td class="celda-acciones"><div class="tabla__acciones">${accionesTicket(ctx, t, { anular })}</div></td>
    </tr>`)}</tbody></table></div>`;
}

// ── Alta / edición de aeronave ───────────────────────────────────────────────
// Sin dueño registrado queda como tránsito; si es de un socio (o de un externo ya cargado), sus
// tickets van a esa cuenta.
export function modalAeronave({ aeronave = null, cuentas, matricula = '' }, alGuardar) {
  const a = aeronave || {};
  const transitos = cuentas.find(c => c.transitos)?.id;
  const conDueno = aeronave && a.propietario_id !== transitos;
  const m = modal({
    titulo: aeronave ? `Editar ${a.matricula}` : 'Registrar matrícula',
    subtitulo: 'Aeronaves que no son de la flota del club.',
    contenido: html`<form class="form" novalidate>
      <div class="fila-campos">
        <div class="campo"><label for="ae-mat">Matrícula</label><input class="input" id="ae-mat" name="matricula" value="${a.matricula || matricula}" placeholder="LV-ABC" autocapitalize="characters" required autofocus></div>
        <div class="campo"><label for="ae-mod">Modelo <span class="muted">(opcional)</span></label><input class="input" id="ae-mod" name="modelo" value="${a.modelo || ''}" placeholder="Cessna 172"></div>
      </div>
      <fieldset class="campo" style="border:0;padding:0;margin:0"><legend class="sr">De quién es</legend>
        <div class="segmentado">
          <label><input type="radio" name="quien" value="transito" ${conDueno ? '' : raw('checked')}><span>Tránsito<small>De paso, se cobra en el acto</small></span></label>
          <label><input type="radio" name="quien" value="existente" ${conDueno ? raw('checked') : ''}><span>De un socio<small>O de un externo cargado</small></span></label>
        </div>
      </fieldset>
      <div class="campo" data-bloque="existente" hidden><label for="ae-prop">Propietario</label>
        <select class="select" id="ae-prop" name="propietario_id"><option value="">Elegí</option>
          ${cuentas.filter(c => !c.transitos).map(c => html`<option value="${c.id}" ${c.id === a.propietario_id ? raw('selected') : ''}>${nombreLista(c)} (${rolTexto(c).toLowerCase()})</option>`)}
        </select></div>
      <div class="campo"><label for="ae-notas">Notas <span class="muted">(opcional)</span></label><input class="input" id="ae-notas" name="notas" value="${a.notas || ''}" maxlength="300" placeholder="Ej.: hangar 2, del fondo"></div>
      <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">${aeronave ? 'Guardar' : 'Registrar'}</button></div>
    </form>`
  });
  const form = m.el.querySelector('form');
  const bloques = () => { form.querySelector('[data-bloque]').hidden = form.quien.value !== 'existente'; };
  form.addEventListener('change', (e) => { if (e.target.name === 'quien') bloques(); });
  bloques();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = datosForm(form);
    if (d.quien === 'existente' && !d.propietario_id) { form.propietario_id.setAttribute('aria-invalid', 'true'); form.propietario_id.focus(); return; }
    const cuerpo = { matricula: d.matricula, modelo: d.modelo, notas: d.notas, propietario_id: d.quien === 'existente' ? Number(d.propietario_id) : transitos };
    conBoton(form.querySelector('[type=submit]'), async () => {
      try {
        const r = aeronave ? await put(`/api/rampa/aeronaves/${a.id}`, cuerpo) : await post('/api/rampa/aeronaves', cuerpo);
        toast(aeronave ? 'Aeronave actualizada' : `${r.aeronave.matricula} registrada`, 'ok');
        m.cerrar(true);
        alGuardar?.(r.aeronave);
      } catch (err) { error(err); }
    });
  });
  return m;
}

// ── Nuevo ticket ────────────────────────────────────────────────────────────
export async function nuevoTicket(ctx) {
  const datos = await get('/api/rampa/datos');
  const admin = ctx.esAdmin;
  // La matrícula elegida: 'ae:ID' (aeronave registrada), 'av:ID' (flota del club) o '' (sin aeronave).
  const estado = {
    clave: ctx.query.aeronave ? `ae:${ctx.query.aeronave}` : '',
    usuarioId: Number(ctx.query.usuario) || null,
    items: [],
    cobrado: false
  };
  let sig = 1;
  const aeronave = () => (estado.clave.startsWith('ae:') ? datos.aeronaves.find(a => a.id === Number(estado.clave.slice(3))) || null : null);
  const avion = () => (estado.clave.startsWith('av:') ? datos.aviones.find(a => a.id === Number(estado.clave.slice(3))) || null : null);
  const cuenta = () => datos.cuentas.find(c => c.id === estado.usuarioId) || null;
  const servicio = (id) => datos.servicios.find(s => s.id === Number(id));
  if (aeronave() && !estado.usuarioId) estado.usuarioId = aeronave().propietario_id;

  const opcionesMatricula = () => html`
    <option value="">${admin ? 'Sin aeronave' : 'Elegí la matrícula'}</option>
    ${datos.aeronaves.length ? html`<optgroup label="Aeronaves registradas">${datos.aeronaves.map(a => html`<option value="ae:${a.id}" ${estado.clave === `ae:${a.id}` ? raw('selected') : ''}>${a.matricula}${a.modelo ? ` · ${a.modelo}` : ''} · ${a.propietario_id === datos.cuentas.find(c => c.transitos)?.id ? 'tránsito' : nombreCompleto({ nombre: a.prop_nombre, apellido: a.prop_apellido })}</option>`)}</optgroup>` : ''}
    <optgroup label="Flota del club">${datos.aviones.map(a => html`<option value="av:${a.id}" ${estado.clave === `av:${a.id}` ? raw('selected') : ''}>${a.matricula} · ${a.modelo}</option>`)}</optgroup>
    <option value="nueva">+ Registrar otra matrícula…</option>`;
  const opcionesCargo = () => html`
    <option value="">Elegí la cuenta</option>
    ${datos.cuentas.map(c => html`<option value="${c.id}" ${c.id === estado.usuarioId ? raw('selected') : ''}>${c.transitos ? 'Tránsitos (aeronave de paso)' : `${nombreLista(c)}${c.rol === 'externo' ? ' (externo)' : ''}${c.bloqueado ? ' (bloqueado)' : ''}`}</option>`)}`;

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab"><div>
      ${admin ? html`<a class="volver" href="${ctx.query.usuario ? `#/admin/cuentas/${ctx.query.usuario}` : '#/admin/tickets'}">${icono('izq')} Volver</a>` : ''}
      <h1>Nuevo ticket</h1>
      <p>${admin ? 'Servicios u otros conceptos a la cuenta de un socio o externo. Si es a cuenta, entra en su cupón del mes.' : 'Servicios a una aeronave. A los socios se les puede dejar a cuenta; a externos y tránsitos se les cobra en el momento.'}</p>
    </div></div>
    <form class="carga" id="form-ticket" novalidate>
      <div class="carga__paso">
        <h2><span class="num">1</span> <label for="matricula">Matrícula</label>${admin ? html` <span class="muted chico" style="font-weight:500">(opcional)</span>` : ''}</h2>
        <select class="select" id="matricula" name="matricula">${opcionesMatricula()}</select>
        <div class="campo"><label for="piloto">Piloto al mando <span class="muted" id="piloto-req"></span></label>
          <input class="input" id="piloto" name="piloto" maxlength="80" autocomplete="off" placeholder="Nombre y apellido"></div>
      </div>
      <div class="carga__paso">
        <h2><span class="num">2</span> <label for="a-cargo">A cargo de</label></h2>
        <select class="select" id="a-cargo" name="usuario_id">${opcionesCargo()}</select>
        <p class="campo__ayuda" id="ayuda-cargo"></p>
      </div>
      <div class="carga__paso">
        <h2><span class="num">3</span> Servicios</h2>
        <div class="chips-servicio" role="group" aria-label="Agregar servicio">
          ${datos.servicios.map(s => html`<button type="button" class="btn btn--sec btn--chico" data-agregar="${s.id}" ${s.precio ? '' : raw('title="Sin precio cargado"')}>${icono('mas')} ${s.nombre}</button>`)}
          ${admin ? html`<button type="button" class="btn btn--sec btn--chico" data-evento>${icono('mas')} Evento</button>
          <button type="button" class="btn btn--fantasma btn--chico" data-agregar="otro">${icono('mas')} Otro concepto</button>` : ''}
        </div>
        <div id="items" class="items"></div>
      </div>
      <div class="carga__paso">
        <h2><span class="num">4</span> Cobro</h2>
        <div class="segmentado" id="cobro">
          <label><input type="radio" name="cobro" value="cuenta" checked><span>A cuenta<small>Entra en el cupón del mes</small></span></label>
          <label><input type="radio" name="cobro" value="ahora"><span>Pagó ahora<small>Queda registrado el pago</small></span></label>
        </div>
        <p class="campo__ayuda" id="ayuda-cobro" hidden></p>
        <div class="campo" id="campo-medio" hidden><label for="medio">¿Cómo pagó?</label><select class="select" id="medio" name="medio">${opcionesMedio('efectivo')}</select></div>
      </div>
      <details class="carga__paso"><summary class="chico" style="cursor:pointer;color:var(--azul);font-weight:600">Fecha y notas</summary>
        <div class="pila" style="gap:12px;margin-top:10px">
          <div class="campo"><label for="t-fecha">Fecha</label><input class="input" type="date" id="t-fecha" name="fecha" value="${hoyAR()}" max="${hoyAR()}"></div>
          <div class="campo"><label for="t-notas">Notas</label><textarea class="textarea" id="t-notas" name="notas" maxlength="500" placeholder="Ej.: cargó en la bomba 2"></textarea></div>
        </div>
      </details>
      <div class="resultado" id="total-ticket" aria-live="polite"></div>
      <p class="aviso aviso--mal" id="error-ticket" role="alert" hidden></p>
      <div class="carga__enviar"><button class="btn btn--principal btn--grande btn--ancho" type="submit">${icono('check')} Generar ticket</button></div>
    </form>
  </div>`);

  const form = ctx.el.querySelector('#form-ticket');
  const $mat = form.matricula;
  const $cargo = form.usuario_id;
  const $items = ctx.el.querySelector('#items');
  const $total = ctx.el.querySelector('#total-ticket');
  const $err = ctx.el.querySelector('#error-ticket');

  // A cargo de, piloto obligatorio (tránsitos) y cobro forzado (externos) dependen de la cuenta elegida.
  function pintarCargo() {
    $cargo.value = estado.usuarioId ? String(estado.usuarioId) : '';
    const a = aeronave();
    const c = cuenta();
    const ayuda = ctx.el.querySelector('#ayuda-cargo');
    ayuda.textContent = avion() ? `${avion().matricula} es de la flota del club: elegí a nombre de quién va.`
      : a && c?.transitos ? `${a.matricula} está registrada como tránsito.`
      : a ? (a.propietario_id === estado.usuarioId ? `Propietario de ${a.matricula}. Si lo paga otra persona, cambialo.` : `Ojo: el propietario de ${a.matricula} es ${nombreCompleto({ nombre: a.prop_nombre, apellido: a.prop_apellido })}.`)
      : '';
    ctx.el.querySelector('#piloto-req').textContent = c?.transitos ? '(obligatorio en tránsitos)' : '(opcional)';
    // Externos, tránsitos y (para rampa) socios bloqueados por deuda: sólo se cobra en el momento.
    const externo = c?.rol === 'externo' || (!!c?.bloqueado && !admin);
    const $cuenta = form.querySelector('input[name=cobro][value=cuenta]');
    // Externos y tránsitos: sólo "pagó ahora". Al volver a un socio, se vuelve a "a cuenta".
    if (externo) form.querySelector('input[name=cobro][value=ahora]').checked = true;
    else if ($cuenta.disabled) $cuenta.checked = true;
    $cuenta.disabled = externo;
    estado.cobrado = form.cobro.value === 'ahora';
    const $ayudaCobro = ctx.el.querySelector('#ayuda-cobro');
    $ayudaCobro.textContent = c?.bloqueado ? `${nombreLista(c)} está bloqueado por falta de pago${admin ? '.' : ': se le cobra en el momento.'}` : 'A externos y tránsitos se les cobra siempre en el momento.';
    $ayudaCobro.hidden = !externo && !c?.bloqueado;
    ctx.el.querySelector('#campo-medio').hidden = !estado.cobrado;
    calcular();
  }

  function filaItem(it) {
    if (it.evento) {
      return html`<div class="item" data-item="${it.k}">
        <div class="item__concepto"><strong>${EVENTOS[it.evento]}</strong><div class="muted chico">${it.detalle}</div>
          <button type="button" class="btn btn--fantasma btn--chico" data-editar-evento="${it.k}">${icono('editar')} Editar</button></div>
        <div class="item__cant"></div><div class="item__precio"></div>
        <strong class="item__importe monto">${pesos(it.precio)}</strong>
        <button type="button" class="btn btn--fantasma btn--chico item__quitar" data-quitar="${it.k}" aria-label="Quitar">${icono('x')}</button>
      </div>`;
    }
    const s = it.servicio_id ? servicio(it.servicio_id) : null;
    const cant = parseCantidad(it.cantidad);
    const precio = it.precio;
    const importe = cant && precio ? Math.round(precio * cant / 100) : null;
    return html`<div class="item" data-item="${it.k}">
      <div class="item__concepto">${s ? html`<strong>${s.nombre}</strong>` : html`<input class="input" data-campo="concepto" value="${it.concepto || ''}" placeholder="Concepto" maxlength="80" aria-label="Concepto">`}</div>
      <label class="item__cant"><span class="sr">Cantidad</span><input class="input" data-campo="cantidad" inputmode="decimal" value="${it.cantidad}" aria-invalid="${cant ? 'false' : 'true'}"><small>${s ? unidadPlural(s.unidad) : 'unidades'}</small></label>
      <div class="item__precio">${admin
        ? html`<label><span class="sr">Precio</span><input class="input" data-campo="precio" inputmode="decimal" value="${pesosInput(precio)}" placeholder="Precio"></label><small>${s ? `por ${UNIDADES[s.unidad][0]}` : 'c/u'}</small>`
        : html`<span>${precio ? pesos(precio) : 'Sin precio'}</span><small>${s ? `por ${UNIDADES[s.unidad][0]}` : ''}</small>`}</div>
      <strong class="item__importe monto">${importe != null ? pesos(importe) : '—'}</strong>
      <button type="button" class="btn btn--fantasma btn--chico item__quitar" data-quitar="${it.k}" aria-label="Quitar">${icono('x')}</button>
    </div>`;
  }

  function pintarItems() {
    pintar($items, estado.items.length ? estado.items.map(filaItem) : html`<p class="muted chico">Tocá un servicio de arriba para agregarlo.</p>`);
    calcular();
  }

  function calcular() {
    const total = estado.items.reduce((s, it) => {
      const c = parseCantidad(it.cantidad);
      return s + (c && it.precio ? Math.round(it.precio * c / 100) : 0);
    }, 0);
    const n = estado.items.length;
    pintar($total, html`<div><span>Total</span><strong>${pesos(total)}</strong><small>${n} ${n === 1 ? 'ítem' : 'ítems'}</small></div>
      <div><span>Cobro</span><strong style="font-size:1.2rem">${estado.cobrado ? `Pagó ahora (${MEDIOS[form.medio.value]})` : 'A cuenta'}</strong><small>${estado.cobrado ? 'Se registra el pago' : 'Se suma al cupón del mes'}</small></div>`);
  }

  // Cambios en los inputs de los ítems: se actualiza el estado sin repintar la fila (no perder el foco).
  $items.addEventListener('input', (e) => {
    const fila = e.target.closest('[data-item]');
    if (!fila) return;
    const it = estado.items.find(x => x.k === Number(fila.dataset.item));
    const campo = e.target.dataset.campo;
    if (campo === 'precio') it.precio = parsePesos(e.target.value);
    else it[campo] = e.target.value;
    if (campo === 'cantidad') e.target.setAttribute('aria-invalid', parseCantidad(it.cantidad) ? 'false' : 'true');
    const c = parseCantidad(it.cantidad);
    fila.querySelector('.item__importe').textContent = c && it.precio ? pesos(Math.round(it.precio * c / 100)) : '—';
    calcular();
  });

  ctx.el.addEventListener('click', async (e) => {
    const ev = e.target.closest('[data-evento], [data-editar-evento]');
    if (ev) {
      const actual = ev.dataset.editarEvento ? estado.items.find(x => x.k === Number(ev.dataset.editarEvento)) : null;
      const r = await pedirEvento(actual || {});
      if (!r) return;
      if (actual) Object.assign(actual, r);
      else estado.items.push({ k: sig++, servicio_id: null, concepto: '', cantidad: '1', ...r });
      pintarItems();
      return;
    }
    const ag = e.target.closest('[data-agregar]');
    if (ag) {
      const s = ag.dataset.agregar === 'otro' ? null : servicio(ag.dataset.agregar);
      if (s && !s.precio && !admin) { error({ message: `${s.nombre} no tiene precio cargado. Pedile a tesorería que lo complete.` }); return; }
      estado.items.push({ k: sig++, servicio_id: s?.id ?? null, concepto: '', cantidad: '1', precio: s?.precio || null });
      pintarItems();
      const ultima = $items.querySelector('.item:last-child input');
      ultima?.focus();
      ultima?.select?.();
      return;
    }
    const q = e.target.closest('[data-quitar]');
    if (q) { estado.items = estado.items.filter(x => x.k !== Number(q.dataset.quitar)); pintarItems(); }
  });

  function elegirMatricula(clave) {
    estado.clave = clave;
    const a = aeronave();
    if (a) estado.usuarioId = a.propietario_id;
    // Un avión del club no tiene dueño: que elijan la cuenta (salvo que vengan desde la cuenta de un socio).
    else if (avion()) estado.usuarioId = Number(ctx.query.usuario) || null;
    pintarCargo();
  }

  form.addEventListener('change', (e) => {
    if (e.target === $mat) {
      if ($mat.value !== 'nueva') return elegirMatricula($mat.value);
      $mat.value = estado.clave;     // si cancela el alta, queda la que estaba
      modalAeronave({ cuentas: datos.cuentas }, async (nueva) => {
        const frescos = await get('/api/rampa/datos').catch(() => null);
        if (frescos) Object.assign(datos, frescos);
        else datos.aeronaves.push(nueva);
        pintar($mat, opcionesMatricula());
        pintar($cargo, opcionesCargo());
        elegirMatricula(`ae:${nueva.id}`);
        $mat.value = estado.clave;
        form.piloto.focus();
      });
      return;
    }
    if (e.target === $cargo) { estado.usuarioId = Number($cargo.value) || null; pintarCargo(); }
    if (e.target.name === 'cobro') { estado.cobrado = e.target.value === 'ahora'; ctx.el.querySelector('#campo-medio').hidden = !estado.cobrado; }
    calcular();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    $err.hidden = true;
    const d = datosForm(form);
    const falta = !admin && !estado.clave ? 'Elegí la matrícula (o registrá una nueva).'
      : !estado.usuarioId ? 'Elegí a nombre de quién va el ticket.'
      : cuenta()?.transitos && !d.piloto.trim() ? 'Escribí el piloto al mando: en los tránsitos es lo que identifica el ticket.'
      : !estado.items.length ? 'Agregá al menos un servicio.'
      : estado.items.some(it => !parseCantidad(it.cantidad)) ? 'Revisá las cantidades: números con hasta dos decimales (ej.: 40,5).'
      : estado.items.some(it => !it.servicio_id && !it.evento && !String(it.concepto || '').trim()) ? 'Escribí el concepto.'
      : estado.items.some(it => !it.precio) ? 'Falta el precio de algún ítem.'
      : null;
    if (falta) { $err.textContent = falta; $err.hidden = false; $err.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }

    // Un ticket no se edita: se lo mostramos entero antes de generarlo (como al cargar un vuelo).
    const mat = aeronave()?.matricula || avion()?.matricula;
    const c = cuenta();
    const lineas = estado.items.map((it) => {
      if (it.evento) return html`<div>${EVENTOS[it.evento]}: <strong>${pesos(it.precio)}</strong><div class="muted chico">${it.detalle}</div></div>`;
      const s = it.servicio_id ? servicio(it.servicio_id) : null;
      const cant = parseCantidad(it.cantidad);
      const unidad = s ? (cant === 100 ? UNIDADES[s.unidad][0] : unidadPlural(s.unidad)) : (cant === 100 ? 'unidad' : 'unidades');
      return html`<div>${s ? s.nombre : it.concepto.trim()}: ${it.cantidad} ${unidad} × ${pesos(it.precio)} = <strong>${pesos(Math.round(it.precio * cant / 100))}</strong></div>`;
    });
    const total = estado.items.reduce((s, it) => s + Math.round(it.precio * parseCantidad(it.cantidad) / 100), 0);
    const ok = await confirmar({
      titulo: 'Revisá el ticket',
      contenido: html`<div class="pila" style="gap:12px">
        <dl class="detalle">
          <dt>Matrícula</dt><dd>${mat ? html`<strong class="matricula">${mat}</strong>` : 'Sin aeronave'}</dd>
          ${d.piloto.trim() ? html`<dt>Piloto al mando</dt><dd>${d.piloto.trim()}</dd>` : ''}
          <dt>A cargo de</dt><dd>${c.transitos ? 'Tránsitos (aeronave de paso)' : nombreCompleto(c)}</dd>
          <dt>Servicios</dt><dd>${lineas}</dd>
          <dt>Total</dt><dd><strong>${pesos(total)}</strong></dd>
          <dt>Cobro</dt><dd>${estado.cobrado ? `Pagó ahora (${MEDIOS[d.medio]})` : 'A cuenta, entra en el cupón del mes'}</dd>
          <dt>Fecha</dt><dd>${fecha(d.fecha)}</dd>
          ${d.notas.trim() ? html`<dt>Notas</dt><dd>${d.notas.trim()}</dd>` : ''}
        </dl>
        <p class="aviso">${icono('alerta')}<span><b>Asegurate de que los datos ingresados sean correctos:</b> ${admin
          ? 'una vez generado, el ticket no se puede modificar. Si hay un error, hay que anularlo y hacer uno nuevo.'
          : 'una vez generado, el ticket no se puede modificar. Si hay un error, sólo tesorería puede anularlo.'}</span></p>
      </div>`,
      boton: 'Aceptar y generar'
    });
    if (!ok) return;

    const cuerpo = {
      aeronave_id: aeronave()?.id ?? null, avion_id: avion()?.id ?? null, usuario_id: estado.usuarioId, piloto: d.piloto,
      fecha: d.fecha, notas: d.notas, cobrado: estado.cobrado, medio: estado.cobrado ? d.medio : null,
      items: estado.items.map(it => ({
        servicio_id: it.servicio_id, concepto: it.concepto, cantidad: it.cantidad, precio: admin ? pesosInput(it.precio) : undefined,
        evento: it.evento, detalle: it.detalle
      }))
    };
    await conBoton(form.querySelector('[type=submit]'), async () => {
      try {
        const { ticket } = await post(admin ? '/api/admin/tickets' : '/api/rampa/tickets', cuerpo);
        listo(ctx, ticket);
      } catch (err) {
        $err.textContent = err.message;
        $err.hidden = false;
        $err.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
  });

  pintarCargo();
  pintarItems();
}

function listo(ctx, t) {
  const wa = waTicket(t);
  pintar(ctx.el, html`
    <div class="vista" style="justify-items:center">
      <div class="listo">
        <span class="listo__icono">${icono('check')}</span>
        <h1>Ticket ${t.numero_txt}</h1>
        <div class="listo__resumen">
          <p><strong class="monto" style="font-size:1.6rem">${pesos(t.total)}</strong></p>
          <p>${t.matricula ? html`<strong class="matricula">${t.matricula}</strong>${t.piloto ? `, piloto ${t.piloto}` : ''}, ` : ''}${t.items.map(i => i.detalle ? `${i.concepto}: ${i.detalle}` : i.cantidad === 100 ? i.concepto : `${i.concepto} ${i.cantidad_txt}`).join(', ')}</p>
          <p class="muted">${t.pago_movimiento_id ? `Pagado en el acto (${MEDIOS[t.pago_medio]}).`
            : t.cobrado_en_acto ? `Cobrado en el acto (${MEDIOS[t.pago_medio]}). Tesorería lo confirma en Pagos informados.`
            : `A cuenta de ${nombreCompleto(t)}: entra en su cupón del mes.`}</p>
        </div>
        <div class="listo__acciones">
          ${wa ? html`<a class="btn btn--wa" href="${wa}" target="_blank" rel="noopener">${icono('wa')} Mandar por WhatsApp</a>` : ''}
          <a class="btn btn--sec" href="${urlTicketPdf(ctx, t)}" target="_blank" rel="noopener">${icono('pdf')} Ver PDF</a>
          <a class="btn btn--principal" href="${ctx.usuario.rol === 'rampa' ? '#/rampa' : '#/admin/tickets/nuevo'}" data-otro>${icono('mas')} Otro ticket</a>
        </div>
        ${!wa && !t.transitos && t.estado !== 'anulado' ? html`<p class="muted chico">${nombreCompleto(t)} no tiene celular cargado: mandale el PDF por otro medio.</p>` : ''}
      </div>
    </div>`);
  ctx.el.querySelector('[data-otro]').addEventListener('click', (e) => {
    if (location.hash === e.currentTarget.getAttribute('href')) { e.preventDefault(); ctx.recargar(); }
  });
  window.scrollTo({ top: 0 });
}

// ── Listados ────────────────────────────────────────────────────────────────
export async function misTickets(ctx) {
  const periodo = ctx.query.periodo || periodoHoy();
  const { tickets } = await get(`/api/rampa/tickets?periodo=${periodo}`);
  const vigentes = tickets.filter(t => t.estado !== 'anulado');
  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab">
      <div><h1>Tickets</h1><p>Los que cargaste vos.</p></div>
      <div class="vista__acciones">${selectorMes(periodo)}<a class="btn btn--principal" href="#/rampa">${icono('mas')} Nuevo ticket</a></div>
    </div>
    <div class="cifras">
      <div class="cifra"><span>Tickets</span><strong>${vigentes.length}</strong></div>
      <div class="cifra"><span>Total</span><strong>${pesos(vigentes.reduce((s, t) => s + t.total, 0))}</strong><small>${pesos(vigentes.filter(t => t.cobrado_en_acto).reduce((s, t) => s + t.total, 0))} cobrado en el acto</small></div>
    </div>
    <section class="panel">${tablaTickets(ctx, tickets)}</section>
  </div>`);
  ctx.el.addEventListener('click', (e) => {
    const mes = e.target.closest('[data-mes]');
    if (mes) ctx.ir(`#/rampa/tickets?periodo=${mes.dataset.mes}`);
  });
}

export async function ticketsAdmin(ctx) {
  const periodo = ctx.query.periodo || periodoHoy();
  const origen = ctx.query.origen || '';
  const { tickets } = await get(`/api/admin/tickets?periodo=${periodo}${origen ? `&origen=${origen}` : ''}`);
  const vigentes = tickets.filter(t => t.estado !== 'anulado');
  const total = vigentes.reduce((s, t) => s + t.total, 0);
  const enElActo = vigentes.filter(t => t.cobrado_en_acto).reduce((s, t) => s + t.total, 0);
  const aConfirmar = vigentes.filter(t => t.cobrado_en_acto && !t.pago_movimiento_id).reduce((s, t) => s + t.total, 0);
  const sel = (v) => (v === origen ? raw('selected') : '');

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab">
      <div><h1>Tickets de servicios</h1><p>Hangaraje, combustible y demás servicios de rampa, otros conceptos cargados por tesorería y los derechos de aeronave del cierre.</p></div>
      <div class="vista__acciones">
        <a class="btn btn--sec" href="#/admin/aeronaves">${icono('avion')} Aeronaves</a>
        <a class="btn btn--sec" href="/api/admin/reportes?periodo=${periodo}&formato=csv&de=servicios">${icono('descargar')} Excel (CSV)</a>
        <a class="btn btn--principal" href="#/admin/tickets/nuevo" data-escritura>${icono('mas')} Nuevo ticket</a>
      </div>
    </div>
    <form class="filtros" id="filtros">
      ${selectorMes(periodo)}
      <select class="select" name="origen" aria-label="Origen">
        <option value="">Todos los orígenes</option>
        <option value="rampa" ${sel('rampa')}>Rampa</option>
        <option value="tesoreria" ${sel('tesoreria')}>Tesorería</option>
        <option value="cierre" ${sel('cierre')}>Derecho de aeronave (cierre)</option>
      </select>
    </form>
    <div class="cifras">
      <div class="cifra"><span>Servicios facturados</span><strong>${pesos(total)}</strong><small>${vigentes.length} ${vigentes.length === 1 ? 'ticket' : 'tickets'}</small></div>
      <div class="cifra"><span>Cobrado en el acto</span><strong>${pesos(enElActo)}</strong>${aConfirmar ? html`<small><a href="#/admin/pagos">${pesos(aConfirmar)} de rampa a confirmar</a></small>` : ''}</div>
      <div class="cifra"><span>A cuenta</span><strong>${pesos(total - enElActo)}</strong><small>Entra en los cupones</small></div>
    </div>
    <section class="panel">${tablaTickets(ctx, tickets, { anular: true })}</section>
  </div>`);

  const form = ctx.el.querySelector('#filtros');
  form.addEventListener('change', () => ctx.ir(`#/admin/tickets?periodo=${periodo}${form.origen.value ? `&origen=${form.origen.value}` : ''}`));
  ctx.el.addEventListener('click', async (e) => {
    const mes = e.target.closest('[data-mes]');
    if (mes) return ctx.ir(`#/admin/tickets?periodo=${mes.dataset.mes}${origen ? `&origen=${origen}` : ''}`);
    const an = e.target.closest('[data-anular-ticket]');
    if (an) {
      const t = tickets.find(x => x.id === Number(an.dataset.anularTicket));
      const datos = await pedirAnulacion(t);
      if (!datos) return;
      try { await post(`/api/admin/tickets/${t.id}/anular`, datos); toast('Ticket anulado', 'ok'); ctx.recargar(); } catch (err) { error(err); }
    }
  });
}

// Pide el motivo. Si el ticket se cobró en el acto, el pago se anula con él; a un socio se le
// puede dejar como saldo a favor (a externos y tránsitos no).
function pedirAnulacion(t) {
  const pagado = !!t.pago_movimiento_id;
  const socio = t.usuario_rol !== 'externo' && !t.transitos;
  const texto = t.cobrado_en_acto && !pagado
    ? `Se anula el cargo de ${pesos(t.total)}. Rampa lo había cobrado y tesorería todavía no lo confirmó: ese cobro se descarta de Pagos informados.`
    : !pagado ? `Se descuentan ${pesos(t.total)} de la cuenta de ${nombreCompleto(t)}.`
    : `Se anulan el cargo de ${pesos(t.total)} y también el pago en el acto, que deja de contar como cobrado${socio ? ', salvo que marques que la plata queda a favor del socio' : ''}. Si hay que rehacerlo, cargá el ticket correcto como cobrado.`;
  return new Promise((ok) => {
    const m = modal({
      titulo: `Anular ticket ${t.numero_txt}`, alCerrar: (v) => ok(v ?? null),
      contenido: html`<form class="form" novalidate>
        <p>${texto}</p>
        <div class="campo"><label for="an-motivo">Motivo</label><textarea id="an-motivo" name="motivo" class="textarea" required placeholder="Ej.: se cargó a la aeronave equivocada" maxlength="200"></textarea></div>
        ${pagado && socio ? html`<label class="check"><input type="checkbox" name="mantener_pago"><span>La plata no se devolvió: queda a favor del socio<br><small class="muted">El pago sigue en su cuenta y se descuenta de lo próximo que deba.</small></span></label>` : ''}
        <div class="modal__acciones">
          <button class="btn btn--sec" data-cerrar type="button">Cancelar</button>
          <button class="btn btn--peligro" type="submit">Anular ticket</button>
        </div></form>`
    });
    const form = m.el.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = datosForm(form);
      const motivo = d.motivo.trim();
      if (!motivo) { form.motivo.setAttribute('aria-invalid', 'true'); return; }
      m.cerrar({ motivo, mantener_pago: !!d.mantener_pago });
    });
  });
}

// ── Registro de aeronaves ───────────────────────────────────────────────────
export async function aeronaves(ctx) {
  const esRampa = ctx.usuario.rol === 'rampa';
  const puedeEditar = esRampa || ctx.esAdmin;
  const [{ aeronaves: lista }, cuentas] = await Promise.all([
    get(esRampa ? '/api/rampa/aeronaves' : '/api/admin/aeronaves'),
    puedeEditar ? get('/api/rampa/datos').then(d => d.cuentas) : Promise.resolve([])
  ]);
  const urlTicket = (a) => (esRampa ? `#/rampa?aeronave=${a.id}` : `#/admin/tickets/nuevo?aeronave=${a.id}`);

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab">
      <div>${esRampa ? '' : html`<a class="volver" href="#/admin/tickets">${icono('izq')} Tickets</a>`}<h1>Aeronaves</h1><p>Aeronaves de socios y de afuera que usan los servicios del club. ${lista.length} registradas.</p></div>
      ${puedeEditar ? html`<div class="vista__acciones"><button class="btn btn--principal" type="button" data-nueva data-escritura>${icono('mas')} Registrar aeronave</button></div>` : ''}
    </div>
    <section class="panel">
      <div class="panel__cab"><div class="buscador" style="flex:1">${icono('buscar')}<input class="input" type="search" id="buscar" placeholder="Buscar matrícula o propietario" aria-label="Buscar"></div></div>
      ${lista.length ? html`<div class="tabla-caja"><table class="tabla tabla--tarjetas">
        <thead><tr><th>Aeronave</th><th>Propietario</th><th class="num">Tickets</th><th>Último</th><th></th></tr></thead>
        <tbody>${lista.map(a => html`<tr data-texto="${`${a.matricula} ${a.modelo || ''} ${a.prop_nombre} ${a.prop_apellido}`.toLowerCase()}">
          <td class="celda-ppal"><span class="matricula">${a.matricula}</span><div class="muted chico">${[a.modelo, a.notas].filter(Boolean).join(' · ')}</div></td>
          <td data-label="Propietario">${a.transitos ? html`<span class="chip chip--neutro">Tránsito</span>` : html`${ctx.esStaff ? html`<a href="#/admin/cuentas/${a.propietario_id}">${nombreCompleto({ nombre: a.prop_nombre, apellido: a.prop_apellido })}</a>` : nombreCompleto({ nombre: a.prop_nombre, apellido: a.prop_apellido })}
            <div class="muted chico">${a.prop_rol === 'externo' ? 'Externo' : 'Socio'}${a.prop_telefono ? ` · ${a.prop_telefono}` : ''}</div>`}</td>
          <td class="num" data-label="Tickets">${a.tickets}</td>
          <td data-label="Último">${a.ultimo_ticket ? fecha(a.ultimo_ticket) : html`<span class="muted">—</span>`}</td>
          <td class="celda-acciones"><div class="tabla__acciones">
            ${puedeEditar ? html`<a class="btn btn--sec btn--chico" href="${urlTicket(a)}" data-escritura>${icono('ticket')} Ticket</a>
            <button class="btn btn--fantasma btn--chico" type="button" data-editar="${a.id}" data-escritura>${icono('editar')} Editar</button>` : ''}
          </div></td></tr>`)}</tbody></table></div>`
      : vacio('Todavía no hay aeronaves registradas. Se registran desde el ticket, con "Registrar otra matrícula".')}
    </section>
  </div>`);

  const filas = [...ctx.el.querySelectorAll('tbody tr')];
  ctx.el.querySelector('#buscar').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    filas.forEach(f => { f.hidden = q && !f.dataset.texto.includes(q); });
  });
  ctx.el.addEventListener('click', (e) => {
    if (e.target.closest('[data-nueva]')) return modalAeronave({ cuentas }, ctx.recargar);
    const ed = e.target.closest('[data-editar]');
    if (ed) modalAeronave({ aeronave: lista.find(a => a.id === Number(ed.dataset.editar)), cuentas }, ctx.recargar);
  });
}

