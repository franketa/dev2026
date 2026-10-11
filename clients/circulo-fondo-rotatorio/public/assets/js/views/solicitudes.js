// Solicitudes de gasto: la sede pide aprobación para lo que supera los topes; la Central resuelve.

import {
  get, post, html, pintar, icono, pesos, fechaHora, error, toast, conBoton, cat, rubrosImputables, parsePesos, mascaraPesos,
  chipSolicitud, modal, qs, vacio, fmtCuit, subirEnSegundoPlano, MEDIOS
} from '../lib.js';
import { agruparRubros } from './cargar.js';
import { altaProveedor } from './proveedores.js';

const FILTROS = [['', 'Todas'], ['pendiente,en_revision', 'Pendientes'], ['aprobada', 'Aprobadas'], ['rechazada', 'Rechazadas'], ['ejecutada', 'Pagadas']];

export async function listaSolicitudes(ctx) {
  const estado = ctx.query.estado ?? '';
  const { solicitudes } = await get(`/api/solicitudes?${qs({ estado })}`);
  const veTodas = ctx.puede('sedes.ver_todas');
  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>Solicitudes de gasto</h1><p>Lo que no es fijo y supera los topes de caja chica se paga sólo con la aprobación de la Sede Central.</p></div>
      ${ctx.puede('solicitudes.crear') ? html`<div class="vista__acciones"><a class="btn btn--principal" href="#/solicitudes/nueva">${icono('mas')} Nueva solicitud</a></div>` : ''}</div>
    <nav class="pestanas" aria-label="Filtrar por estado">${FILTROS.map(([v, t]) => html`<a href="#/solicitudes?estado=${v}" ${v === estado ? html`aria-current="page"` : ''}>${t}</a>`)}</nav>
    ${solicitudes.length ? html`<div class="lista">${solicitudes.map(s => itemSolicitud(s, veTodas))}</div>` : vacio('No hay solicitudes acá.', 'solicitud')}
  </div>`);
}

export function itemSolicitud(s, conSede = true) {
  return html`<a class="item" href="#/solicitudes/${s.id}">
    <span class="item__icono">${icono('solicitud')}</span>
    <div class="item__texto"><strong>${s.descripcion}</strong><small>#${s.id}${conSede ? ` · ${s.sede_nombre}` : ''} · ${fechaHora(s.creado_en)}${s.quien_paga === 'central' ? ' · paga la Central' : ''}</small></div>
    <div class="item__monto">${pesos(s.monto_estimado)}<small>${chipSolicitud(s.estado)}</small></div>
  </a>`;
}

export async function nuevaSolicitud(ctx) {
  const c = await cat();
  let proveedor = null;
  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><a class="volver" href="#/solicitudes">${icono('izq')} Solicitudes</a><h1>Pedir aprobación</h1>
      <p>La Sede Central la ve en su panel del día. Te avisamos acá cuando la resuelvan.</p></div></div>
    <form class="carga" novalidate id="f">
      <section class="paso">
        <div class="campo"><label for="desc">¿Qué hay que pagar y por qué?</label>
          <textarea class="input textarea" id="desc" name="descripcion" maxlength="1000" required placeholder="Ej.: se rompió la bomba de la pileta, el arreglo sale $ 400.000"></textarea></div>
        <div class="campo"><label for="monto">Monto estimado</label>
          <div class="input-pref"><span>$</span><input class="input input--monto" id="monto" name="monto" inputmode="decimal" required placeholder="0"></div></div>
        <div class="campo"><label for="rubro">Rubro <span class="muted chico">(si lo sabés)</span></label>
          <select class="select" id="rubro" name="rubro_id"><option value="">—</option>${agruparRubros(rubrosImputables(c))}</select></div>
        <div class="campo"><span class="campo__label">Proveedor <span class="muted chico">(si ya lo tenés)</span></span><div id="prov"></div></div>
        <div class="campo"><span class="campo__label">¿Cómo pensás pagarlo?</span>
          <div class="segmentado"><label><input type="radio" name="medio_previsto" value="transferencia" checked>${icono('banco')}Transferencia</label><label><input type="radio" name="medio_previsto" value="efectivo">${icono('efectivo')}Efectivo</label></div></div>
        ${c.flags.adjuntos ? html`<label class="adjuntar">${icono('foto')}<span><strong>Adjuntar presupuesto</strong> <small class="muted">(opcional)</small></span><input type="file" accept="image/*,application/pdf" id="presupuesto"></label>` : ''}
      </section>
      <div class="carga__enviar"><button class="btn btn--principal btn--grande btn--ancho" type="submit">${icono('enviar')} Enviar a la Sede Central</button></div>
    </form></div>`);
  const f = ctx.el.querySelector('#f');
  mascaraPesos(f.monto);
  const pintarProv = () => {
    const caja = ctx.el.querySelector('#prov');
    pintar(caja, proveedor
      ? html`<div class="elegido"><div><strong>${proveedor.razon_social}</strong><small>CUIT ${fmtCuit(proveedor.cuit)}</small></div><button class="btn btn--fantasma btn--chico" type="button" data-q>Quitar</button></div>`
      : html`<div class="fila"><input class="input" id="q" type="search" placeholder="Buscar por CUIT o nombre" style="flex:1"><button class="btn btn--sec" type="button" data-buscar>${icono('buscar')}</button></div><div id="res"></div>`);
    caja.querySelector('[data-q]')?.addEventListener('click', () => { proveedor = null; pintarProv(); });
    const buscar = async () => {
      const { proveedores } = await get(`/api/proveedores?q=${encodeURIComponent(caja.querySelector('#q').value)}`);
      pintar(caja.querySelector('#res'), html`<div class="resultados">${proveedores.slice(0, 6).map(p => html`<button type="button" data-id="${p.id}"><strong>${p.razon_social}</strong><small>${fmtCuit(p.cuit)}</small></button>`)}
        ${ctx.puede('proveedores.alta') ? html`<button type="button" data-alta>${icono('mas')} Proveedor nuevo</button>` : ''}</div>`);
      caja.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => { proveedor = proveedores.find(p => p.id === Number(b.dataset.id)); pintarProv(); }));
      caja.querySelector('[data-alta]')?.addEventListener('click', async () => { const p = await altaProveedor(caja.querySelector('#q').value); if (p) { proveedor = p; pintarProv(); } });
    };
    caja.querySelector('[data-buscar]')?.addEventListener('click', buscar);
    caja.querySelector('#q')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } });
  };
  pintarProv();
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    conBoton(f.querySelector('[type=submit]'), async () => {
      const monto = parsePesos(f.monto.value);
      if (!monto) return toast('Indicá el monto estimado', 'mal');
      try {
        const { id } = await post('/api/solicitudes', {
          descripcion: f.descripcion.value, monto_estimado: monto, rubro_id: f.rubro_id.value || null,
          proveedor_id: proveedor?.id || null, medio_previsto: f.querySelector('[name=medio_previsto]:checked').value
        });
        const arch = ctx.el.querySelector('#presupuesto')?.files[0];
        if (arch) subirEnSegundoPlano('solicitud', id, arch);
        toast('Solicitud enviada a la Sede Central', 'ok');
        ctx.ir(`#/solicitudes/${id}`);
      } catch (ex) { error(ex); }
    });
  });
}

