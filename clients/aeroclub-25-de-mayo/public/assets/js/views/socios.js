import {
  get, post, put, html, raw, pintar, icono, pesos, modal, confirmar, pedirTexto, toast, error, conBoton, datosForm, fechaHora, linkWa, nombreLista, rolTexto
} from '../lib.js';

const PARA_QUE = {
  piloto: 'cargar tus vuelos', admin: 'administrar el club', consulta: 'consultar la administración del club', rampa: 'cargar tickets de servicios en la rampa'
};

function waCredenciales(u, password) {
  return linkWa(u.telefono, `Hola ${u.nombre}. Ya tenés usuario en el sistema del Aeroclub 25 de Mayo para ${PARA_QUE[u.rol] || PARA_QUE.piloto}.\n\nEntrá en ${location.origin}\nEmail: ${u.email}\nContraseña temporal: ${password}\n\nAl entrar te va a pedir que elijas una propia.`);
}

function mostrarCredencial(u, password, titulo) {
  const wa = waCredenciales(u, password);
  modal({
    titulo,
    subtitulo: `${u.nombre} ${u.apellido}`,
    contenido: html`<div class="pila">
      <div class="credencial"><span class="muted">Contraseña temporal</span><strong>${password}</strong><span class="muted chico">Usuario: ${u.email}</span></div>
      <p class="muted">Anotala ahora: por seguridad no se vuelve a mostrar. Al entrar por primera vez, el sistema le pide que elija una propia.</p>
      <div class="modal__acciones">
        <button class="btn btn--sec" type="button" data-cerrar>Listo</button>
        ${wa ? html`<a class="btn btn--wa" href="${wa}" target="_blank" rel="noopener">${icono('wa')} Enviar por WhatsApp</a>` : ''}
      </div></div>`
  });
}

function formSocio(u = {}) {
  const sel = (c) => c ? raw('checked') : '';
  return html`<form class="form" novalidate>
    <div class="fila-campos">
      <div class="campo"><label for="s-nom">Nombre</label><input class="input" id="s-nom" name="nombre" value="${u.nombre || ''}" required autofocus></div>
      <div class="campo"><label for="s-ape">Apellido</label><input class="input" id="s-ape" name="apellido" value="${u.apellido || ''}" required></div>
    </div>
    <div class="campo"><label for="s-mail">Email</label><input class="input" id="s-mail" name="email" type="email" value="${u.email || ''}" required><p class="campo__ayuda">Es su usuario para entrar.</p></div>
    <div class="fila-campos">
      <div class="campo"><label for="s-tel">Celular (WhatsApp)</label><input class="input" id="s-tel" name="telefono" inputmode="tel" value="${u.telefono || ''}" placeholder="2345 401234"></div>
      <div class="campo"><label for="s-dni">DNI</label><input class="input" id="s-dni" name="dni" inputmode="numeric" value="${u.dni || ''}"></div>
    </div>
    <div class="campo"><label for="s-lic">Licencia</label><input class="input" id="s-lic" name="licencia" value="${u.licencia || ''}" placeholder="Ej.: Alumno, PPA, PCA"></div>
    <div class="campo"><label for="s-rol">Qué puede hacer</label>
      <select class="select" id="s-rol" name="rol">
        ${[['piloto', 'Piloto o alumno: carga sus vuelos, ve su cuenta e informa pagos'],
           ['admin', 'Tesorería: administra todo (tarifas, pagos, ajustes, cierres)'],
           ['consulta', 'Consulta: ve toda la administración, sin poder cambiar nada'],
           ['rampa', 'Rampa: registra aeronaves y carga tickets de servicios']]
          .map(([v, t]) => html`<option value="${v}" ${(u.rol || 'piloto') === v ? raw('selected') : ''}>${t}</option>`)}
      </select>
      <p class="campo__ayuda">Tesorería y consulta también pueden cargar sus propios vuelos.</p></div>
    <label class="check" data-instructor><input type="checkbox" name="es_instructor" ${sel(u.es_instructor)}><span>Es instructor de vuelo<br><small class="muted">Aparece en la lista cuando un alumno carga un vuelo con instructor.</small></span></label>
    <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">${u.id ? 'Guardar cambios' : 'Dar de alta'}</button></div>
  </form>`;
}

