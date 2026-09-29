import {
  get, post, put, html, raw, pintar, icono, pesos, horas, fecha, colorAvion, modal, toast, error, conBoton, datosForm, hoyAR, pesosInput
} from '../lib.js';

function modalTarifa(a, ctx) {
  const m = modal({
    titulo: `Cambiar tarifa de ${a.matricula}`,
    subtitulo: 'La tarifa anterior queda en el historial. Cada vuelo guarda el precio del día en que se voló.',
    contenido: html`<form class="form" novalidate>
      <div class="segmentado">
        <label><input type="radio" name="tipo" value="solo" checked><span>Sin instructor<small>Hoy ${a.tarifas.solo ? pesos(a.tarifas.solo) : 'sin tarifa'}</small></span></label>
        <label><input type="radio" name="tipo" value="instruccion"><span>Con instructor<small>Hoy ${a.tarifas.instruccion ? pesos(a.tarifas.instruccion) : 'sin tarifa'}</small></span></label>
      </div>
      <div class="fila-campos">
        <div class="campo"><label for="t-precio">Precio por hora</label><input class="input" id="t-precio" name="precio_hora" inputmode="decimal" placeholder="Ej.: 95.000" required autofocus value="${pesosInput(a.tarifas.solo)}"></div>
        <div class="campo"><label for="t-desde">Vigente desde</label><input class="input" id="t-desde" type="date" name="vigente_desde" value="${hoyAR()}" required></div>
      </div>
      <label class="check"><input type="checkbox" name="aplicar_abiertos"><span>Aplicarla también a los vuelos todavía no facturados desde esa fecha<br><small class="muted">Si no la marcás, sólo afecta a los vuelos que se carguen de ahora en más.</small></span></label>
      <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">Guardar tarifa</button></div>
    </form>`
  });
  const form = m.el.querySelector('form');
  form.addEventListener('change', (e) => {
    if (e.target.name === 'tipo') form.precio_hora.value = pesosInput(a.tarifas[e.target.value]);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    conBoton(form.querySelector('[type=submit]'), async () => {
      try {
        const r = await post(`/api/admin/aviones/${a.id}/tarifas`, datosForm(form));
        toast(r.repreciados ? `Tarifa guardada. Se actualizaron ${r.repreciados} vuelos.` : 'Tarifa guardada', 'ok');
        m.cerrar();
        ctx.recargar();
      } catch (err) { error(err); }
    });
  });
}

const UNIDADES = { unidad: 'Por unidad', hora: 'Por hora', litro: 'Por litro', dia: 'Por día', mes: 'Por mes' };

function modalServicio(s, ctx) {
  const nuevo = !s;
  s = s || { activo: 1, unidad: 'unidad', precio: 0 };
  const m = modal({
    titulo: nuevo ? 'Agregar servicio' : `Editar ${s.nombre}`,
    subtitulo: 'El precio nuevo se usa en los tickets que se hagan de ahora en más. Los ya hechos no cambian.',
    contenido: html`<form class="form" novalidate>
      <div class="campo"><label for="sv-nom">Nombre</label><input class="input" id="sv-nom" name="nombre" value="${s.nombre || ''}" required ${s.codigo ? raw('readonly') : raw('autofocus')}></div>
      <div class="fila-campos">
        <div class="campo"><label for="sv-precio">Precio</label><input class="input" id="sv-precio" name="precio" inputmode="decimal" value="${pesosInput(s.precio)}" placeholder="Ej.: 2.500" ${s.codigo ? raw('autofocus') : ''}></div>
        <div class="campo"><label for="sv-uni">Se cobra</label><select class="select" id="sv-uni" name="unidad">${Object.entries(UNIDADES).map(([v, t]) => html`<option value="${v}" ${v === s.unidad ? raw('selected') : ''}>${t}</option>`)}</select></div>
      </div>
      ${s.codigo === 'derecho_aeronave' ? html`<p class="aviso aviso--info">${icono('info')}<span>Se cobra solo en el cierre: una vez por mes a cada piloto que voló. Con precio en cero, no se cobra.</span></p>` : ''}
      ${nuevo ? '' : html`<label class="check"><input type="checkbox" name="activo" ${s.activo ? raw('checked') : ''}><span>Activo<br><small class="muted">Si lo das de baja, no aparece para cargar tickets. Lo ya cobrado se conserva.</small></span></label>`}
      <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">${nuevo ? 'Agregar' : 'Guardar'}</button></div>
    </form>`
  });
  const form = m.el.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = datosForm(form);
    if (!nuevo) d.activo = !!d.activo;
    conBoton(form.querySelector('[type=submit]'), async () => {
      try {
        if (nuevo) await post('/api/admin/servicios', d); else await put(`/api/admin/servicios/${s.id}`, d);
        toast(nuevo ? 'Servicio agregado' : 'Servicio actualizado', 'ok');
        m.cerrar();
        ctx.recargar();
      } catch (err) { error(err); }
    });
  });
}

