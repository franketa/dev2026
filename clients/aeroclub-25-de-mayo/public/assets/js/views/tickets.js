// Tickets de servicios (hangaraje, combustible, etc.) y registro de aeronaves de terceros.
// Rampa arma tickets con los servicios de la tabla; tesorería además agrega otros conceptos.
import {
  get, post, put, html, raw, pintar, icono, pesos, fecha, hoyAR, periodoHoy, selectorMes, modal, pedirTexto, toast, error,
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

const base = (ctx) => (ctx.usuario.rol === 'rampa' ? '#/rampa' : '#/admin');
const urlTicketPdf = (ctx, t) => (ctx.usuario.rol === 'rampa' ? `/api/rampa/tickets/${t.id}/pdf` : `/api/admin/tickets/${t.id}/pdf`);

function waTicket(t) {
  const estado = t.estado === 'anulado' ? 'Quedó anulado.' : t.pago_movimiento_id ? 'Ya está pagado.' : 'Se suma a tu cuenta del club.';
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
      <td class="celda-ppal"><strong>${t.numero_txt}</strong> ${t.matricula ? html`<span class="matricula">${t.matricula}</span>` : ''}<div class="muted chico">${fecha(t.fecha)}${t.origen === 'cierre' ? ', cierre del mes' : t.creado_por_nombre ? `, ${t.creado_por_nombre}` : ''}</div></td>
      <td data-label="A cargo de">${nombreLista(t)}${t.usuario_rol === 'externo' ? html` <span class="chip chip--neutro">Externo</span>` : ''}</td>
      <td data-label="Detalle" class="chico">${t.resumen}${t.motivo_anulacion ? html`<div class="muted">Anulado: ${t.motivo_anulacion}</div>` : ''}</td>
      <td class="num monto" data-label="Total">${pesos(t.total)}</td>
      <td data-label="Cobro">${chipTicket(t)}</td>
      <td class="celda-acciones"><div class="tabla__acciones">${accionesTicket(ctx, t, { anular })}</div></td>
    </tr>`)}</tbody></table></div>`;
}

// ── Alta / edición de aeronave (con propietario socio o externo nuevo) ────────
export function modalAeronave({ aeronave = null, cuentas, matricula = '' }, alGuardar) {
  const a = aeronave || {};
  const m = modal({
    titulo: aeronave ? `Editar ${a.matricula}` : 'Registrar aeronave',
    subtitulo: 'Aeronaves que no son de la flota del club. Los tickets van a la cuenta del propietario.',
    contenido: html`<form class="form" novalidate>
      <div class="fila-campos">
        <div class="campo"><label for="ae-mat">Matrícula</label><input class="input" id="ae-mat" name="matricula" value="${a.matricula || matricula}" placeholder="LV-ABC" autocapitalize="characters" required autofocus></div>
        <div class="campo"><label for="ae-mod">Modelo <span class="muted">(opcional)</span></label><input class="input" id="ae-mod" name="modelo" value="${a.modelo || ''}" placeholder="Piper PA-18"></div>
      </div>
      <fieldset class="campo" style="border:0;padding:0;margin:0"><legend class="sr">Propietario</legend>
        <div class="segmentado">
          <label><input type="radio" name="quien" value="existente" ${aeronave ? raw('checked') : ''}><span>Ya está cargado<small>Socio o externo</small></span></label>
          <label><input type="radio" name="quien" value="nuevo" ${aeronave ? '' : raw('checked')}><span>Propietario nuevo<small>De afuera del club</small></span></label>
        </div>
      </fieldset>
      <div class="campo" data-bloque="existente" hidden><label for="ae-prop">Propietario</label>
        <select class="select" id="ae-prop" name="propietario_id"><option value="">Elegí</option>
          ${cuentas.map(c => html`<option value="${c.id}" ${c.id === a.propietario_id ? raw('selected') : ''}>${nombreLista(c)} (${rolTexto(c).toLowerCase()})</option>`)}
        </select></div>
      <div class="pila" data-bloque="nuevo" style="gap:14px">
        <div class="fila-campos">
          <div class="campo"><label for="ex-nom">Nombre o razón social</label><input class="input" id="ex-nom" name="ex_nombre" placeholder="Juan / Agroaérea del Sur SA"></div>
          <div class="campo"><label for="ex-ape">Apellido <span class="muted">(si es persona)</span></label><input class="input" id="ex-ape" name="ex_apellido"></div>
        </div>
        <div class="fila-campos">
          <div class="campo"><label for="ex-tel">Celular (WhatsApp)</label><input class="input" id="ex-tel" name="ex_telefono" inputmode="tel" placeholder="2345 401234"></div>
          <div class="campo"><label for="ex-dni">DNI o CUIT</label><input class="input" id="ex-dni" name="ex_dni" inputmode="numeric"></div>
        </div>
        <div class="campo"><label for="ex-mail">Email <span class="muted">(opcional)</span></label><input class="input" id="ex-mail" name="ex_email" type="email"></div>
        <p class="campo__ayuda">Queda como externo: tiene cuenta corriente en el club pero no entra al sistema.</p>
      </div>
      <div class="campo"><label for="ae-notas">Notas <span class="muted">(opcional)</span></label><input class="input" id="ae-notas" name="notas" value="${a.notas || ''}" maxlength="300" placeholder="Ej.: hangar 2, del fondo"></div>
      <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">${aeronave ? 'Guardar' : 'Registrar'}</button></div>
    </form>`
  });
  const form = m.el.querySelector('form');
  const bloques = () => {
    const quien = form.quien.value;
    form.querySelectorAll('[data-bloque]').forEach(b => { b.hidden = b.dataset.bloque !== quien; });
  };
  form.addEventListener('change', (e) => { if (e.target.name === 'quien') bloques(); });
  bloques();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = datosForm(form);
    const cuerpo = { matricula: d.matricula, modelo: d.modelo, notas: d.notas };
    if (d.quien === 'nuevo') cuerpo.externo = { nombre: d.ex_nombre, apellido: d.ex_apellido, telefono: d.ex_telefono, dni: d.ex_dni, email: d.ex_email };
    else cuerpo.propietario_id = Number(d.propietario_id);
    conBoton(form.querySelector('[type=submit]'), async () => {
      try {
        const r = aeronave ? await put(`/api/rampa/aeronaves/${a.id}`, cuerpo) : await post('/api/rampa/aeronaves', cuerpo);
        toast(aeronave ? 'Aeronave actualizada' : `${r.aeronave.matricula} registrada`, 'ok');
        m.cerrar();
        alGuardar?.(r.aeronave);
      } catch (err) { error(err); }
    });
  });
}

