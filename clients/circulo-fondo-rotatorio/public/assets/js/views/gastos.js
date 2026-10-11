// Gastos: lista del mes y detalle (comprobante, retenciones, movimientos, foto, historial de cambios).

import {
  get, post, put, html, pintar, icono, pesos, fecha, fechaHora, error, toast, conBoton, cat, rubrosImputables, chipTipo, chip, qs,
  selectorMes, periodoHoy, modal, pedirTexto, MEDIOS, fmtCuit, alicuota, subirEnSegundoPlano, vacio, sel, nombrePeriodo, datosForm
} from '../lib.js';
import { agruparRubros } from './cargar.js';

export async function listaGastos(ctx) {
  const periodo = ctx.query.periodo || periodoHoy();
  const c = await cat();
  const veTodas = ctx.puede('sedes.ver_todas');
  const sedeId = veTodas ? ctx.query.sede || '' : '';
  const { gastos } = await get(`/api/gastos?${qs({ periodo, sede_id: sedeId, q: ctx.query.q })}`);
  const vigentes = gastos.filter(g => g.estado === 'registrado');
  const total = vigentes.reduce((s, g) => s + g.bruto, 0);
  const ir = (cambios) => ctx.ir(`#/gastos?${qs({ periodo, sede: sedeId, q: ctx.query.q, ...cambios })}`);

  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>Gastos</h1><p>${vigentes.length} gasto${vigentes.length === 1 ? '' : 's'} · ${pesos(total)}${gastos.length > vigentes.length ? ` · ${gastos.length - vigentes.length} anulado${gastos.length - vigentes.length === 1 ? '' : 's'}` : ''}</p></div>
      <div class="vista__acciones">${selectorMes(periodo)}${ctx.puede('gastos.cargar') && ctx.esSede ? html`<a class="btn btn--principal" href="#/cargar">${icono('mas')} Cargar</a>` : ''}</div></div>
    <form class="filtros" id="filtros">
      ${veTodas ? html`<select class="select" name="sede" aria-label="Sede"><option value="">Todas las sedes</option>${c.sedes.filter(s => !s.es_central).map(s => html`<option value="${s.id}" ${sel(String(s.id) === String(sedeId))}>${s.nombre}</option>`)}</select>` : ''}
      <input class="input" type="search" name="q" value="${ctx.query.q || ''}" placeholder="Proveedor, CUIT, CAE o número" aria-label="Buscar">
    </form>
    ${gastos.length ? html`<div class="lista">${gastos.map(g => itemGasto(g, veTodas))}</div>` : vacio(`No hay gastos en ${nombrePeriodo(periodo)}.`, 'lista')}
  </div>`);
  ctx.el.querySelectorAll('[data-mes]').forEach(b => b.addEventListener('click', () => ir({ periodo: b.dataset.mes })));
  const f = ctx.el.querySelector('#filtros');
  f.addEventListener('submit', (e) => { e.preventDefault(); ir({ q: f.q.value, sede: f.sede?.value ?? sedeId }); });
  f.sede?.addEventListener('change', () => ir({ sede: f.sede.value }));
  let t; f.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => ir({ q: f.q.value }), 500); });
}

export function itemGasto(g, conSede = false) {
  const central = g.pagado_por === 'central';
  return html`<a class="item ${g.estado === 'anulado' ? 'item--anulado' : ''}" href="#/gastos/${g.id}">
    <span class="item__icono ${central ? 'item__icono--central' : ''}">${icono(central ? 'edificio' : g.medio === 'efectivo' ? 'efectivo' : 'banco')}</span>
    <div class="item__texto"><strong>${g.proveedor}</strong>
      <small>${fecha(g.fecha_pago)} · ${g.rubro_completo}${conSede ? ` · ${g.sede_nombre}` : ''}${central ? ' · pagó la Central' : ''}${g.sin_cae ? ' · sin CAE' : ''}${g.adjunto_estado === 'pendiente' ? ' · foto pendiente' : ''}</small></div>
    <div class="item__monto">${pesos(g.bruto)}<small>${g.estado === 'anulado' ? 'Anulado' : { fijo: 'Fijo', caja_chica: 'Caja chica', con_solicitud: 'Con solicitud' }[g.tipo_gasto]}</small></div>
  </a>`;
}

export async function detalleGasto(ctx) {
  const d = await get(`/api/gastos/${ctx.params.id}`);
  const c = await cat();
  const g = d.gasto;
  const abierto = g.estado_rendicion === 'abierta';
  const puedeCorregir = g.estado === 'registrado' && abierto && ctx.puede('gastos.corregir') && (g.pagado_por === 'sede' || ctx.puede('gastos.pago_central'));
  const ACC = { 'gasto.alta': 'Cargado', 'gasto.correccion': 'Corregido', 'gasto.anulacion': 'Anulado', 'adjunto.alta': 'Foto subida' };

  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div>
      <a class="volver" href="#/gastos?periodo=${g.periodo}">${icono('izq')} Gastos</a>
      <h1>Gasto #${g.id}</h1>
      <p>${g.proveedor} · ${g.sede_nombre}</p>
    </div>
    <div class="vista__acciones">
      ${g.certificado_id ? html`<a class="btn btn--sec" href="/api/certificados/${g.certificado_id}/pdf" target="_blank" rel="noopener">${icono('pdf')} Retención N.º ${g.certificado_numero}</a>` : ''}
      ${puedeCorregir ? html`<button class="btn btn--sec" type="button" data-corregir>${icono('editar')} Corregir</button><button class="btn btn--sec" type="button" data-anular>${icono('anular')} Anular</button>` : ''}
    </div></div>

    ${g.estado === 'anulado' ? html`<div class="aviso aviso--mal">${icono('anular')}<span><b>Anulado</b> el ${fechaHora(g.anulado_en)}: ${g.motivo_anulacion}. La plata volvió a la cuenta con un contraasiento.</span></div>` : ''}
    ${!abierto && g.estado === 'registrado' ? html`<div class="aviso aviso--info">${icono('candado')}<span>La rendición de ${nombrePeriodo(g.periodo)} está cerrada: este gasto ya no se puede tocar. Si hace falta, la Central reabre el período.</span></div>` : ''}
    ${g.advertencias.map(a => html`<div class="aviso">${icono('alerta')}<span>${a}</span></div>`)}

    <div class="grilla grilla--panel">
      <div class="pila">
        <section class="panel">
          <div class="panel__cab"><h2>${pesos(g.bruto, { decimales: true })}</h2>${chipTipo(g.tipo_gasto)}</div>
          <dl class="detalle">
            <dt>Proveedor</dt><dd>${g.proveedor} · CUIT ${fmtCuit(g.proveedor_cuit)}</dd>
            <dt>Comprobante</dt><dd>${g.comprobante}${g.fecha_comprobante ? ` del ${fecha(g.fecha_comprobante)}` : ''}</dd>
            <dt>CAE</dt><dd>${g.cae ? html`<span class="mono">${g.cae}</span>${g.cae_vto ? ` · vence ${fecha(g.cae_vto)}` : ''}` : chip('pend', 'Sin CAE')}</dd>
            ${g.cuit_receptor ? html`<dt>CUIT receptor</dt><dd>${fmtCuit(g.cuit_receptor)}</dd>` : ''}
            <dt>Rubro</dt><dd>${g.rubro_completo}</dd>
            <dt>Pago</dt><dd>${fecha(g.fecha_pago)} · ${MEDIOS[g.medio]} · ${g.pagado_por === 'central' ? 'pagó la Sede Central con cargo a la sede' : 'pagó la sede con su fondo'}</dd>
            ${g.retenciones ? html`<dt>Retenciones</dt><dd>${pesos(g.retenciones, { decimales: true })} · neto transferido ${pesos(g.neto, { decimales: true })}</dd>` : ''}
            ${d.solicitud ? html`<dt>Solicitud</dt><dd><a href="#/solicitudes/${d.solicitud.id}">#${d.solicitud.id} · ${d.solicitud.descripcion}</a></dd>` : ''}
            ${g.descripcion ? html`<dt>Detalle</dt><dd>${g.descripcion}</dd>` : ''}
            <dt>Cargado por</dt><dd>${g.creado_por_nombre} · ${fechaHora(g.creado_en)}</dd>
          </dl>
        </section>
        ${d.retenciones.length ? html`<section class="panel"><div class="panel__cab"><h3>${icono('retencion')} Retenciones</h3></div>
          <div class="tabla-caja"><table class="tabla"><thead><tr><th>Impuesto</th><th>Régimen</th><th class="num">Base</th><th class="num">Alíc.</th><th class="num">Importe</th></tr></thead><tbody>
          ${d.retenciones.map(r => html`<tr><td>${c.impuestos[r.impuesto]}${r.jurisdiccion ? ` (${r.jurisdiccion})` : ''}</td><td>${r.regimen}<br><small class="muted">tildó ${r.tildado_por_nombre}</small></td><td class="num">${pesos(r.base, { decimales: true })}</td><td class="num">${alicuota(r.alicuota)}</td><td class="num">${pesos(r.importe, { decimales: true })}</td></tr>`)}
          </tbody></table></div></section>` : ''}
      </div>
      <div class="pila">
        <section class="panel"><div class="panel__cab"><h3>${icono('foto')} Comprobante</h3></div>
          ${d.adjuntos.length ? html`<div class="pila">${d.adjuntos.map(a => a.mime.startsWith('image/')
            ? html`<a href="/api/adjuntos/${a.id}" target="_blank" rel="noopener"><img src="/api/adjuntos/${a.id}" alt="Foto del comprobante" style="border-radius:8px;border:1px solid var(--linea);width:100%;max-height:360px;object-fit:contain;background:var(--papel)"></a>`
            : html`<a class="btn btn--sec" href="/api/adjuntos/${a.id}" target="_blank" rel="noopener">${icono('pdf')} ${a.nombre}</a>`)}</div>`
          : html`<p class="muted chico">${g.adjunto_estado === 'pendiente' ? 'La foto quedó pendiente de subir.' : 'Sin foto.'}</p>`}
          ${c.flags.adjuntos && g.estado === 'registrado' && (ctx.puede('gastos.cargar') || ctx.puede('gastos.pago_central')) ? html`
            <label class="adjuntar" style="margin-top:10px">${icono('foto')}<span><strong>${d.adjuntos.length ? 'Agregar otra foto' : 'Subir la foto'}</strong></span><input type="file" accept="image/*,application/pdf" id="foto"></label>` : ''}
        </section>
        <section class="panel"><div class="panel__cab"><h3>${icono('reloj')} Historial</h3></div>
          <ul class="historial">${d.historial.map(h => html`<li><strong>${ACC[h.accion] || h.accion}</strong> por ${h.usuario || 'el sistema'}${h.motivo ? html` · <em>${h.motivo}</em>` : ''}<small>${fechaHora(h.creado_en)}${h.ip ? ` · IP ${h.ip}` : ''}</small></li>`)}</ul>
        </section>
        <section class="panel"><div class="panel__cab"><h3>${icono('cadena')} Movimientos</h3></div>
          ${d.movimientos.map(m => html`<div class="fila" style="justify-content:space-between"><span class="chico">#${m.id} · ${m.tipo === 'anulacion' ? 'Contraasiento' : m.tipo === 'pago_central' ? 'Cuenta de la Central' : `Cuenta ${m.cuenta}`}</span><strong class="${m.importe < 0 ? 'monto-neg' : 'monto-pos'}">${pesos(m.importe, { signo: true })}</strong></div>`)}
        </section>
      </div>
    </div>
  </div>`);

  ctx.el.querySelector('#foto')?.addEventListener('change', (e) => {
    const a = e.target.files[0];
    if (!a) return;
    subirEnSegundoPlano('gasto', g.id, a);
    toast('Subiendo la foto…');
    setTimeout(() => ctx.recargar(), 2500);
  });

  ctx.el.querySelector('[data-anular]')?.addEventListener('click', async () => {
    const motivo = await pedirTexto({ titulo: `Anular el gasto #${g.id}`, texto: `Se devuelven ${pesos(g.bruto)} a la cuenta con un contraasiento. El gasto no se borra: queda anulado y a la vista.`, label: 'Motivo', boton: 'Anular gasto', peligro: true });
    if (!motivo) return;
    try { await post(`/api/gastos/${g.id}/anular`, { motivo }); toast('Gasto anulado', 'ok'); ctx.recargar(); } catch (e) { error(e); }
  });

  ctx.el.querySelector('[data-corregir]')?.addEventListener('click', () => {
    const m = modal({
      titulo: `Corregir el gasto #${g.id}`, subtitulo: 'Lo que mueve plata (importe, medio, quién pagó) no se corrige: se anula y se carga de nuevo.', ancho: true,
      contenido: html`<form class="form" novalidate>
        <div class="campo"><label>Rubro</label><select class="select" name="rubro_id">${agruparRubros(rubrosImputables(c), g.rubro_id)}</select></div>
        <div class="fila-campos fila-campos--3">
          <div class="campo"><label>Tipo</label><select class="select" name="tipo_comprobante">${Object.entries(c.tipos_comprobante).map(([k, v]) => html`<option value="${k}" ${sel(k === g.tipo_comprobante)}>${v}</option>`)}</select></div>
          <div class="campo"><label>Punto de venta</label><input class="input" name="punto_venta" inputmode="numeric" value="${g.punto_venta ?? ''}"></div>
          <div class="campo"><label>Número</label><input class="input" name="numero" inputmode="numeric" value="${g.numero ?? ''}"></div>
        </div>
        <div class="fila-campos fila-campos--2">
          <div class="campo"><label>CAE</label><input class="input" name="cae" inputmode="numeric" maxlength="14" value="${g.cae ?? ''}"></div>
          <div class="campo"><label>Vencimiento del CAE</label><input class="input" type="date" name="cae_vto" value="${g.cae_vto ?? ''}"></div>
        </div>
        <div class="fila-campos fila-campos--2">
          <div class="campo"><label>Fecha del comprobante</label><input class="input" type="date" name="fecha_comprobante" value="${g.fecha_comprobante ?? ''}"></div>
          <div class="campo"><label>CUIT receptor</label><input class="input" name="cuit_receptor" inputmode="numeric" value="${g.cuit_receptor ?? ''}"></div>
        </div>
        <div class="campo"><label>Detalle</label><input class="input" name="descripcion" value="${g.descripcion ?? ''}"></div>
        <div class="campo"><label>Motivo de la corrección</label><input class="input" name="motivo" required placeholder="Queda en el historial del gasto y en la auditoría"></div>
        <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">Guardar corrección</button></div>
      </form>`
    });
    const f = m.el.querySelector('form');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      conBoton(f.querySelector('[type=submit]'), async () => {
        try { await put(`/api/gastos/${g.id}`, datosForm(f)); m.cerrar(); toast('Gasto corregido', 'ok'); ctx.recargar(); } catch (ex) { error(ex); }
      });
    });
  });
}