function abrirForm(ctx, u = null) {
  const m = modal({ titulo: u ? 'Editar usuario' : 'Nuevo usuario', contenido: formSocio(u || { activo: 1 }) });
  const form = m.el.querySelector('form');
  const instructor = () => { m.el.querySelector('[data-instructor]').hidden = form.rol.value === 'rampa'; };
  form.rol.addEventListener('change', instructor);
  instructor();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = datosForm(form);
    const cuerpo = d;
    conBoton(form.querySelector('[type=submit]'), async () => {
      try {
        if (u) {
          await put(`/api/admin/usuarios/${u.id}`, cuerpo);
          toast('Socio actualizado', 'ok');
          m.cerrar();
        } else {
          const r = await post('/api/admin/usuarios', cuerpo);
          m.cerrar();
          mostrarCredencial({ ...cuerpo, id: r.id }, r.password_temporal, 'Socio dado de alta');
        }
        ctx.recargar();
      } catch (err) { error(err); }
    });
  });
}

// Externos: dueños de aeronaves de afuera. Tienen cuenta corriente pero no entran al sistema.
function abrirExterno(ctx, u = null) {
  const x = u || { activo: 1 };
  const m = modal({
    titulo: u ? 'Editar externo' : 'Nuevo externo',
    subtitulo: 'Persona o empresa de afuera del club que usa sus servicios. No tiene usuario para entrar.',
    contenido: html`<form class="form" novalidate>
      <div class="fila-campos">
        <div class="campo"><label for="x-nom">Nombre o razón social</label><input class="input" id="x-nom" name="nombre" value="${x.nombre || ''}" required autofocus></div>
        <div class="campo"><label for="x-ape">Apellido <span class="muted">(si es persona)</span></label><input class="input" id="x-ape" name="apellido" value="${x.apellido || ''}"></div>
      </div>
      <div class="fila-campos">
        <div class="campo"><label for="x-tel">Celular (WhatsApp)</label><input class="input" id="x-tel" name="telefono" inputmode="tel" value="${x.telefono || ''}" placeholder="2345 401234"></div>
        <div class="campo"><label for="x-dni">DNI o CUIT</label><input class="input" id="x-dni" name="dni" value="${x.dni || ''}"></div>
      </div>
      <div class="campo"><label for="x-mail">Email <span class="muted">(opcional)</span></label><input class="input" id="x-mail" name="email" type="email" value="${x.email || ''}"></div>
      <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">${u ? 'Guardar' : 'Dar de alta'}</button></div>
    </form>`
  });
  const form = m.el.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = datosForm(form);
    conBoton(form.querySelector('[type=submit]'), async () => {
      try {
        if (u) await put(`/api/admin/externos/${u.id}`, d);
        else await post('/api/admin/externos', d);
        toast(u ? 'Externo actualizado' : 'Externo dado de alta', 'ok');
        m.cerrar();
        ctx.recargar();
      } catch (err) { error(err); }
    });
  });
}

// Bloquear / habilitar por falta de pago, dar de baja / reactivar. Todo queda en Registro.
export async function cambiarEstado(ctx, boton, usuarios) {
  const [accion, id] = Object.entries(boton.dataset).find(([k]) => ['bloquear', 'desbloquear', 'baja', 'reactivar'].includes(k));
  const u = usuarios.find(x => x.id === Number(id));
  const nombre = `${u.nombre} ${u.apellido}`.trim();
  const deuda = u.saldo > 0 ? ` Debe ${pesos(u.saldo)}.` : '';
  let cuerpo = {};
  if (accion === 'baja') {
    const motivo = await pedirTexto({
      titulo: `Dar de baja a ${nombre}`,
      texto: `Sale de las listas y no puede entrar ni ${u.rol === 'externo' ? 'recibir tickets' : 'cargar vuelos'}. Sus vuelos, cupones y pagos quedan en el historial y se puede reactivar.${deuda}`,
      label: 'Motivo (queda en el registro)', placeholder: 'Ej.: renunció como socio', boton: 'Dar de baja', peligro: true
    });
    if (!motivo) return;
    cuerpo = { motivo };
  } else {
    const textos = {
      bloquear: ['Bloquear por falta de pago', `${nombre} va a poder entrar, ver su cuenta e informar pagos, pero no va a poder cargar vuelos ni dejar servicios a cuenta hasta que lo habilites.${deuda}`, 'Bloquear'],
      desbloquear: ['Habilitar', `${nombre} vuelve a poder cargar vuelos.${deuda}`, 'Habilitar'],
      reactivar: ['Reactivar', `${nombre} vuelve a las listas${u.rol === 'externo' ? '' : ' y puede entrar con su contraseña de siempre'}.`, 'Reactivar']
    }[accion];
    const ok = await confirmar({ titulo: textos[0], texto: textos[1], boton: textos[2], peligro: accion === 'bloquear' });
    if (!ok) return;
  }
  try {
    await post(`/api/admin/usuarios/${u.id}/${accion}`, cuerpo);
    toast({ bloquear: `${nombre} quedó bloqueado`, desbloquear: `${nombre} quedó habilitado`, baja: `${nombre} quedó dado de baja`, reactivar: `${nombre} quedó activo` }[accion], 'ok');
    ctx.recargar();
  } catch (err) { error(err); }
}

