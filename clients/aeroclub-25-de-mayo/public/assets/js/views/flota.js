import {
  get, post, put, html, raw, pintar, icono, pesos, horas, tac, fecha, tambor, colorAvion, modal, pedirTexto, toast, error, conBoton,
  datosForm, hoyAR, pesosInput
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
      <div class="fila-campos">
        <div class="campo"><label for="av-base">Tacómetro al empezar a usar el sistema</label><input class="input" id="av-base" name="tac_base" inputmode="decimal" value="${a.tac_base != null ? tac(a.tac_base) : ''}" placeholder="2345,6">
          <p class="campo__ayuda">Punto de partida del control. Se puede cambiar sólo mientras no haya vuelos.</p></div>
        <div class="campo"><label for="av-insp">Tacómetro de la próxima inspección</label><input class="input" id="av-insp" name="proxima_inspeccion" inputmode="decimal" value="${a.proxima_inspeccion != null ? tac(a.proxima_inspeccion) : ''}" placeholder="Ej.: 2400,0">
          <p class="campo__ayuda">Opcional. El panel avisa cuando falten menos de 10 h.</p></div>
      </div>
      ${nuevo ? '' : html`<label class="check"><input type="checkbox" name="activo" ${a.activo ? raw('checked') : ''}><span>En servicio<br><small class="muted">Si lo sacás de servicio, no aparece para cargar vuelos.</small></span></label>`}
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
          ${tambor(a.tac_actual)}
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
            <h3>Tacómetro</h3>
            <dl class="detalle">
              <dt>Lectura actual</dt><dd>${tac(a.tac_actual)}</dd>
              <dt>Al empezar en el sistema</dt><dd>${tac(a.tac_base)}</dd>
              <dt>Próxima inspección</dt><dd>${a.proxima_inspeccion != null ? html`${tac(a.proxima_inspeccion)} <span class="muted">(${a.inspeccion_restante > 0 ? `faltan ${horas(a.inspeccion_restante)}` : 'vencida'})</span>` : html`<span class="muted">Sin cargar</span>`}</dd>
              <dt>Tramos sin cargar</dt><dd>${a.huecos ? html`<span class="chip chip--pend">${a.huecos}</span>` : html`<span class="chip chip--ok">Ninguno</span>`}</dd>
            </dl>
            <div class="vista__acciones">
              <a class="btn btn--sec btn--chico" href="#/admin/flota/${a.id}/tacometro">${icono('reloj')} Control del tacómetro</a>
              <button class="btn btn--fantasma btn--chico" type="button" data-editar="${a.id}">${icono('editar')} Editar avión</button>
            </div>
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

export async function tacometro(ctx) {
  const d = await get(`/api/admin/aviones/${ctx.params.id}/tacometro`);
  const a = d.avion;
  const tramos = [...d.tramos].reverse();

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab">
      <div><a class="volver" href="#/admin/flota">${icono('izq')} Flota</a><h1>Tacómetro de <span class="matricula">${a.matricula}</span></h1>
        <p>Cada décima del tacómetro tiene que estar en un vuelo cargado o justificada. Así no queda ninguna hora sin cobrar.</p></div>
      ${tambor(d.tac_actual, { tam: 'grande' })}
    </div>

    ${d.huecos.length ? html`
      <section class="panel">
        <div class="panel__cab"><h2>Tramos sin cargar</h2><p>Si alguien se olvidó de cargar, pedile que lo haga o cargalo vos a su nombre. Si fue un vuelo del club (prueba, traslado), justificalo.</p></div>
        <div class="tabla-caja"><table class="tabla">
          <thead><tr><th>Tramo</th><th class="num">Horas</th><th>Entre</th><th></th></tr></thead>
          <tbody>${d.huecos.map((h, i) => html`<tr>
            <td><strong>${tac(h.desde)} a ${tac(h.hasta)}</strong></td>
            <td class="num">${horas(h.decimas)}</td>
            <td class="chico">${h.antes ? `${h.antes.detalle} (${fecha(h.antes.fecha)})` : 'Alta en el sistema'}<br>y ${h.despues.detalle} (${fecha(h.despues.fecha)})</td>
            <td><div class="tabla__acciones">
              <a class="btn btn--sec btn--chico" href="#/cargar">${icono('mas')} Cargar vuelo</a>
              <button class="btn btn--fantasma btn--chico" type="button" data-justificar="${i}">Justificar</button>
            </div></td></tr>`)}</tbody></table></div>
      </section>` : html`<p class="aviso aviso--ok">${icono('check')}<span>El tacómetro está completo: no hay tramos sin cargar.</span></p>`}

    <section class="panel">
      <div class="panel__cab"><h2>Registro del tacómetro</h2></div>
      ${tramos.length ? html`<div class="tabla-caja"><table class="tabla">
        <thead><tr><th>Desde</th><th>Hasta</th><th class="num">Horas</th><th>Fecha</th><th>Detalle</th></tr></thead>
        <tbody>${tramos.map(t => html`<tr>
          <td>${tac(t.desde)}</td><td>${tac(t.hasta)}</td><td class="num">${horas(t.hasta - t.desde)}</td><td>${fecha(t.fecha)}</td>
          <td>${t.clase === 'justificado' ? html`<span class="chip chip--neutro">Justificado</span> ${t.detalle}` : t.detalle}</td></tr>`)}</tbody>
        <tfoot><tr><td colspan="5" class="muted chico">Lectura al empezar en el sistema: ${tac(d.tac_base)}</td></tr></tfoot>
      </table></div>` : html`<p class="muted">Todavía no hay vuelos en este avión.</p>`}
    </section>
  </div>`);

  ctx.el.addEventListener('click', async (e) => {
    const j = e.target.closest('[data-justificar]');
    if (!j) return;
    const h = d.huecos[Number(j.dataset.justificar)];
    const motivo = await pedirTexto({
      titulo: `Justificar ${tac(h.desde)} a ${tac(h.hasta)}`,
      texto: `${horas(h.decimas)} que no se le cobran a ningún socio. Queda registrado con tu nombre.`,
      label: 'Motivo', placeholder: 'Ej.: prueba de motor después del service', boton: 'Justificar'
    });
    if (!motivo) return;
    try {
      await post(`/api/admin/aviones/${a.id}/tacometro/justificar`, { desde: h.desde, hasta: h.hasta, motivo });
      toast('Tramo justificado', 'ok');
      ctx.recargar();
    } catch (err) { error(err); }
  });
}
