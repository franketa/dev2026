// Rendición mensual: la sede la cierra, la firma y la envía; la Central la recibe en su bandeja.

import {
  get, post, html, pintar, icono, pesos, fecha, fechaHora, error, toast, modal, conBoton, pedirTexto, selectorMes, periodoHoy, sumarMeses,
  nombrePeriodo, capital, chipRendicion, chip, vacio, qs, sel, cat, fmtCuit
} from '../lib.js';

const TIPO = { fijo: 'Fijo', caja_chica: 'Caja chica', con_solicitud: 'Con solicitud' };

function resumen(c, extra = {}) {
  const r = c.resumen; const n = r.cantidades;
  return html`
    <div class="cifras">
      <div class="cifra"><span>Saldo al empezar</span><strong>${pesos(r.saldo_inicial.total)}</strong></div>
      <div class="cifra"><span>Fondo recibido</span><strong>${pesos(r.fondo_recibido)}</strong><small>${r.fondo_extra ? `incluye ${pesos(r.fondo_extra)} extra` : 'fondo rotatorio del mes'}</small></div>
      <div class="cifra"><span>Total gastado</span><strong>${pesos(r.total_gastos)}</strong><small>${r.pagado_central ? `${pesos(r.pagado_central)} pagó la Central` : 'todo con el fondo de la sede'}</small></div>
      <div class="cifra"><span>Saldo en el banco</span><strong>${pesos(r.saldo_final.banco)}</strong></div>
      <div class="cifra"><span>Saldo en efectivo</span><strong>${pesos(r.saldo_final.efectivo)}</strong></div>
    </div>
    <div class="cifras">
      <div class="cifra"><span>Gastos</span><strong>${n.gastos}</strong><small>${n.fijos} fijos · ${n.caja_chica} caja chica · ${n.con_solicitud} con solicitud</small></div>
      <div class="cifra ${n.sin_cae ? 'cifra--alerta' : ''}"><span>Sin CAE</span><strong>${n.sin_cae}</strong></div>
      <div class="cifra ${n.nd ? 'cifra--alerta' : ''}"><span>N/D (sin descripción)</span><strong>${n.nd}</strong><small>${String(r.nd_pct).replace('.', ',')} % de lo gastado</small></div>
      ${extra.adjuntos != null ? html`<div class="cifra ${extra.adjuntos ? 'cifra--alerta' : ''}"><span>Con foto pendiente</span><strong>${extra.adjuntos}</strong></div>` : ''}
    </div>`;
}

function tablaRubros(c) {
  return html`<div class="tabla-caja"><table class="tabla"><thead><tr><th>Rubro</th><th class="num">Importe</th></tr></thead><tbody>
    ${c.por_rubro.map(r => html`<tr class="tabla__grupo"><td>${r.nombre}</td><td class="num">${pesos(r.subtotal, { decimales: true })}</td></tr>
      ${r.subrubros.map(s => html`<tr><td style="padding-left:28px">${s.nombre}</td><td class="num">${pesos(s.subtotal, { decimales: true })}</td></tr>`)}`)}
    </tbody><tfoot><tr><td>Total</td><td class="num">${pesos(c.resumen.total_gastos, { decimales: true })}</td></tr></tfoot></table></div>`;
}

function tablaDetalle(titulo, rubros, total) {
  if (!rubros.length) return '';
  return html`<section class="pila"><h3>${titulo} · ${pesos(total)}</h3><div class="tabla-caja"><table class="tabla">
    <thead><tr><th>Fecha</th><th>Proveedor</th><th>Comprobante</th><th>CAE</th><th>Medio</th><th>Tipo</th><th class="num">Importe</th></tr></thead><tbody>
    ${rubros.map(r => html`<tr class="tabla__grupo"><td colspan="6">${r.nombre}</td><td class="num">${pesos(r.subtotal)}</td></tr>
      ${r.subrubros.map(s => html`${s.nombre ? html`<tr class="tabla__sub"><td colspan="6">${s.nombre}</td><td class="num">${pesos(s.subtotal)}</td></tr>` : ''}
        ${s.gastos.map(g => html`<tr><td>${fecha(g.fecha)}</td><td><a href="#/gastos/${g.id}">${g.proveedor}</a><br><small class="muted">${fmtCuit(g.cuit)}</small></td><td>${g.comprobante}</td>
          <td>${g.cae ? html`<span class="mono">${g.cae}</span>` : chip('pend', 'sin CAE')}</td><td>${g.medio === 'efectivo' ? 'Efectivo' : 'Transf.'}</td>
          <td>${TIPO[g.tipo_gasto]}${g.solicitud_id ? html` <a href="#/solicitudes/${g.solicitud_id}">#${g.solicitud_id}</a>` : ''}</td><td class="num">${pesos(g.bruto, { decimales: true })}</td></tr>`)}`)}`)}
    </tbody></table></div></section>`;
}