export default async function socios(ctx) {
  const { usuarios: todos } = await get('/api/admin/usuarios');
  const pestana = ctx.query.ver === 'externos' ? 'externos' : 'socios';
  const verBajas = ctx.query.bajas === '1';
  const dePestana = todos.filter(u => (pestana === 'externos') === (u.rol === 'externo'));
  // Los dados de baja no se borran: quedan ocultos, con su historial, y se pueden reactivar.
  const bajas = dePestana.filter(u => !u.activo).length;
  const usuarios = dePestana.filter(u => verBajas || u.activo);
  const url = (cambios) => {
    const q = new URLSearchParams({ ...(pestana === 'externos' && { ver: 'externos' }), ...(verBajas && { bajas: '1' }), ...cambios });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    return `#/admin/socios${q.size ? `?${q}` : ''}`;
  };
  const activos = todos.filter(u => u.activo && u.rol !== 'externo');

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab">
      <div><h1>Socios</h1><p>${activos.length} usuarios activos, ${activos.filter(u => u.es_instructor).length} instructores, ${todos.filter(u => u.rol === 'externo' && u.activo).length} externos.${activos.some(u => u.bloqueado) ? ` ${activos.filter(u => u.bloqueado).length} bloqueados por falta de pago.` : ''}</p></div>
      <div class="vista__acciones">${pestana === 'externos'
        ? html`<button class="btn btn--principal" type="button" data-nuevo-externo data-escritura>${icono('mas')} Nuevo externo</button>`
        : html`<button class="btn btn--principal" type="button" data-nuevo data-escritura>${icono('mas')} Nuevo usuario</button>`}</div>
    </div>
    <div class="pestanas" role="tablist">
      <button type="button" role="tab" data-ver="socios" aria-selected="${pestana === 'socios'}">Socios y usuarios</button>
      <button type="button" role="tab" data-ver="externos" aria-selected="${pestana === 'externos'}">Externos</button>
    </div>
    <section class="panel">
      <div class="panel__cab"><div class="buscador" style="flex:1">${icono('buscar')}<input class="input" type="search" id="buscar" placeholder="Buscar por nombre o email" aria-label="Buscar"></div>
        ${bajas ? html`<a class="btn btn--fantasma btn--chico" href="${url({ bajas: verBajas ? '' : '1' })}">${verBajas ? 'Ocultar dados de baja' : `Ver dados de baja (${bajas})`}</a>` : ''}</div>
      ${usuarios.length ? html`<div class="tabla-caja"><table class="tabla tabla--tarjetas">
        <thead><tr><th>${pestana === 'externos' ? 'Externo' : 'Socio'}</th><th>Contacto</th><th>Rol</th><th class="num">Saldo</th><th></th></tr></thead>
        <tbody>${usuarios.map(u => html`<tr data-nombre="${`${u.nombre} ${u.apellido} ${u.email || ''} ${u.dni || ''}`.toLowerCase()}" ${u.activo ? '' : raw('style="opacity:.55"')}>
          <td class="celda-ppal"><strong>${nombreLista(u)}</strong>${u.activo ? '' : html` <span class="chip chip--neutro">Baja</span>`}${u.activo && u.bloqueado ? html` <span class="chip chip--mal">Bloqueado</span>` : ''}
            ${!u.activo && u.baja_motivo ? html`<div class="muted chico">Baja: ${u.baja_motivo}</div>` : u.bloqueado ? html`<div class="muted chico">${u.bloqueo_motivo || 'Falta de pago'}</div>` : ''}</td>
          <td data-label="Contacto"><div>${u.email || (u.rol === 'externo' && u.dni ? `DNI/CUIT ${u.dni}` : '')}</div><div class="muted chico">${u.telefono || 'Sin celular'}</div></td>
          <td data-label="Rol">${rolTexto(u)}${u.rol !== 'piloto' && u.es_instructor ? html`<div class="muted chico">Instructor</div>` : ''}</td>
          <td class="num" data-label="Saldo">${u.rol === 'rampa' ? html`<span class="muted">—</span>` : html`<a href="#/admin/cuentas/${u.id}" class="monto">${pesos(u.saldo)}</a>`}</td>
          <td class="celda-acciones"><div class="tabla__acciones">
            ${u.rol === 'externo'
              ? html`<button class="btn btn--sec btn--chico" type="button" data-editar-externo="${u.id}" data-escritura>${icono('editar')} Editar</button>`
              : html`<button class="btn btn--sec btn--chico" type="button" data-editar="${u.id}" data-escritura>${icono('editar')} Editar</button>
            <button class="btn btn--fantasma btn--chico" type="button" data-reset="${u.id}" data-escritura>${icono('llave')} Nueva contraseña</button>`}
            ${u.activo && u.rol === 'piloto' ? (u.bloqueado
              ? html`<button class="btn btn--sec btn--chico" type="button" data-desbloquear="${u.id}" data-escritura>${icono('check')} Habilitar</button>`
              : html`<button class="btn btn--fantasma btn--chico" type="button" data-bloquear="${u.id}" data-escritura>${icono('candado')} Bloquear</button>`) : ''}
            ${u.activo
              ? (u.id === ctx.usuario.id || u.transitos ? '' : html`<button class="btn btn--fantasma btn--chico" type="button" data-baja="${u.id}" data-escritura style="color:var(--peligro)">${icono('x')} Dar de baja</button>`)
              : html`<button class="btn btn--sec btn--chico" type="button" data-reactivar="${u.id}" data-escritura>${icono('check')} Reactivar</button>`}
          </div></td></tr>`)}</tbody>
      </table></div>` : html`<p class="muted">${pestana === 'externos' ? 'Todavía no hay externos. Se dan de alta solos cuando rampa registra una aeronave de afuera.' : 'No hay usuarios.'}</p>`}
    </section>
  </div>`);

  const filas = [...ctx.el.querySelectorAll('tbody tr')];
  ctx.el.querySelector('#buscar').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    filas.forEach(f => { f.hidden = q && !f.dataset.nombre.includes(q); });
  });

  ctx.el.addEventListener('click', async (e) => {
    const ver = e.target.closest('[data-ver]');
    if (ver) return ctx.ir(`#/admin/socios${ver.dataset.ver === 'externos' ? '?ver=externos' : ''}`);
    const accion = e.target.closest('[data-bloquear],[data-desbloquear],[data-baja],[data-reactivar]');
    if (accion) return cambiarEstado(ctx, accion, usuarios);
    if (e.target.closest('[data-nuevo-externo]')) return abrirExterno(ctx);
    const ex = e.target.closest('[data-editar-externo]');
    if (ex) return abrirExterno(ctx, usuarios.find(u => u.id === Number(ex.dataset.editarExterno)));
    if (e.target.closest('[data-nuevo]')) return abrirForm(ctx);
    const ed = e.target.closest('[data-editar]');
    if (ed) return abrirForm(ctx, usuarios.find(u => u.id === Number(ed.dataset.editar)));
    const rs = e.target.closest('[data-reset]');
    if (rs) {
      const u = usuarios.find(x => x.id === Number(rs.dataset.reset));
      const ok = await confirmar({ titulo: 'Generar contraseña nueva', texto: `${u.nombre} ${u.apellido} va a tener que entrar con una contraseña temporal y elegir una propia. Se cierran sus sesiones abiertas.`, boton: 'Generar' });
      if (!ok) return;
      try {
        const r = await post(`/api/admin/usuarios/${u.id}/reset-password`);
        mostrarCredencial(u, r.password_temporal, 'Contraseña nueva');
      } catch (err) { error(err); }
    }
  });
}