function seccionServicios(servicios) {
  return html`<section class="panel" id="servicios">
    <div class="panel__cab"><div><h2>Servicios</h2><p>Lo que se cobra aparte de las horas de vuelo: rampa los carga en tickets y tesorería los suma a la cuenta de cualquiera.</p></div>
      <button class="btn btn--sec btn--chico" type="button" data-nuevo-servicio data-escritura>${icono('mas')} Agregar servicio</button></div>
    <div class="tabla-caja"><table class="tabla tabla--tarjetas">
      <thead><tr><th>Servicio</th><th class="num">Precio</th><th>Se cobra</th><th></th></tr></thead>
      <tbody>${servicios.map(s => html`<tr ${s.activo ? '' : raw('style="opacity:.55"')}>
        <td class="celda-ppal"><strong>${s.nombre}</strong>${s.activo ? '' : html` <span class="chip chip--neutro">Baja</span>`}${s.codigo === 'derecho_aeronave' ? html`<div class="muted chico">Automático en el cierre, una vez por mes por piloto</div>` : ''}</td>
        <td class="num" data-label="Precio">${s.precio ? html`<span class="monto">${pesos(s.precio)}</span>` : html`<span class="chip chip--pend">Sin precio</span>`}</td>
        <td data-label="Se cobra">${UNIDADES[s.unidad]}</td>
        <td class="celda-acciones"><div class="tabla__acciones"><button class="btn btn--sec btn--chico" type="button" data-servicio="${s.id}" data-escritura>${icono('editar')} ${s.precio ? 'Cambiar precio' : 'Poner precio'}</button></div></td>
      </tr>`)}</tbody>
    </table></div>
  </section>`;
}

function modalAvion(a, ctx) {
  const nuevo = !a;
  a = a || { activo: 1 };
  const m = modal({
    titulo: nuevo ? 'Agregar avión' : `Editar ${a.matricula}`,
    contenido: html`<form class="form" novalidate>
      <div class="fila-campos">
        <div class="campo"><label for="av-mat">Matrícula</label><input class="input" id="av-mat" name="matricula" value="${a.matricula || ''}" placeholder="LV-ABC" required autofocus></div>
        <div class="campo"><label for="av-mod">Modelo</label><input class="input" id="av-mod" name="modelo" value="${a.modelo || ''}" placeholder="Cessna 152" required></div>
      </div>
      ${nuevo ? '' : html`<label class="check"><input type="checkbox" name="activo" ${a.activo ? raw('checked') : ''}><span>En servicio<br><small class="muted">Si lo sacás de servicio, no aparece para cargar vuelos. Su historial se conserva.</small></span></label>`}
      <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">${nuevo ? 'Agregar' : 'Guardar'}</button></div>
    </form>`
  });
  const form = m.el.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = datosForm(form);
    if (!nuevo) d.activo = !!d.activo;
    conBoton(form.querySelector('[type=submit]'), async () => {
      try {
        if (nuevo) await post('/api/admin/aviones', d); else await put(`/api/admin/aviones/${a.id}`, d);
        toast(nuevo ? 'Avión agregado' : 'Avión actualizado', 'ok');
        m.cerrar();
        ctx.recargar();
      } catch (err) { error(err); }
    });
  });
}