function versiones(lista, base) {
  if (!lista.length) return '';
  return html`<section class="panel"><div class="panel__cab"><h3>${icono('reloj')} Versiones</h3></div><ul class="historial">
    ${lista.map(v => html`<li><strong>Versión ${v.version}</strong> · firmó ${v.firmado_por_nombre} el ${fechaHora(v.firmado_en)}
      ${v.enviado_en ? html`<br>Enviada el ${fechaHora(v.enviado_en)}` : ''}
      ${v.reabierto_en ? html`<br><span style="color:var(--rojo)">Reabierta por ${v.reabierto_por_nombre} el ${fechaHora(v.reabierto_en)}: ${v.motivo_reapertura}</span>` : ''}
      <small class="mono">${v.hash}</small>
      <span class="fila" style="margin-top:4px"><a class="btn btn--sec btn--chico" href="${base}/pdf?version=${v.version}" target="_blank" rel="noopener">${icono('pdf')} PDF</a><a class="btn btn--sec btn--chico" href="${base}/xlsx?version=${v.version}">${icono('excel')} Excel</a></span></li>`)}
  </ul></section>`;
}

// ── Sede ────────────────────────────────────────────────────────────────────
export async function rendicion(ctx) {
  const sedeId = ctx.usuario.sede_id;
  let periodo = ctx.params.periodo;
  if (!periodo) {
    // Por defecto, el mes anterior si todavía no se envió; si no, el actual.
    const ant = sumarMeses(periodoHoy(), -1);
    const e = await get(`/api/rendiciones/${sedeId}/${ant}`);
    periodo = ['abierta', 'cerrada_firmada'].includes(e.estado) && (e.contenido.resumen.cantidades.gastos || e.contenido.resumen.fondo_recibido) ? ant : periodoHoy();
  }
  const e = await get(`/api/rendiciones/${sedeId}/${periodo}`);
  const c = e.contenido;
  const base = `/api/rendiciones/${sedeId}/${periodo}`;
  const jefe = ctx.puede('rendicion.cerrar');
  const v = e.versiones[0];
  // Después de cerrar o enviar se queda en el mismo mes.
  const quedarse = () => (location.hash === `#/rendicion/${periodo}` ? ctx.recargar() : ctx.ir(`#/rendicion/${periodo}`));

  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>Rendición de ${nombrePeriodo(periodo)}</h1><p>${e.sede.nombre} · ${chipRendicion(e.estado)}${e.version ? ` · versión ${e.version}` : ''}</p></div>
      <div class="vista__acciones">${selectorMes(periodo)}</div></div>

    ${e.estado === 'abierta' ? html`<div class="aviso aviso--info">${icono('info')}<span>${e.puede_cerrarse_ya
      ? (jefe ? 'Revisá el resumen. Cuando esté todo, cerrá y firmá: el mes queda bloqueado y se arma el listado por rubro para enviar a la Central.' : 'El jefe de sede es quien cierra, firma y envía la rendición.')
      : `El mes todavía no terminó: la rendición se cierra desde el último día de ${nombrePeriodo(periodo)}.`}</span></div>` : ''}
    ${e.estado === 'cerrada_firmada' ? html`<div class="aviso">${icono('firma')}<span>Firmada el ${fechaHora(v.firmado_en)} por ${v.firmado_por_nombre}. <b>Falta enviarla a la Sede Central.</b> El mes ya está bloqueado.</span></div>` : ''}
    ${e.estado === 'enviada' ? html`<div class="aviso aviso--ok">${icono('enviada')}<span>Enviada a la Sede Central el ${fechaHora(v.enviado_en)}. Los papeles físicos se mandan igual: imprimí el PDF y firmalo.</span></div>` : ''}
    ${e.alerta_nd ? html`<div class="aviso aviso--mal">${icono('alerta')}<span>${e.alerta_nd}</span></div>` : ''}

    ${resumen(c, { adjuntos: e.adjuntos_pendientes })}

    <div class="fila">
      ${e.estado === 'abierta' && jefe ? html`<button class="btn btn--principal btn--grande" type="button" data-cerrar-rend ${e.puede_cerrarse_ya ? '' : 'disabled'}>${icono('firma')} Cerrar y firmar</button>` : ''}
      ${e.estado === 'cerrada_firmada' && jefe ? html`<button class="btn btn--principal btn--grande" type="button" data-enviar>${icono('enviar')} Enviar a la Sede Central</button>` : ''}
      ${e.version && e.estado !== 'abierta' ? html`<a class="btn btn--sec" href="${base}/pdf" target="_blank" rel="noopener">${icono('pdf')} PDF para imprimir</a><a class="btn btn--sec" href="${base}/xlsx">${icono('excel')} Excel</a>` : ''}
    </div>

    <div class="grilla grilla--panel">
      <div class="pila">
        <h2>${e.estado === 'abierta' ? 'Así va quedando el listado por rubro' : 'Listado por rubro'}</h2>
        ${c.por_rubro.length ? tablaRubros(c) : vacio('Todavía no hay gastos en este mes.', 'lista')}
        ${tablaDetalle('Pagado por la sede', c.pagado_por_sede, c.resumen.gastado_sede.total)}
        ${tablaDetalle('Pagado por la Central con cargo a la sede', c.pagado_por_central, c.resumen.pagado_central)}
      </div>
      ${versiones(e.versiones, base)}
    </div>
  </div>`);

  ctx.el.querySelectorAll('[data-mes]').forEach(b => b.addEventListener('click', () => ctx.ir(`#/rendicion/${b.dataset.mes}`)));
  ctx.el.querySelector('[data-cerrar-rend]')?.addEventListener('click', () => {
    const r = c.resumen;
    const m = modal({
      titulo: `Cerrar y firmar ${nombrePeriodo(periodo)}`, subtitulo: 'Después de firmar no se puede cargar ni corregir nada de este mes.',
      contenido: html`<form class="form" novalidate>
        <dl class="detalle">
          <dt>Fondo recibido</dt><dd>${pesos(r.fondo_recibido, { decimales: true })}${r.fondo_extra ? ` (incluye ${pesos(r.fondo_extra)} extra)` : ''}</dd>
          <dt>Total gastado</dt><dd>${pesos(r.total_gastos, { decimales: true })}</dd>
          <dt>Saldo en banco</dt><dd>${pesos(r.saldo_final.banco, { decimales: true })}</dd>
          <dt>Saldo en efectivo</dt><dd>${pesos(r.saldo_final.efectivo, { decimales: true })}</dd>
          <dt>Gastos</dt><dd>${r.cantidades.gastos} · ${r.cantidades.sin_cae} sin CAE · ${r.cantidades.nd} N/D · ${e.adjuntos_pendientes} con foto pendiente</dd>
        </dl>
        <label class="check"><input type="checkbox" name="confirmo" required><span>Revisé el resumen y <b>firmo</b> la rendición de ${nombrePeriodo(periodo)} como ${ctx.usuario.nombre} ${ctx.usuario.apellido}.</span></label>
        <p class="chico muted">La firma registra tu usuario, la fecha y hora, y una huella (hash) del contenido: si después alguien cambiara un dato, se nota.</p>
        <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit" disabled>${icono('firma')} Firmar</button></div>
      </form>`
    });
    const f = m.el.querySelector('form');
    f.confirmo.addEventListener('change', () => { f.querySelector('[type=submit]').disabled = !f.confirmo.checked; });
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      conBoton(f.querySelector('[type=submit]'), async () => {
        try { await post(`${base}/cerrar`, { confirmo: true }); m.cerrar(); toast('Rendición cerrada y firmada', 'ok'); quedarse(); } catch (ex) { error(ex); }
      });
    });
  });
  ctx.el.querySelector('[data-enviar]')?.addEventListener('click', (ev) => conBoton(ev.currentTarget, async () => {
    try { await post(`${base}/enviar`); toast('Rendición enviada a la Sede Central', 'ok'); quedarse(); } catch (ex) { error(ex); }
  }));
}