// ── Nuevo ticket ────────────────────────────────────────────────────────────
export async function nuevoTicket(ctx) {
  const datos = await get('/api/rampa/datos');
  const admin = ctx.esAdmin;
  const estado = {
    aeronaveId: Number(ctx.query.aeronave) || null,
    usuarioId: Number(ctx.query.usuario) || null,
    items: [],
    cobrado: false
  };
  let sig = 1;
  const aeronave = () => datos.aeronaves.find(a => a.id === estado.aeronaveId) || null;
  const servicio = (id) => datos.servicios.find(s => s.id === Number(id));
  if (estado.aeronaveId && !estado.usuarioId) estado.usuarioId = aeronave()?.propietario_id ?? null;

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab"><div>
      ${admin ? html`<a class="volver" href="${estado.usuarioId && ctx.query.usuario ? `#/admin/cuentas/${estado.usuarioId}` : '#/admin/tickets'}">${icono('izq')} Volver</a>` : ''}
      <h1>Nuevo ticket</h1>
      <p>${admin ? 'Servicios u otros conceptos a la cuenta de un socio o externo. Entra en su cupón del mes.' : 'Servicios a una aeronave. Va a la cuenta del propietario o se cobra en el momento.'}</p>
    </div></div>
    <form class="carga" id="form-ticket" novalidate>
      <div class="carga__paso">
        <h2><span class="num">1</span> Aeronave${admin ? html` <span class="muted chico" style="font-weight:500">(opcional)</span>` : ''}</h2>
        <div class="buscador">${icono('buscar')}<input class="input" id="buscar-ae" type="search" placeholder="Buscar matrícula" autocomplete="off" autocapitalize="characters" aria-label="Buscar matrícula"></div>
        <div id="aeronaves" class="opciones-ae"></div>
      </div>
      <div class="carga__paso">
        <h2><span class="num">2</span> <label for="a-cargo">A cargo de</label></h2>
        <select class="select" id="a-cargo" name="usuario_id">
          <option value="">Elegí la cuenta</option>
          ${datos.cuentas.map(c => html`<option value="${c.id}">${nombreLista(c)}${c.rol === 'externo' ? ' (externo)' : ''}</option>`)}
        </select>
        <p class="campo__ayuda" id="ayuda-cargo"></p>
      </div>
      <div class="carga__paso">
        <h2><span class="num">3</span> Servicios</h2>
        <div class="chips-servicio" role="group" aria-label="Agregar servicio">
          ${datos.servicios.map(s => html`<button type="button" class="btn btn--sec btn--chico" data-agregar="${s.id}" ${s.precio ? '' : raw('title="Sin precio cargado"')}>${icono('mas')} ${s.nombre}</button>`)}
          ${admin ? html`<button type="button" class="btn btn--fantasma btn--chico" data-agregar="otro">${icono('mas')} Otro concepto</button>` : ''}
        </div>
        <div id="items" class="items"></div>
      </div>
      <div class="carga__paso">
        <h2><span class="num">4</span> Cobro</h2>
        <div class="segmentado" id="cobro">
          <label><input type="radio" name="cobro" value="cuenta" checked><span>A cuenta<small>Entra en el cupón del mes</small></span></label>
          <label><input type="radio" name="cobro" value="ahora"><span>Pagó ahora<small>Queda registrado el pago</small></span></label>
        </div>
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
  const $aes = ctx.el.querySelector('#aeronaves');
  const $buscar = ctx.el.querySelector('#buscar-ae');
  const $cargo = form.usuario_id;
  const $items = ctx.el.querySelector('#items');
  const $total = ctx.el.querySelector('#total-ticket');
  const $err = ctx.el.querySelector('#error-ticket');

  function pintarAeronaves() {
    const q = $buscar.value.trim().toUpperCase().replace(/\s/g, '');
    const sel = aeronave();
    const lista = datos.aeronaves.filter(a => !q || a.matricula.replace('-', '').includes(q.replace('-', ''))).slice(0, q ? 12 : 6);
    if (sel && !lista.includes(sel)) lista.unshift(sel);
    pintar($aes, html`
      ${lista.map(a => html`<button type="button" class="opcion-ae" data-ae="${a.id}" aria-pressed="${a.id === estado.aeronaveId}">
        <span class="matricula">${a.matricula}</span><small>${a.modelo || ''}</small><small>${nombreCompleto({ nombre: a.prop_nombre, apellido: a.prop_apellido })}</small></button>`)}
      ${q && !lista.length ? html`<p class="muted chico">No hay ninguna aeronave con esa matrícula.</p>` : ''}
      <button type="button" class="btn btn--sec btn--chico" data-nueva-ae>${icono('mas')} Registrar ${q && !datos.aeronaves.some(a => a.matricula.replace('-', '') === q.replace('-', '')) ? q : 'aeronave nueva'}</button>
      ${admin && estado.aeronaveId ? html`<button type="button" class="btn btn--fantasma btn--chico" data-sin-ae>Sin aeronave</button>` : ''}`);
  }

  function pintarCargo() {
    $cargo.value = estado.usuarioId ? String(estado.usuarioId) : '';
    const a = aeronave();
    const ayuda = ctx.el.querySelector('#ayuda-cargo');
    ayuda.textContent = a
      ? (a.propietario_id === estado.usuarioId ? `Propietario de ${a.matricula}. Si lo paga otra persona (por ejemplo, el piloto), cambialo.` : `Ojo: el propietario de ${a.matricula} es ${nombreCompleto({ nombre: a.prop_nombre, apellido: a.prop_apellido })}.`)
      : '';
  }

  function filaItem(it) {
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

  ctx.el.addEventListener('click', (e) => {
    const ae = e.target.closest('[data-ae]');
    if (ae) {
      estado.aeronaveId = Number(ae.dataset.ae);
      estado.usuarioId = aeronave().propietario_id;
      pintarAeronaves(); pintarCargo();
      return;
    }
    if (e.target.closest('[data-sin-ae]')) { estado.aeronaveId = null; pintarAeronaves(); pintarCargo(); return; }
    if (e.target.closest('[data-nueva-ae]')) {
      const q = $buscar.value.trim().toUpperCase();
      return modalAeronave({ cuentas: datos.cuentas, matricula: q }, async (nueva) => {
        const frescos = await get('/api/rampa/datos').catch(() => null);
        if (frescos) Object.assign(datos, frescos);
        estado.aeronaveId = nueva.id;
        estado.usuarioId = nueva.propietario_id;
        $buscar.value = '';
        // El propietario nuevo tiene que aparecer en la lista de cuentas.
        pintar($cargo, html`<option value="">Elegí la cuenta</option>${datos.cuentas.map(c => html`<option value="${c.id}">${nombreLista(c)}${c.rol === 'externo' ? ' (externo)' : ''}</option>`)}`);
        pintarAeronaves(); pintarCargo();
      });
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

  $buscar.addEventListener('input', pintarAeronaves);
  form.addEventListener('change', (e) => {
    if (e.target === $cargo) { estado.usuarioId = Number($cargo.value) || null; pintarCargo(); }
    if (e.target.name === 'cobro') { estado.cobrado = e.target.value === 'ahora'; ctx.el.querySelector('#campo-medio').hidden = !estado.cobrado; }
    calcular();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    $err.hidden = true;
    const d = datosForm(form);
    const falta = !admin && !estado.aeronaveId ? 'Elegí o registrá la aeronave.'
      : !estado.usuarioId ? 'Elegí a nombre de quién va el ticket.'
      : !estado.items.length ? 'Agregá al menos un servicio.'
      : estado.items.some(it => !parseCantidad(it.cantidad)) ? 'Revisá las cantidades: números con hasta dos decimales (ej.: 40,5).'
      : estado.items.some(it => !it.servicio_id && !String(it.concepto || '').trim()) ? 'Escribí el concepto.'
      : estado.items.some(it => !it.precio) ? 'Falta el precio de algún ítem.'
      : null;
    if (falta) { $err.textContent = falta; $err.hidden = false; $err.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    const cuerpo = {
      aeronave_id: estado.aeronaveId, usuario_id: estado.usuarioId, fecha: d.fecha, notas: d.notas,
      cobrado: estado.cobrado, medio: estado.cobrado ? d.medio : null,
      items: estado.items.map(it => ({ servicio_id: it.servicio_id, concepto: it.concepto, cantidad: it.cantidad, precio: admin ? pesosInput(it.precio) : undefined }))
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

  pintarAeronaves();
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
          <p>${t.matricula ? html`<strong class="matricula">${t.matricula}</strong>, ` : ''}${t.items.map(i => i.cantidad === 100 ? i.concepto : `${i.concepto} ${i.cantidad_txt}`).join(', ')}</p>
          <p class="muted">${t.pago_movimiento_id ? `Pagado en el acto (${MEDIOS[t.pago_medio]}).` : `A cuenta de ${nombreCompleto(t)}: entra en su cupón del mes.`}</p>
        </div>
        <div class="listo__acciones">
          ${wa ? html`<a class="btn btn--wa" href="${wa}" target="_blank" rel="noopener">${icono('wa')} Mandar por WhatsApp</a>` : ''}
          <a class="btn btn--sec" href="${urlTicketPdf(ctx, t)}" target="_blank" rel="noopener">${icono('pdf')} Ver PDF</a>
          <a class="btn btn--principal" href="${ctx.usuario.rol === 'rampa' ? '#/rampa' : '#/admin/tickets/nuevo'}" data-otro>${icono('mas')} Otro ticket</a>
        </div>
        ${!wa && t.estado !== 'anulado' ? html`<p class="muted chico">${nombreCompleto(t)} no tiene celular cargado: mandale el PDF por otro medio.</p>` : ''}
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
      <div class="cifra"><span>Total</span><strong>${pesos(vigentes.reduce((s, t) => s + t.total, 0))}</strong><small>${pesos(vigentes.filter(t => t.pago_movimiento_id).reduce((s, t) => s + t.total, 0))} cobrado en el acto</small></div>
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
  const enElActo = vigentes.filter(t => t.pago_movimiento_id).reduce((s, t) => s + t.total, 0);
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
      <div class="cifra"><span>Cobrado en el acto</span><strong>${pesos(enElActo)}</strong></div>
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
      const motivo = await pedirTexto({
        titulo: `Anular ticket ${t.numero_txt}`,
        texto: `Se descuentan ${pesos(t.total)} de la cuenta de ${nombreCompleto(t)}.${t.pago_movimiento_id ? ' El pago en el acto queda como saldo a favor: si se devolvió la plata, anulá también el pago desde su cuenta.' : ''}`,
        label: 'Motivo', placeholder: 'Ej.: se cargó a la aeronave equivocada', boton: 'Anular ticket', peligro: true
      });
      if (!motivo) return;
      try { await post(`/api/admin/tickets/${t.id}/anular`, { motivo }); toast('Ticket anulado', 'ok'); ctx.recargar(); } catch (err) { error(err); }
    }
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
          <td class="celda-ppal"><span class="matricula">${a.matricula}</span><div class="muted chico">${a.modelo || ''}${a.notas ? ` · ${a.notas}` : ''}</div></td>
          <td data-label="Propietario">${ctx.esStaff ? html`<a href="#/admin/cuentas/${a.propietario_id}">${nombreCompleto({ nombre: a.prop_nombre, apellido: a.prop_apellido })}</a>` : nombreCompleto({ nombre: a.prop_nombre, apellido: a.prop_apellido })}
            <div class="muted chico">${a.prop_rol === 'externo' ? 'Externo' : 'Socio'}${a.prop_telefono ? ` · ${a.prop_telefono}` : ''}</div></td>
          <td class="num" data-label="Tickets">${a.tickets}</td>
          <td data-label="Último">${a.ultimo_ticket ? fecha(a.ultimo_ticket) : html`<span class="muted">—</span>`}</td>
          <td class="celda-acciones"><div class="tabla__acciones">
            ${puedeEditar ? html`<a class="btn btn--sec btn--chico" href="${urlTicket(a)}" data-escritura>${icono('ticket')} Ticket</a>
            <button class="btn btn--fantasma btn--chico" type="button" data-editar="${a.id}" data-escritura>${icono('editar')} Editar</button>` : ''}
          </div></td></tr>`)}</tbody></table></div>`
      : vacio('Todavía no hay aeronaves registradas. Se registran al hacer el primer ticket.')}
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

