import {
  get, post, put, html, raw, pintar, icono, pesos, horas, tac, parseTac, tambor, rodar, hoyAR, colorAvion, error, conBoton, nombrePeriodo, datosForm
} from '../lib.js';

export default async function cargar(ctx) {
  const editando = ctx.params.id ? Number(ctx.params.id) : null;
  const pedidos = [get('/api/aviones'), get('/api/instructores')];
  if (ctx.esAdmin) pedidos.push(get('/api/admin/usuarios'));
  if (editando) pedidos.push(get(`/api/vuelos/${editando}`));
  const [{ aviones }, { instructores }, socios, detalle] = await Promise.all([
    pedidos[0], pedidos[1], ctx.esAdmin ? pedidos[2] : null, editando ? pedidos[ctx.esAdmin ? 3 : 2] : null
  ]);
  const previo = detalle?.vuelo || null;
  if (previo && previo.estado !== 'abierto') throw new Error('Ese vuelo ya no se puede corregir: entró en el cierre o está anulado.');

  // En edición puede figurar un avión dado de baja: lo sumamos para poder mostrarlo.
  const lista = [...aviones];
  if (previo && !lista.some(a => a.id === previo.avion_id)) {
    lista.push({ id: previo.avion_id, matricula: previo.matricula, modelo: previo.modelo, tac_actual: previo.tac_final, tarifas: {}, orden: 9 });
  }
  if (!lista.length) {
    pintar(ctx.el, html`<div class="vacio"><p>No hay aviones activos. Tesorería tiene que dar de alta la flota.</p></div>`);
    return;
  }

  const estado = {
    avionId: previo?.avion_id ?? (lista.length === 1 ? lista[0].id : null),
    tipo: previo?.tipo ?? 'solo',
    pilotoId: previo?.piloto_id ?? ctx.usuario.id
  };
  const avion = () => lista.find(a => a.id === estado.avionId);
  const pilotos = socios ? socios.usuarios.filter(u => u.activo || u.id === previo?.piloto_id) : null;

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab"><div>
      ${editando ? html`<a class="volver" href="#/vuelos">${icono('izq')} Mis vuelos</a>` : ''}
      <h1>${editando ? 'Corregir vuelo' : 'Cargar vuelo'}</h1>
      <p>${editando ? 'Podés corregirlo hasta el cierre del mes. El cambio queda registrado.' : 'Anotá el tacómetro apenas bajes del avión.'}</p>
    </div></div>

    <form class="carga" id="form-vuelo" novalidate>
      ${pilotos ? html`
        <div class="carga__paso">
          <h2>¿Quién voló?</h2>
          <select class="select" name="piloto_id" id="piloto">
            ${pilotos.map(u => html`<option value="${u.id}" ${u.id === estado.pilotoId ? raw('selected') : ''}>${u.apellido}, ${u.nombre}${u.id === ctx.usuario.id ? ' (yo)' : ''}</option>`)}
          </select>
        </div>` : ''}

      <fieldset class="carga__paso" style="border:0;padding:0;margin:0">
        <legend class="sr">Avión</legend>
        <h2 aria-hidden="true"><span class="num">1</span> Avión</h2>
        <div class="aviones-opc">
          ${lista.map(a => html`
            <label class="avion-opc" style="--serie:${colorAvion(a.orden)}">
              <input type="radio" name="avion_id" value="${a.id}" ${a.id === estado.avionId ? raw('checked') : ''}>
              <span class="avion-opc__caja">
                <span class="avion-opc__fila"><span><span class="matricula">${a.matricula}</span><br><small>${a.modelo}</small></span><span class="avion-opc__check">${icono('check')}</span></span>
                <span class="avion-opc__fila"><small>Último tacómetro</small>${tambor(a.tac_actual, { tam: 'chico' })}</span>
              </span>
            </label>`)}
        </div>
      </fieldset>

      <div class="carga__paso">
        <h2><span class="num">2</span> <label for="fecha">Fecha</label></h2>
        <input class="input" type="date" id="fecha" name="fecha" value="${previo?.fecha || hoyAR()}" max="${hoyAR()}" required>
      </div>

      <div class="carga__paso">
        <h2><span class="num">3</span> Tacómetro</h2>
        <div class="lecturas">
          <div class="campo"><label for="tac_inicial">Al encender</label>
            <input class="input input--tac" id="tac_inicial" name="tac_inicial" inputmode="decimal" autocomplete="off" placeholder="0000,0" value="${previo ? tac(previo.tac_inicial) : avion() ? tac(avion().tac_actual) : ''}" required></div>
          <span class="lecturas__flecha">${icono('flecha')}</span>
          <div class="campo"><label for="tac_final">Al cortar</label>
            <input class="input input--tac" id="tac_final" name="tac_final" inputmode="decimal" autocomplete="off" placeholder="0000,0" value="${previo ? tac(previo.tac_final) : ''}" required></div>
        </div>
        <p class="campo__ayuda" id="ayuda-tac">Con un decimal, como lo marca el instrumento (ej.: 2345,6).</p>
        <div class="resultado" id="resultado" aria-live="polite"></div>
      </div>

      <fieldset class="carga__paso" style="border:0;padding:0;margin:0">
        <legend class="sr">Tipo de vuelo</legend>
        <h2 aria-hidden="true"><span class="num">4</span> ¿Volaste con instructor?</h2>
        <div class="segmentado" id="tipos"></div>
        <div class="campo" id="campo-instructor" hidden>
          <label for="instructor">Instructor</label>
          <select class="select" id="instructor" name="instructor_id">
            <option value="">Elegí el instructor</option>
            ${instructores.map(i => html`<option value="${i.id}" ${i.id === previo?.instructor_id ? raw('selected') : ''}>${i.nombre} ${i.apellido}</option>`)}
          </select>
        </div>
      </fieldset>

      <div class="carga__paso">
        <h2><span class="num">5</span> <label for="notas">Novedades y notas</label></h2>
        <textarea class="textarea" id="notas" name="notas" maxlength="1000" placeholder="Ej.: aceite 5 qt, cubierta izquierda baja, ruido en la radio">${previo?.notas || ''}</textarea>
        <p class="campo__ayuda">Lo que anotes acá le llega a tesorería y a mantenimiento.</p>
      </div>

      <p class="aviso aviso--mal" id="error-carga" role="alert" hidden></p>
      <div class="carga__enviar"><button class="btn btn--principal btn--grande btn--ancho" type="submit">${icono('check')} ${editando ? 'Guardar corrección' : 'Guardar vuelo'}</button></div>
    </form>
  </div>`);

  const form = ctx.el.querySelector('#form-vuelo');
  const $ini = form.tac_inicial;
  const $fin = form.tac_final;
  const $res = ctx.el.querySelector('#resultado');
  const $tipos = ctx.el.querySelector('#tipos');
  const $campoInst = ctx.el.querySelector('#campo-instructor');
  const $inst = form.instructor_id;
  const $err = ctx.el.querySelector('#error-carga');

  function pintarTipos() {
    const t = avion()?.tarifas || {};
    const opc = [['solo', 'Sin instructor', t.solo], ['instruccion', 'Con instructor', t.instruccion]];
    pintar($tipos, opc.map(([v, txt, precio]) => html`
      <label><input type="radio" name="tipo" value="${v}" ${estado.tipo === v ? raw('checked') : ''}>
        <span>${txt}<small>${precio ? `${pesos(precio)} la hora` : avion() ? 'Sin tarifa cargada' : 'Elegí el avión'}</small></span></label>`));
    $campoInst.hidden = estado.tipo !== 'instruccion';
    // No te podés elegir a vos mismo como instructor.
    const yo = estado.pilotoId;
    for (const o of $inst.options) o.hidden = o.disabled = !!o.value && Number(o.value) === yo;
    if (Number($inst.value) === yo) $inst.value = '';
  }

  function calcular() {
    const ini = parseTac($ini.value);
    const fin = parseTac($fin.value);
    const a = avion();
    const precio = a?.tarifas?.[estado.tipo];
    $ini.setAttribute('aria-invalid', $ini.value && ini == null ? 'true' : 'false');
    $fin.setAttribute('aria-invalid', $fin.value && (fin == null || (ini != null && fin <= ini)) ? 'true' : 'false');
    const ok = ini != null && fin != null && fin > ini;
    const dec = ok ? fin - ini : 0;
    const importe = ok && precio ? Math.round(precio * dec / 10) : null;
    $res.classList.toggle('resultado--vacio', !ok);
    pintar($res, html`
      <div><span>Tiempo de vuelo</span><strong>${ok ? horas(dec) : '—'}</strong><small>${ok && dec > 60 ? 'Revisá: es un vuelo muy largo' : ok ? `${Math.round(dec * 6)} minutos` : 'Completá el tacómetro final'}</small></div>
      <div><span>Importe</span><strong>${importe != null ? pesos(importe) : '—'}</strong><small>${precio ? 'Se suma en el cierre del mes' : a ? 'Falta la tarifa de este avión' : 'Elegí el avión'}</small></div>`);
  }

  form.addEventListener('change', (e) => {
    if (e.target.name === 'avion_id') {
      estado.avionId = Number(e.target.value);
      if (!editando) $ini.value = tac(avion().tac_actual);
      pintarTipos();
      if (!editando) $fin.focus();
    }
    if (e.target.name === 'tipo') { estado.tipo = e.target.value; pintarTipos(); if (estado.tipo === 'instruccion') $inst.focus(); }
    if (e.target.name === 'piloto_id') { estado.pilotoId = Number(e.target.value); pintarTipos(); }
    calcular();
  });
  form.addEventListener('input', (e) => { if (e.target === $ini || e.target === $fin) calcular(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    $err.hidden = true;
    const d = datosForm(form);
    const falta = !estado.avionId ? 'Elegí el avión.'
      : parseTac($ini.value) == null ? 'Revisá el tacómetro al encender (un decimal, ej.: 2345,6).'
      : parseTac($fin.value) == null ? 'Completá el tacómetro al cortar.'
      : parseTac($fin.value) <= parseTac($ini.value) ? 'El tacómetro al cortar tiene que ser mayor que al encender.'
      : estado.tipo === 'instruccion' && !d.instructor_id ? 'Elegí qué instructor voló con vos.'
      : null;
    if (falta) { $err.textContent = falta; $err.hidden = false; $err.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }

    const cuerpo = {
      avion_id: estado.avionId, fecha: d.fecha, tac_inicial: d.tac_inicial, tac_final: d.tac_final,
      con_instructor: estado.tipo === 'instruccion', instructor_id: estado.tipo === 'instruccion' ? Number(d.instructor_id) : null,
      notas: d.notas
    };
    if (ctx.esAdmin) cuerpo.piloto_id = estado.pilotoId;

    await conBoton(form.querySelector('[type=submit]'), async () => {
      try {
        const r = editando ? await put(`/api/vuelos/${editando}`, cuerpo) : await post('/api/vuelos', cuerpo);
        listo(ctx, r, !!editando);
      } catch (err) {
        $err.textContent = err.message;
        $err.hidden = false;
        $err.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
  });

  pintarTipos();
  calcular();
}

function listo(ctx, { vuelo: v, avisos }, editado) {
  const periodo = v.fecha.slice(0, 7);
  pintar(ctx.el, html`
    <div class="vista" style="justify-items:center">
      <div class="listo">
        <span class="listo__icono">${icono('check')}</span>
        <h1>${editado ? 'Corrección guardada' : 'Vuelo guardado'}</h1>
        ${tambor(v.tac_final, { tam: 'grande', desde: v.tac_inicial })}
        <div class="listo__resumen">
          <p><strong class="matricula">${v.matricula}</strong>, ${horas(v.decimas)} ${v.tipo === 'instruccion' ? `con ${v.instructor}` : 'sin instructor'}${ctx.esAdmin && v.piloto_id !== ctx.usuario.id ? `, a nombre de ${v.piloto}` : ''}</p>
          <p class="muted">${pesos(v.importe)} a facturar en el cierre de ${nombrePeriodo(periodo)}</p>
        </div>
        ${avisos.map(a => html`<p class="aviso">${icono('info')}<span>${a}</span></p>`)}
        <div class="listo__acciones">
          <a class="btn btn--sec" href="${ctx.esAdmin ? '#/admin/vuelos' : '#/vuelos'}">${ctx.esAdmin ? 'Ver vuelos' : 'Ver mis vuelos'}</a>
          <a class="btn btn--principal" href="#/cargar" data-otro>${icono('mas')} Cargar otro</a>
        </div>
      </div>
    </div>`);
  rodar(ctx.el);
  ctx.el.querySelector('[data-otro]').addEventListener('click', (e) => { if (location.hash === '#/cargar') { e.preventDefault(); ctx.recargar(); } });
  window.scrollTo({ top: 0 });
}
