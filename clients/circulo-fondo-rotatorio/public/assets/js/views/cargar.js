// Cargar un gasto (sede) o registrar un pago directo de la Central con cargo a una sede.
// Pensado para el celular: pocos campos, en orden, y el sistema dice en vivo si el gasto es fijo,
// de caja chica o si necesita una solicitud aprobada.

import {
  get, post, html, raw, pintar, icono, pesos, fecha, error, toast, conBoton, cat, rubrosImputables, parsePesos, mascaraPesos,
  hoyAR, fmtCuit, alicuota, subirEnSegundoPlano, modal, sel, chipTipo, soloDigitos
} from '../lib.js';
import { altaProveedor } from './proveedores.js';

const TIPOS = [['factura_a', 'Factura A'], ['factura_b', 'Factura B'], ['factura_c', 'Factura C'], ['ticket', 'Ticket'], ['recibo', 'Recibo'], ['otro', 'Otro']];
const IMPUESTOS = [['iva', 'IVA'], ['ganancias', 'Ganancias'], ['suss', 'SUSS'], ['iibb', 'Ingresos Brutos']];

export default async function cargar(ctx) {
  const central = location.hash.startsWith('#/central/pago');
  const c = await cat();
  const rubros = rubrosImputables(c);
  const sedes = c.sedes.filter(s => !s.es_central);
  const est = {
    sedeId: central ? (Number(ctx.query.sede) || null) : ctx.usuario.sede_id,
    proveedor: null, solicitud: null, aprobadas: [], medio: 'transferencia', foto: null,
    ret: {} // impuesto → { alicuota_id, base }
  };
  const puedeRet = ctx.puede('gastos.retenciones');

  // Cargar el pago de una solicitud aprobada (link desde la solicitud o desde el panel).
  const deSolicitud = ctx.query.solicitud ? (await get(`/api/solicitudes/${ctx.query.solicitud}`)).solicitud : null;
  if (deSolicitud) est.sedeId = deSolicitud.sede_id;

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab"><div>
      <h1>${central ? 'Pago directo de la Central' : 'Cargar gasto'}</h1>
      <p>${central ? 'La plata sale de la cuenta de la Central y el gasto se imputa a la sede: aparece en su rendición.' : 'Completá en orden. Si algo no corresponde, el sistema te avisa antes de guardar.'}</p>
    </div></div>

    <form class="carga" id="form-gasto" novalidate>
      ${central ? html`
      <section class="paso">
        <div class="paso__titulo"><span class="paso__n">1</span>¿A qué sede se imputa?</div>
        <select class="select" name="sede_id" id="sede" required>
          <option value="">Elegí la sede…</option>
          ${sedes.map(s => html`<option value="${s.id}" ${sel(s.id === est.sedeId)}>${s.nombre}</option>`)}
        </select>
      </section>` : ''}

      <section class="paso">
        <div class="paso__titulo"><span class="paso__n">${central ? 2 : 1}</span>¿A quién le pagaste?</div>
        <div id="proveedor"></div>
      </section>

      <section class="paso">
        <div class="paso__titulo"><span class="paso__n">${central ? 3 : 2}</span>¿Cuánto${central ? '' : ' y cómo'}?</div>
        <div class="campo">
          <label for="bruto">Importe total del comprobante</label>
          <div class="input-pref"><span>$</span><input class="input input--monto" id="bruto" name="bruto" inputmode="decimal" autocomplete="off" placeholder="0" required></div>
        </div>
        ${central ? html`<p class="campo__ayuda">La Central paga siempre por transferencia.</p>` : html`
        <div class="segmentado" role="radiogroup" aria-label="Medio de pago">
          <label><input type="radio" name="medio" value="transferencia" checked>${icono('banco')}Transferencia</label>
          <label><input type="radio" name="medio" value="efectivo">${icono('efectivo')}Efectivo</label>
        </div>`}
        <div class="campo">
          <label for="fecha_pago">Fecha del pago</label>
          <input class="input" type="date" id="fecha_pago" name="fecha_pago" value="${hoyAR()}" max="${hoyAR()}" required>
        </div>
      </section>

      <section class="paso">
        <div class="paso__titulo"><span class="paso__n">${central ? 4 : 3}</span>¿Qué se pagó?</div>
        <div class="campo">
          <label for="rubro">Rubro</label>
          <select class="select" id="rubro" name="rubro_id" required>
            <option value="">Elegí el rubro…</option>
            ${agruparRubros(rubros)}
          </select>
          <span class="campo__ayuda">Si de verdad no sabés qué es, usá "N/D – sin descripción". No abuses: se controla.</span>
        </div>
        <div id="regla"></div>
        <div id="solicitud"></div>
      </section>

      <section class="paso">
        <div class="paso__titulo"><span class="paso__n">${central ? 5 : 4}</span>Comprobante</div>
        <div class="campo">
          <label for="tipo">Tipo</label>
          <select class="select" id="tipo" name="tipo_comprobante">${TIPOS.map(([v, t]) => html`<option value="${v}" ${sel(v === 'factura_b')}>${t}</option>`)}</select>
        </div>
        <div class="fila-campos fila-campos--fijo2">
          <div class="campo"><label for="pv">Punto de venta</label><input class="input" id="pv" name="punto_venta" inputmode="numeric" maxlength="5" placeholder="0001"></div>
          <div class="campo"><label for="numero">Número</label><input class="input" id="numero" name="numero" inputmode="numeric" maxlength="8" placeholder="00001234"></div>
        </div>
        <div class="campo">
          <label for="cae">CAE <span class="muted chico">(14 números, abajo en la factura)</span></label>
          <input class="input" id="cae" name="cae" inputmode="numeric" maxlength="14" autocomplete="off" placeholder="Dejalo vacío si el comprobante no tiene CAE">
          <span class="campo__ayuda" id="cae-ayuda"></span>
        </div>
        <details>
          <summary class="muted chico" style="cursor:pointer;padding:6px 0">Más datos del comprobante (opcional)</summary>
          <div class="pila" style="margin-top:10px">
            <div class="fila-campos fila-campos--2">
              <div class="campo"><label for="fecha_comp">Fecha del comprobante</label><input class="input" type="date" id="fecha_comp" name="fecha_comprobante"></div>
              <div class="campo"><label for="cae_vto">Vencimiento del CAE</label><input class="input" type="date" id="cae_vto" name="cae_vto"></div>
            </div>
            <div class="campo"><label for="cuit_rec">CUIT receptor (el que figura en la factura)</label><input class="input" id="cuit_rec" name="cuit_receptor" inputmode="numeric" placeholder="${c.circulo.cuit ? fmtCuit(c.circulo.cuit) : ''}"></div>
          </div>
        </details>
        <div class="campo">
          <label for="desc">Detalle <span class="muted chico">(opcional)</span></label>
          <input class="input" id="desc" name="descripcion" maxlength="200" placeholder="Ej.: repuestos de la bomba de la pileta">
        </div>
      </section>

      <section class="paso" id="paso-ret" hidden></section>

      ${c.flags.adjuntos ? html`
      <section class="paso">
        <div class="paso__titulo"><span class="paso__n">${icono('foto')}</span>Foto del comprobante <span class="muted chico">(opcional)</span></div>
        <label class="adjuntar" id="adjuntar">
          ${icono('foto')}<span><strong>Sacar foto o elegir archivo</strong><br><small class="muted">Se achica sola y sube después de guardar. Si no hay señal, el gasto se guarda igual.</small></span>
          <input type="file" accept="image/*,application/pdf" id="foto">
        </label>
      </section>` : ''}

      <div class="carga__enviar"><button class="btn btn--principal btn--grande btn--ancho" type="submit" id="guardar">${icono('check')} Guardar gasto</button></div>
    </form>
  </div>`);

  const f = ctx.el.querySelector('#form-gasto');
  const $ = (s) => ctx.el.querySelector(s);
  mascaraPesos($('#bruto'));

  // ── Proveedor ─────────────────────────────────────────────────────────────
  function pintarProveedor() {
    const caja = $('#proveedor');
    if (est.proveedor) {
      pintar(caja, html`<div class="elegido"><div><strong>${est.proveedor.razon_social}</strong><small>CUIT ${fmtCuit(est.proveedor.cuit)}</small></div>
        <button class="btn btn--fantasma btn--chico" type="button" data-cambiar>Cambiar</button></div>`);
      caja.querySelector('[data-cambiar]').addEventListener('click', () => { est.proveedor = null; pintarProveedor(); caja.querySelector('input')?.focus(); });
      return;
    }
    pintar(caja, html`<div class="buscador">${raw(String(icono('buscar')).replace('<svg', '<svg class="lupa"'))}
      <input class="input" type="search" id="buscar-prov" placeholder="CUIT o nombre (Edenor, Starlink…)" autocomplete="off" aria-label="Buscar proveedor"></div>
      <div id="resultados"></div>`);
    const input = caja.querySelector('input');
    let t = null;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => buscar(input.value), 200); });
    buscar('');
  }
  async function buscar(q) {
    const res = $('#resultados');
    if (!res) return;
    try {
      const { proveedores } = await get(`/api/proveedores?q=${encodeURIComponent(q.trim())}`);
      const puedeAlta = ctx.puede('proveedores.alta');
      pintar(res, html`<div class="resultados">
        ${proveedores.slice(0, 8).map(p => html`<button type="button" data-id="${p.id}"><strong>${p.razon_social}</strong><small>CUIT ${fmtCuit(p.cuit)}</small></button>`)}
        ${!proveedores.length && q.trim() ? html`<p class="muted chico" style="padding:10px 12px">No está en la base del Círculo.</p>` : ''}
        ${puedeAlta ? html`<button type="button" data-alta>${icono('mas')} <strong>Dar de alta un proveedor nuevo</strong></button>`
          : !proveedores.length && q.trim() ? html`<p class="chico" style="padding:0 12px 10px">Pedile al administrativo de la sede que lo dé de alta.</p>` : ''}
      </div>`);
      res.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => {
        est.proveedor = proveedores.find(p => p.id === Number(b.dataset.id));
        pintarProveedor();
      }));
      res.querySelector('[data-alta]')?.addEventListener('click', async () => {
        const p = await altaProveedor(q);
        if (p) { est.proveedor = p; pintarProveedor(); }
      });
    } catch (e) { error(e); }
  }

  // ── Regla en vivo: fijo / caja chica / necesita solicitud ─────────────────
  const monto = () => parsePesos($('#bruto').value);
  const rubro = () => rubros.find(r => r.id === Number($('#rubro').value));
  const medio = () => (central ? 'transferencia' : f.querySelector('[name=medio]:checked').value);

  async function cargarAprobadas() {
    est.aprobadas = est.sedeId ? (await get(`/api/solicitudes/aprobadas?sede_id=${est.sedeId}&quien_paga=${central ? 'central' : 'sede'}`)).solicitudes : [];
  }

  function evaluar() {
    const m = monto(); const r = rubro(); const md = medio();
    const tope = md === 'efectivo' ? c.reglas.tope_efectivo : c.reglas.tope_transferencia;
    let regla = null;
    if (est.solicitud) regla = ['ok', 'check', 'Con solicitud aprobada', `Solicitud #${est.solicitud.id}: ${est.solicitud.descripcion}`];
    else if (!r || !m) regla = null;
    else if (r.fijo) regla = ['info', 'info', 'Gasto fijo', `${r.nombre_completo} es un servicio fijo: no necesita solicitud aunque supere los topes.`];
    else if (m <= tope) regla = ['ok', 'check', 'Sin solicitud (caja chica)', `Hasta ${pesos(tope)} ${md === 'efectivo' ? 'en efectivo' : 'por transferencia'} se paga directo del fondo.`];
    else regla = ['mal', 'alerta', 'Necesita una solicitud aprobada', `Supera el tope de caja chica (${pesos(tope)} ${md === 'efectivo' ? 'en efectivo' : 'por transferencia'}). ${est.aprobadas.length ? 'Elegí la solicitud aprobada que corresponde.' : central ? 'La sede tiene que pedir aprobación primero.' : 'Pedí aprobación a la Sede Central antes de pagar.'}`];
    pintar($('#regla'), regla ? html`<div class="regla regla--${regla[0]}">${icono(regla[1])}<div><strong>${regla[2]}</strong>${regla[3]}</div></div>` : '');

    // Solicitudes aprobadas para vincular (siempre que haya; obligatorio si supera el tope).
    const necesita = regla && regla[0] === 'mal';
    const caja = $('#solicitud');
    if (est.aprobadas.length && (necesita || est.solicitud || central)) {
      pintar(caja, html`<div class="campo"><label for="sol">Solicitud aprobada ${necesita ? '' : html`<span class="muted chico">(si corresponde)</span>`}</label>
        <select class="select" id="sol"><option value="">${necesita ? 'Elegí la solicitud…' : 'Sin solicitud'}</option>
        ${est.aprobadas.map(s => html`<option value="${s.id}" ${sel(est.solicitud?.id === s.id)}>#${s.id} · ${s.descripcion.slice(0, 60)} · ${pesos(s.monto_estimado)}</option>`)}</select></div>`);
      caja.querySelector('#sol').addEventListener('change', (e) => {
        est.solicitud = est.aprobadas.find(s => s.id === Number(e.target.value)) || null;
        if (est.solicitud) aplicarSolicitud(est.solicitud);
        evaluar();
      });
    } else if (necesita && !central && ctx.puede('solicitudes.crear')) {
      pintar(caja, html`<a class="btn btn--sec btn--ancho" href="#/solicitudes/nueva">${icono('solicitud')} Pedir aprobación a la Central</a>`);
    } else pintar(caja, '');

    // Retenciones: sólo sobre el umbral.
    const paso = $('#paso-ret');
    if (m && m > c.reglas.umbral_retencion) {
      paso.hidden = false;
      if (!puedeRet) {
        pintar(paso, html`<div class="regla regla--mal">${icono('candado')}<div><strong>Pago con control de retenciones</strong>Los pagos de más de ${pesos(c.reglas.umbral_retencion)} los registra el administrativo o el jefe de sede.</div></div>`);
      } else pintarRetenciones(m);
    } else { paso.hidden = true; est.ret = {}; pintar(paso, ''); }
    $('#guardar').disabled = !!(necesita && !est.solicitud) || !!(m && m > c.reglas.umbral_retencion && !puedeRet);
  }

  function aplicarSolicitud(s) {
    if (s.proveedor_id && !est.proveedor) { est.proveedor = { id: s.proveedor_id, razon_social: s.proveedor, cuit: s.proveedor_cuit }; pintarProveedor(); }
    if (s.rubro_id && !$('#rubro').value) $('#rubro').value = s.rubro_id;
    if (!$('#bruto').value) { $('#bruto').value = (s.monto_estimado / 100).toLocaleString('es-AR'); }
    if (!central && s.medio_previsto) { const r = f.querySelector(`[name=medio][value=${s.medio_previsto}]`); if (r) r.checked = true; }
  }

  function pintarRetenciones(bruto) {
    const paso = $('#paso-ret');
    const total = () => Object.values(est.ret).reduce((s, r) => s + (r.importe || 0), 0);
    const calcular = (imp) => {
      const r = est.ret[imp]; if (!r) return;
      const a = c.alicuotas.find(x => x.id === Number(r.alicuota_id));
      const base = r.base ?? bruto;
      r.importe = a ? Math.round(base * a.alicuota / 100000) : 0;
    };
    Object.keys(est.ret).forEach(calcular);
    pintar(paso, html`
      <div class="paso__titulo"><span class="paso__n">${icono('retencion')}</span>Retenciones</div>
      <p class="campo__ayuda">El pago supera ${pesos(c.reglas.umbral_retencion)}. Tildá los impuestos que hay que retener. Queda registrado quién los tildó.</p>
      ${IMPUESTOS.map(([imp, nombre]) => {
        const regs = c.alicuotas.filter(a => a.impuesto === imp);
        const r = est.ret[imp];
        return html`<div class="retencion">
          <label class="check"><input type="checkbox" data-imp="${imp}" ${r ? raw('checked') : ''} ${regs.length ? '' : raw('disabled')}>
            <span><strong>${nombre}</strong>${regs.length ? '' : html`<br><small class="muted">Falta cargar la alícuota en Administración → Parámetros.</small>`}</span></label>
          ${r ? html`<div class="retencion__detalle">
            <div class="campo"><label>Régimen${imp === 'iibb' ? ' y jurisdicción' : ''}</label>
              <select class="select" data-reg="${imp}">${regs.map(a => html`<option value="${a.id}" ${sel(Number(r.alicuota_id) === a.id)}>${a.regimen}${a.jurisdiccion ? ` · ${a.jurisdiccion}` : ''} · ${alicuota(a.alicuota)}</option>`)}</select></div>
            <div class="campo"><label>Base</label><input class="input" data-base="${imp}" inputmode="decimal" value="${((r.base ?? bruto) / 100).toLocaleString('es-AR')}"></div>
            <div class="campo"><label>Retención</label><input class="input" value="${pesos(r.importe, { decimales: true })}" disabled></div>
          </div>` : ''}
        </div>`;
      })}
      <div class="totales-ret">
        <span>Importe del comprobante</span><strong>${pesos(bruto, { decimales: true })}</strong>
        <span>Total retenido</span><strong>${pesos(total(), { decimales: true })}</strong>
        <span><b>Neto a transferir</b></span><strong>${pesos(bruto - total(), { decimales: true })}</strong>
      </div>`);
    paso.querySelectorAll('[data-imp]').forEach(ch => ch.addEventListener('change', () => {
      const imp = ch.dataset.imp;
      if (ch.checked) est.ret[imp] = { alicuota_id: c.alicuotas.find(a => a.impuesto === imp)?.id, base: null };
      else delete est.ret[imp];
      pintarRetenciones(bruto);
    }));
    paso.querySelectorAll('[data-reg]').forEach(s => s.addEventListener('change', () => { est.ret[s.dataset.reg].alicuota_id = Number(s.value); pintarRetenciones(bruto); }));
    paso.querySelectorAll('[data-base]').forEach(i => i.addEventListener('change', () => {
      const v = parsePesos(i.value);
      est.ret[i.dataset.base].base = v && v <= bruto ? v : null;
      pintarRetenciones(bruto);
    }));
  }

  // ── Eventos ───────────────────────────────────────────────────────────────
  ['#bruto', '#rubro'].forEach(s => $(s).addEventListener('input', evaluar));
  f.querySelectorAll('[name=medio]').forEach(r => r.addEventListener('change', evaluar));
  $('#sede')?.addEventListener('change', async (e) => { est.sedeId = Number(e.target.value) || null; est.solicitud = null; await cargarAprobadas(); evaluar(); });
  $('#cae').addEventListener('input', (e) => {
    e.target.value = soloDigitos(e.target.value).slice(0, 14);
    const n = e.target.value.length;
    $('#cae-ayuda').textContent = n && n < 14 ? `Van ${n} de 14 números` : '';
  });
  $('#foto')?.addEventListener('change', (e) => {
    est.foto = e.target.files[0] || null;
    const lbl = $('#adjuntar');
    lbl.querySelector('img')?.remove();
    if (est.foto?.type.startsWith('image/')) { const img = document.createElement('img'); img.src = URL.createObjectURL(est.foto); img.alt = ''; lbl.prepend(img); }
    lbl.querySelector('strong').textContent = est.foto ? est.foto.name : 'Sacar foto o elegir archivo';
  });

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    conBoton($('#guardar'), async () => {
      if (central && !est.sedeId) return toast('Elegí la sede', 'mal');
      if (!est.proveedor) return toast('Elegí el proveedor', 'mal');
      const bruto = monto();
      if (!bruto) { $('#bruto').setAttribute('aria-invalid', 'true'); return toast('Indicá el importe', 'mal'); }
      if (!rubro()) { $('#rubro').setAttribute('aria-invalid', 'true'); return toast('Elegí el rubro', 'mal'); }
      const d = Object.fromEntries(new FormData(f));
      const cuerpo = {
        pagado_por: central ? 'central' : 'sede', sede_id: est.sedeId, proveedor_id: est.proveedor.id, bruto, medio: medio(),
        fecha_pago: d.fecha_pago, rubro_id: Number(d.rubro_id), tipo_comprobante: d.tipo_comprobante, punto_venta: d.punto_venta, numero: d.numero,
        cae: d.cae, cae_vto: d.cae_vto || null, fecha_comprobante: d.fecha_comprobante || null, cuit_receptor: d.cuit_receptor || null,
        descripcion: d.descripcion, solicitud_id: est.solicitud?.id || null, adjunto_pendiente: !!est.foto,
        retenciones: Object.entries(est.ret).map(([impuesto, r]) => ({ impuesto, alicuota_id: r.alicuota_id, base: r.base }))
      };
      try {
        const r = await post('/api/gastos', cuerpo);
        if (est.foto) subirEnSegundoPlano('gasto', r.id, est.foto);
        listo(r, cuerpo);
      } catch (ex) {
        if (ex.codigo === 'DUPLICADO') {
          modal({ titulo: 'Comprobante repetido', contenido: html`<div class="pila"><div class="aviso aviso--mal">${icono('alerta')}<span>${ex.message}</span></div>
            <p class="chico muted">La sede y la Central ven este intento en la auditoría.</p>
            <div class="modal__acciones"><a class="btn btn--sec" href="#/gastos/${ex.datos?.gasto_id}" data-cerrar>Ver el gasto cargado</a><button class="btn btn--principal" data-cerrar type="button">Entendido</button></div></div>` });
        } else error(ex);
      }
    });
  });

  function listo(r, cuerpo) {
    pintar(ctx.el, html`<div class="vista"><div class="panel pila" style="max-width:560px;text-align:center;align-items:center;padding:28px 20px">
      <div class="item__icono" style="width:64px;height:64px;border-radius:50%;background:var(--verde-fondo);color:var(--verde)">${icono('check')}</div>
      <h1>Gasto #${r.id} guardado</h1>
      <p class="muted">${est.proveedor.razon_social} · ${pesos(cuerpo.bruto)} · ${fecha(cuerpo.fecha_pago)}</p>
      <div>${chipTipo(r.tipo_gasto)}</div>
      ${r.advertencias.length ? html`<div class="aviso" style="text-align:left">${icono('alerta')}<span>${r.advertencias.join(' ')}</span></div>` : ''}
      ${est.foto ? html`<p class="chico muted">La foto se está subiendo en segundo plano. Podés seguir cargando.</p>` : ''}
      <div class="fila" style="justify-content:center">
        ${r.certificado_id ? html`<a class="btn btn--sec" href="/api/certificados/${r.certificado_id}/pdf" target="_blank" rel="noopener">${icono('pdf')} Comprobante de retención</a>` : ''}
        <a class="btn btn--sec" href="#/gastos/${r.id}">Ver el gasto</a>
        <button class="btn btn--principal" type="button" data-otro>${icono('mas')} Cargar otro</button>
      </div></div></div>`);
    ctx.el.querySelector('[data-otro]').addEventListener('click', () => ctx.recargar());
  }

  await cargarAprobadas();
  if (deSolicitud) {
    est.solicitud = est.aprobadas.find(s => s.id === deSolicitud.id) || null;
    if (est.solicitud) aplicarSolicitud(est.solicitud);
  }
  pintarProveedor();
  evaluar();
}

export function agruparRubros(rubros, seleccionado = null) {
  const grupos = [];
  for (const r of rubros) {
    const g = r.padre_nombre || null;
    let grupo = grupos[grupos.length - 1];
    if (!grupo || grupo.nombre !== g) { grupo = { nombre: g, items: [] }; grupos.push(grupo); }
    grupo.items.push(r);
  }
  return grupos.map(g => g.nombre
    ? html`<optgroup label="${g.nombre}">${g.items.map(r => html`<option value="${r.id}" ${sel(r.id === seleccionado)}>${r.nombre}${r.fijo ? ' (fijo)' : ''}</option>`)}</optgroup>`
    : g.items.map(r => html`<option value="${r.id}" ${sel(r.id === seleccionado)}>${r.nombre}${r.fijo ? ' (fijo)' : ''}</option>`));
}