// Resolver desde el panel diario o el detalle: aprobar (y quién paga), pasar a revisión o rechazar.
export function resolverSolicitud(ctx, s, alTerminar) {
  const escalada = s.estado === 'en_revision';
  const m = modal({
    titulo: `Solicitud #${s.id} · ${s.sede_nombre}`, subtitulo: `${pesos(s.monto_estimado)} · ${s.descripcion}`,
    contenido: html`<form class="form" novalidate>
      <div class="segmentado" role="radiogroup" aria-label="Decisión">
        <label><input type="radio" name="estado" value="aprobada" checked>${icono('check')}Aprobar</label>
        ${escalada ? '' : html`<label><input type="radio" name="estado" value="en_revision">${icono('reloj')}A revisión</label>`}
        <label><input type="radio" name="estado" value="rechazada">${icono('x')}Rechazar</label>
      </div>
      <div class="campo" id="quien"><span class="campo__label">¿Quién paga?</span>
        <div class="segmentado">
          <label><input type="radio" name="quien_paga" value="sede" checked>${icono('banco')}La sede, con su fondo</label>
          <label><input type="radio" name="quien_paga" value="central">${icono('edificio')}La Central, directo al proveedor</label>
        </div>
        <span class="campo__ayuda">Si paga la Central, no consume el fondo de la sede pero el gasto se imputa a la sede y figura en su rendición.</span></div>
      <div class="campo"><label for="com">Comentario para la sede</label><textarea class="input textarea" id="com" name="comentario" placeholder="Obligatorio si se rechaza"></textarea></div>
      <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">Confirmar</button></div>
    </form>`
  });
  const f = m.el.querySelector('form');
  const quien = m.el.querySelector('#quien');
  f.querySelectorAll('[name=estado]').forEach(r => r.addEventListener('change', () => { quien.hidden = f.querySelector('[name=estado]:checked').value !== 'aprobada'; }));
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    conBoton(f.querySelector('[type=submit]'), async () => {
      const estado = f.querySelector('[name=estado]:checked').value;
      try {
        await post(`/api/solicitudes/${s.id}/resolver`, { estado, comentario: f.comentario.value, quien_paga: f.querySelector('[name=quien_paga]:checked').value });
        m.cerrar();
        toast({ aprobada: 'Solicitud aprobada', rechazada: 'Solicitud rechazada', en_revision: 'Pasó a revisión' }[estado], 'ok');
        alTerminar?.();
      } catch (ex) { error(ex); }
    });
  });
}