export async function flota(ctx) {
  const [{ aviones }, { servicios }] = await Promise.all([get('/api/admin/aviones'), get('/api/admin/servicios')]);

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab">
      <div><h1>Flota y tarifas</h1><p>Precios por hora de vuelo, con nafta incluida, y precios de los servicios. Cada cambio queda con fecha y autor.</p></div>
      <div class="vista__acciones"><button class="btn btn--sec" type="button" data-nuevo data-escritura>${icono('mas')} Agregar avión</button></div>
    </div>
    ${aviones.map(a => html`
      <section class="panel" style="--serie:${colorAvion(a.orden)}">
        <div class="avion__cab" style="margin-bottom:18px;flex-wrap:wrap">
          <span class="avion__marca" style="min-height:44px"></span>
          <div><span class="matricula" style="font-size:1.6rem">${a.matricula}</span><small>${a.modelo}${a.activo ? '' : ' (fuera de servicio)'}</small></div>
          <button class="btn btn--fantasma btn--chico" type="button" data-editar="${a.id}" data-escritura style="margin-left:auto">${icono('editar')} Editar avión</button>
        </div>
        <div class="grilla grilla--2">
          <div class="pila" style="gap:10px">
            <h3>Tarifas vigentes</h3>
            <div class="resultado">
              <div><span>Sin instructor</span><strong>${a.tarifas.solo ? pesos(a.tarifas.solo) : '—'}</strong><small>por hora</small></div>
              <div><span>Con instructor</span><strong>${a.tarifas.instruccion ? pesos(a.tarifas.instruccion) : '—'}</strong><small>por hora</small></div>
            </div>
            ${!a.tarifas.solo || !a.tarifas.instruccion ? html`<p class="aviso">${icono('alerta')}<span>Falta cargar una tarifa: los pilotos no van a poder cargar ese tipo de vuelo.</span></p>` : ''}
            <div class="vista__acciones" data-escritura><button class="btn btn--principal btn--chico" type="button" data-tarifa="${a.id}">${icono('editar')} Cambiar tarifa</button></div>
            ${a.historial_tarifas.length ? html`<details><summary class="chico" style="cursor:pointer;color:var(--azul);font-weight:600">Historial de tarifas (${a.historial_tarifas.length})</summary>
              <div class="tabla-caja" style="margin-top:8px"><table class="tabla"><thead><tr><th>Desde</th><th>Tipo</th><th class="num">Precio/h</th><th>Cargada por</th></tr></thead>
              <tbody>${a.historial_tarifas.map(t => html`<tr><td>${fecha(t.vigente_desde)}</td><td>${t.tipo === 'solo' ? 'Sin instructor' : 'Con instructor'}</td><td class="num">${pesos(t.precio_hora)}</td><td class="muted chico">${t.autor || '—'}</td></tr>`)}</tbody></table></div></details>` : ''}
          </div>
          <div class="pila" style="gap:10px">
            <h3>Uso</h3>
            <dl class="detalle">
              <dt>Este mes</dt><dd>${horas(a.mes_decimas)} en ${a.mes_vuelos} ${a.mes_vuelos === 1 ? 'vuelo' : 'vuelos'}</dd>
              <dt>Desde que se usa el sistema</dt><dd>${horas(a.total_decimas)}</dd>
              <dt>Último vuelo</dt><dd>${a.ultimo_vuelo ? fecha(a.ultimo_vuelo) : html`<span class="muted">Todavía no voló</span>`}</dd>
            </dl>
            <div class="vista__acciones"><a class="btn btn--sec btn--chico" href="#/admin/vuelos?avion_id=${a.id}">${icono('lista')} Ver sus vuelos</a></div>
          </div>
        </div>
      </section>`)}
    ${seccionServicios(servicios)}
  </div>`);

  ctx.el.addEventListener('click', (e) => {
    if (e.target.closest('[data-nuevo-servicio]')) return modalServicio(null, ctx);
    const sv = e.target.closest('[data-servicio]');
    if (sv) return modalServicio(servicios.find(s => s.id === Number(sv.dataset.servicio)), ctx);
    if (e.target.closest('[data-nuevo]')) return modalAvion(null, ctx);
    const t = e.target.closest('[data-tarifa]');
    if (t) return modalTarifa(aviones.find(a => a.id === Number(t.dataset.tarifa)), ctx);
    const ed = e.target.closest('[data-editar]');
    if (ed) modalAvion(aviones.find(a => a.id === Number(ed.dataset.editar)), ctx);
  });
}