// ── Central: bandeja de rendiciones recibidas ───────────────────────────────
export async function recibidas(ctx) {
  const c = await cat();
  const { rendiciones } = await get(`/api/rendiciones/recibidas?${qs({ sede_id: ctx.query.sede, periodo: ctx.query.periodo })}`);
  const tablero = await get(`/api/rendiciones/tablero?periodo=${sumarMeses(periodoHoy(), -1)}`);
  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>Rendiciones recibidas</h1><p>Lo que enviaron las sedes. El cotejo comprobante por comprobante llega en la etapa siguiente.</p></div></div>
    <section class="panel"><div class="panel__cab"><h3>${capital(nombrePeriodo(tablero.periodo))}</h3></div>
      <div class="fila">${tablero.sedes.map(s => html`<span class="chip chip--${['enviada', 'en_cotejo', 'observada', 'aprobada'].includes(s.estado) ? 'ok' : s.estado === 'cerrada_firmada' ? 'info' : 'pend'}">${s.sede_nombre}: ${{ abierta: 'sin cerrar', cerrada_firmada: 'firmada, sin enviar', enviada: 'enviada' }[s.estado] || s.estado}</span>`)}</div></section>
    <form class="filtros" id="f">
      <select class="select" name="sede" aria-label="Sede"><option value="">Todas las sedes</option>${c.sedes.filter(s => !s.es_central).map(s => html`<option value="${s.id}" ${sel(String(s.id) === ctx.query.sede)}>${s.nombre}</option>`)}</select>
      <input class="input" type="month" name="periodo" value="${ctx.query.periodo || ''}" aria-label="Mes">
    </form>
    ${rendiciones.length ? html`<div class="tabla-caja"><table class="tabla"><thead><tr><th>Sede</th><th>Mes</th><th>Estado</th><th class="num">Recibido</th><th class="num">Gastado</th><th class="num">Saldo</th><th>Enviada</th><th></th></tr></thead><tbody>
      ${rendiciones.map(r => html`<tr><td><strong>${r.sede_nombre}</strong></td><td>${capital(nombrePeriodo(r.periodo))}</td><td>${chipRendicion(r.estado)}${r.version > 1 ? html` <small class="muted">v${r.version}</small>` : ''}</td>
        <td class="num">${pesos(r.fondo_recibido)}</td><td class="num">${pesos(r.total_gastos)}</td><td class="num">${pesos(r.saldo_final)}</td><td>${fechaHora(r.enviado_en)}<br><small class="muted">${r.firmado_por_nombre}</small></td>
        <td><a class="btn btn--sec btn--chico" href="#/central/rendiciones/${r.sede_id}/${r.periodo}">Ver</a></td></tr>`)}
    </tbody></table></div>` : vacio('Todavía no hay rendiciones enviadas con ese filtro.', 'enviada')}
  </div>`);
  const f = ctx.el.querySelector('#f');
  f.addEventListener('change', () => ctx.ir(`#/central/rendiciones?${qs({ sede: f.sede.value, periodo: f.periodo.value })}`));
}