export function puedeResolver(ctx, s) {
  return (s.estado === 'pendiente' && ctx.puede('solicitudes.resolver')) || (s.estado === 'en_revision' && ctx.puede('solicitudes.resolver_escaladas'));
}

export async function detalleSolicitud(ctx) {
  const d = await get(`/api/solicitudes/${ctx.params.id}`);
  const s = d.solicitud;
  const ACC = { pendiente: 'Pedida', en_revision: 'Pasó a revisión', aprobada: 'Aprobada', rechazada: 'Rechazada', ejecutada: 'Pagada' };
  const pagaSede = s.estado === 'aprobada' && s.quien_paga === 'sede' && ctx.esSede && ctx.puede('gastos.cargar');
  const pagaCentral = s.estado === 'aprobada' && s.quien_paga === 'central' && ctx.puede('gastos.pago_central');
  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><a class="volver" href="#/solicitudes">${icono('izq')} Solicitudes</a><h1>Solicitud #${s.id}</h1><p>${s.sede_nombre} · ${fechaHora(s.creado_en)}</p></div>
      <div class="vista__acciones">
        ${puedeResolver(ctx, s) ? html`<button class="btn btn--principal" type="button" data-resolver>${icono('check')} Resolver</button>` : ''}
        ${pagaSede ? html`<a class="btn btn--principal" href="#/cargar?solicitud=${s.id}">${icono('pago')} Cargar el pago</a>` : ''}
        ${pagaCentral ? html`<a class="btn btn--principal" href="#/central/pago?solicitud=${s.id}&sede=${s.sede_id}">${icono('pago')} Registrar el pago de la Central</a>` : ''}
      </div></div>
    <div class="grilla grilla--panel">
      <section class="panel"><div class="panel__cab"><h2>${pesos(s.monto_estimado)}</h2>${chipSolicitud(s.estado)}</div>
        <p style="margin-bottom:14px">${s.descripcion}</p>
        <dl class="detalle">
          <dt>Pidió</dt><dd>${s.creado_por_nombre}</dd>
          ${s.rubro_completo ? html`<dt>Rubro</dt><dd>${s.rubro_completo}</dd>` : ''}
          ${s.proveedor ? html`<dt>Proveedor</dt><dd>${s.proveedor} · ${fmtCuit(s.proveedor_cuit)}</dd>` : ''}
          ${s.medio_previsto ? html`<dt>Medio previsto</dt><dd>${MEDIOS[s.medio_previsto]}</dd>` : ''}
          ${s.quien_paga ? html`<dt>Paga</dt><dd>${s.quien_paga === 'central' ? 'La Sede Central, directo al proveedor, con cargo a la sede' : 'La sede, con su fondo'}</dd>` : ''}
          ${s.resuelto_por_nombre ? html`<dt>Resolvió</dt><dd>${s.resuelto_por_nombre} · ${fechaHora(s.resuelto_en)}</dd>` : ''}
          ${s.comentario ? html`<dt>Comentario</dt><dd>${s.comentario}</dd>` : ''}
          ${s.gasto_id ? html`<dt>Pago</dt><dd><a href="#/gastos/${s.gasto_id}">Gasto #${s.gasto_id}</a></dd>` : ''}
        </dl>
        ${d.adjuntos.length ? html`<div class="fila" style="margin-top:14px">${d.adjuntos.map(a => html`<a class="btn btn--sec btn--chico" href="/api/adjuntos/${a.id}" target="_blank" rel="noopener">${icono(a.mime === 'application/pdf' ? 'pdf' : 'foto')} Presupuesto</a>`)}</div>` : ''}
      </section>
      <section class="panel"><div class="panel__cab"><h3>${icono('reloj')} Historial</h3></div>
        <ul class="historial">${d.historial.map(h => html`<li><strong>${ACC[h.a]}</strong> · ${h.usuario || ''}${h.quien_paga ? ` · paga ${h.quien_paga === 'central' ? 'la Central' : 'la sede'}` : ''}${h.comentario ? html`<br><em>${h.comentario}</em>` : ''}<small>${fechaHora(h.creado_en)}</small></li>`)}</ul>
      </section>
    </div></div>`);
  ctx.el.querySelector('[data-resolver]')?.addEventListener('click', () => resolverSolicitud(ctx, s, () => ctx.recargar()));
}
