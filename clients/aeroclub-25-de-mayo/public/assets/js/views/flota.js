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
  const { aviones } = await get('/api/admin/aviones');

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab">
      <div><h1>Flota y tarifas</h1><p>Precios por hora, con nafta incluida. Cada cambio queda con fecha y autor.</p></div>
      <div class="vista__acciones"><button class="btn btn--sec" type="button" data-nuevo>${icono('mas')} Agregar avión</button></div>
    </div>
    ${aviones.map(a => html`
      <section class="panel" style="--serie:${colorAvion(a.orden)}">
        <div class="avion__cab" style="margin-bottom:18px;flex-wrap:wrap">
          <span class="avion__marca" style="min-height:44px"></span>
          <div><span class="matricula" style="font-size:1.6rem">${a.matricula}</span><small>${a.modelo}${a.activo ? '' : ' (fuera de servicio)'}</small></div>
          <button class="btn btn--fantasma btn--chico" type="button" data-editar="${a.id}" style="margin-left:auto">${icono('editar')} Editar avión</button>
        </div>
        <div class="grilla grilla--2">
          <div class="pila" style="gap:10px">
            <h3>Tarifas vigentes</h3>
            <div class="resultado">
              <div><span>Sin instructor</span><strong>${a.tarifas.solo ? pesos(a.tarifas.solo) : '—'}</strong><small>por hora</small></div>
              <div><span>Con instructor</span><strong>${a.tarifas.instruccion ? pesos(a.tarifas.instruccion) : '—'}</strong><small>por hora</small></div>
            </div>
            ${!a.tarifas.solo || !a.tarifas.instruccion ? html`<p class="aviso">${icono('alerta')}<span>Falta cargar una tarifa: los pilotos no van a poder cargar ese tipo de vuelo.</span></p>` : ''}
            <div class="vista__acciones"><button class="btn btn--principal btn--chico" type="button" data-tarifa="${a.id}">${icono('editar')} Cambiar tarifa</button></div>
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
  </div>`);

  ctx.el.addEventListener('click', (e) => {
    if (e.target.closest('[data-nuevo]')) return modalAvion(null, ctx);
    const t = e.target.closest('[data-tarifa]');
    if (t) return modalTarifa(aviones.find(a => a.id === Number(t.dataset.tarifa)), ctx);
    const ed = e.target.closest('[data-editar]');
    if (ed) modalAvion(aviones.find(a => a.id === Number(ed.dataset.editar)), ctx);
  });
}