export async function rendicionRecibida(ctx) {
  const { sede, periodo } = ctx.params;
  const base = `/api/rendiciones/${sede}/${periodo}`;
  let d;
  try { d = await get(`${base}/documento${ctx.query.version ? `?version=${ctx.query.version}` : ''}`); } catch (e) {
    if (e.status !== 404) throw e;
    // Todavía no se cerró: se muestra cómo viene (vista previa en vivo).
    const e2 = await get(base);
    pintar(ctx.el, html`<div class="vista"><div class="vista__cab"><div><a class="volver" href="#/central/sedes">${icono('izq')} Sedes</a><h1>${e2.sede.nombre} · ${nombrePeriodo(periodo)}</h1><p>${chipRendicion('abierta')} · todavía no se cerró. Así viene:</p></div></div>
      ${resumen(e2.contenido, { adjuntos: e2.adjuntos_pendientes })}${tablaRubros(e2.contenido)}</div>`);
    return;
  }
  const c = d.contenido; const v = d.version; const r = d.rendicion;
  const vigente = v.version === r.version;
  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><a class="volver" href="#/central/rendiciones">${icono('izq')} Rendiciones recibidas</a>
      <h1>${c.sede.nombre} · ${nombrePeriodo(c.periodo)}</h1><p>${chipRendicion(vigente ? r.estado : 'abierta')} · versión ${v.version}${vigente ? '' : ' (reabierta, no vigente)'}</p></div>
      <div class="vista__acciones">
        <a class="btn btn--sec" href="${base}/pdf?version=${v.version}" target="_blank" rel="noopener">${icono('pdf')} PDF</a>
        <a class="btn btn--sec" href="${base}/xlsx?version=${v.version}">${icono('excel')} Excel</a>
        ${vigente && ['cerrada_firmada', 'enviada'].includes(r.estado) && ctx.puede('rendicion.reabrir') ? html`<button class="btn btn--sec" type="button" data-reabrir>${icono('recargar')} Reabrir</button>` : ''}
      </div></div>

    <section class="panel"><div class="panel__cab"><h3>${icono('escudo')} Firma e integridad</h3>
      ${d.integridad.foto_ok && d.integridad.datos_ok !== false ? chip('ok', 'Íntegra') : chip('mal', 'NO COINCIDE')}</div>
      <dl class="detalle">
        <dt>Firmó</dt><dd>${v.firmado_por_nombre} · ${fechaHora(v.firmado_en)}</dd>
        <dt>Envió</dt><dd>${v.enviado_en ? `${v.enviado_por_nombre} · ${fechaHora(v.enviado_en)}` : 'Todavía no se envió'}</dd>
        <dt>Hash</dt><dd class="hash">${v.hash}</dd>
        <dt>La foto guardada</dt><dd>${d.integridad.foto_ok ? 'Intacta: el contenido guardado da el mismo hash.' : html`<b style="color:var(--rojo)">Alterada: el contenido guardado no da el hash firmado.</b>`}</dd>
        <dt>Los datos de hoy</dt><dd>${d.integridad.datos_ok == null ? 'No aplica (versión no vigente).' : d.integridad.datos_ok ? 'Coinciden con lo firmado.' : html`<b style="color:var(--rojo)">No coinciden: algo cambió en la base después de la firma. Revisar la auditoría.</b>`}</dd>
        ${v.reabierto_en ? html`<dt>Reapertura</dt><dd>${fechaHora(v.reabierto_en)} · ${v.motivo_reapertura}</dd>` : ''}
      </dl></section>

    ${resumen(c)}
    <div class="grilla grilla--panel">
      <div class="pila">${tablaRubros(c)}${tablaDetalle('Pagado por la sede', c.pagado_por_sede, c.resumen.gastado_sede.total)}${tablaDetalle('Pagado por la Central con cargo a la sede', c.pagado_por_central, c.resumen.pagado_central)}</div>
      <section class="panel"><div class="panel__cab"><h3>Versiones</h3></div><ul class="historial">
        ${d.versiones.map(x => html`<li><a href="#/central/rendiciones/${sede}/${periodo}?version=${x.version}"><strong>Versión ${x.version}</strong></a> · ${x.firmado_por_nombre} · ${fechaHora(x.firmado_en)}
          ${x.reabierto_en ? html`<br><small>Reabierta: ${x.motivo_reapertura}</small>` : ''}</li>`)}</ul></section>
    </div>
  </div>`);
  ctx.el.querySelector('[data-reabrir]')?.addEventListener('click', async () => {
    const motivo = await pedirTexto({ titulo: `Reabrir ${c.sede.nombre} · ${nombrePeriodo(c.periodo)}`, texto: 'La sede vuelve a poder cargar y corregir ese mes. Esta versión queda guardada como antecedente y el próximo cierre crea una nueva.', label: 'Motivo (obligatorio, lo ve la sede)', boton: 'Reabrir', peligro: true });
    if (!motivo) return;
    try { await post(`${base}/reabrir`, { motivo }); toast('Período reabierto', 'ok'); ctx.recargar(); } catch (e) { error(e); }
  });
}
