import { get, post, put, html, raw, pintar, icono, pesos, modal, confirmar, toast, error, conBoton, datosForm, fechaHora } from '../lib.js';

function waCredenciales(u, password) {
  let d = String(u.telefono || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9')) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 12) for (const n of [2, 3, 4]) if (d.slice(n, n + 2) === '15') { d = d.slice(0, n) + d.slice(n + 2); break; }
  if (d.length !== 10) return null;
  const texto = `Hola ${u.nombre}. Ya tenés usuario en el sistema del Aeroclub 25 de Mayo para cargar tus vuelos.\n\nEntrá en ${location.origin}\nEmail: ${u.email}\nContraseña temporal: ${password}\n\nAl entrar te va a pedir que elijas una propia.`;
  return `https://wa.me/549${d}?text=${encodeURIComponent(texto)}`;
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
    <label class="check"><input type="checkbox" name="es_instructor" ${sel(u.es_instructor)}><span>Es instructor de vuelo<br><small class="muted">Aparece en la lista cuando un alumno carga un vuelo con instructor.</small></span></label>
    <label class="check"><input type="checkbox" name="admin" ${sel(u.rol === 'admin')}><span>Es administrador (tesorería)<br><small class="muted">Puede cambiar tarifas, registrar pagos, hacer ajustes y cerrar el mes.</small></span></label>
    ${u.id ? html`<label class="check"><input type="checkbox" name="activo" ${sel(u.activo)}><span>Activo<br><small class="muted">Si lo das de baja, no puede entrar ni cargar vuelos. Su historial se conserva.</small></span></label>` : ''}
    <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">${u.id ? 'Guardar cambios' : 'Dar de alta'}</button></div>
  </form>`;
}

function abrirForm(ctx, u = null) {
  const m = modal({ titulo: u ? 'Editar socio' : 'Nuevo socio', contenido: formSocio(u || { activo: 1 }) });
  const form = m.el.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = datosForm(form);
    const cuerpo = { ...d, rol: d.admin ? 'admin' : 'piloto', activo: u ? d.activo : true };
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

export default async function socios(ctx) {
  const { usuarios } = await get('/api/admin/usuarios');
  const activos = usuarios.filter(u => u.activo);

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab">
      <div><h1>Socios</h1><p>${activos.length} activos, ${activos.filter(u => u.es_instructor).length} instructores.</p></div>
      <div class="vista__acciones"><button class="btn btn--principal" type="button" data-nuevo>${icono('mas')} Nuevo socio</button></div>
    </div>
    <section class="panel">
      <div class="panel__cab"><div class="buscador" style="flex:1">${icono('buscar')}<input class="input" type="search" id="buscar" placeholder="Buscar por nombre o email" aria-label="Buscar socio"></div></div>
      <div class="tabla-caja"><table class="tabla tabla--tarjetas">
        <thead><tr><th>Socio</th><th>Contacto</th><th>Rol</th><th class="num">Saldo</th><th></th></tr></thead>
        <tbody>${usuarios.map(u => html`<tr data-nombre="${`${u.nombre} ${u.apellido} ${u.email}`.toLowerCase()}" ${u.activo ? '' : raw('style="opacity:.55"')}>
          <td class="celda-ppal"><strong>${u.apellido}, ${u.nombre}</strong>${u.activo ? '' : html` <span class="chip chip--neutro">Baja</span>`}</td>
          <td data-label="Contacto"><div>${u.email}</div><div class="muted chico">${u.telefono || 'Sin celular'}</div></td>
          <td data-label="Rol">${u.rol === 'admin' ? 'Tesorería' : 'Piloto'}${u.es_instructor ? html`<div class="muted chico">Instructor</div>` : ''}</td>
          <td class="num" data-label="Saldo"><a href="#/admin/cuentas/${u.id}" class="monto">${pesos(u.saldo)}</a></td>
          <td class="celda-acciones"><div class="tabla__acciones">
            <button class="btn btn--sec btn--chico" type="button" data-editar="${u.id}">${icono('editar')} Editar</button>
            <button class="btn btn--fantasma btn--chico" type="button" data-reset="${u.id}">${icono('llave')} Nueva contraseña</button>
          </div></td></tr>`)}</tbody>
      </table></div>
    </section>
  </div>`);

  const filas = [...ctx.el.querySelectorAll('tbody tr')];
  ctx.el.querySelector('#buscar').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    filas.forEach(f => { f.hidden = q && !f.dataset.nombre.includes(q); });
  });

  ctx.el.addEventListener('click', async (e) => {
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
