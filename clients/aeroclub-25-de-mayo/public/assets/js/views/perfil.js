import { post, put, html, pintar, icono, toast, error, conBoton, datosForm } from '../lib.js';

export default async function perfil(ctx) {
  const u = ctx.usuario;
  const forzado = u.debe_cambiar_password;

  pintar(ctx.el, html`
  <div class="vista" style="max-width:640px">
    <div class="vista__cab"><div><h1>${forzado ? 'Te damos la bienvenida' : 'Perfil'}</h1>
      <p>${forzado ? 'Antes de empezar, elegí tu propia contraseña.' : `${u.nombre} ${u.apellido}, ${u.rol === 'admin' ? 'tesorería' : u.es_instructor ? 'piloto instructor' : 'piloto'}`}</p></div></div>

    <section class="panel">
      <div class="panel__cab"><h2>${forzado ? 'Tu contraseña' : 'Cambiar contraseña'}</h2></div>
      ${forzado ? html`<p class="aviso aviso--info" style="margin-bottom:16px">${icono('llave')}<span>Tesorería te dio una contraseña temporal. Cambiala por una que sólo sepas vos: mínimo 8 caracteres.</span></p>` : ''}
      <form class="form" id="form-pass" novalidate>
        <div class="campo"><label for="actual">${forzado ? 'Contraseña temporal' : 'Contraseña actual'}</label><input class="input" id="actual" name="actual" type="password" autocomplete="current-password" required ${forzado ? html`autofocus` : ''}></div>
        <div class="campo"><label for="nueva">Contraseña nueva</label><input class="input" id="nueva" name="nueva" type="password" autocomplete="new-password" minlength="8" required></div>
        <div class="campo"><label for="repetir">Repetila</label><input class="input" id="repetir" name="repetir" type="password" autocomplete="new-password" required></div>
        <button class="btn btn--principal" type="submit">Guardar contraseña</button>
      </form>
    </section>

    ${forzado ? '' : html`
    <section class="panel">
      <div class="panel__cab"><h2>Tus datos</h2></div>
      <form class="form" id="form-datos" novalidate>
        <dl class="detalle">
          <dt>Email</dt><dd>${u.email}</dd>
          ${u.dni ? html`<dt>DNI</dt><dd>${u.dni}</dd>` : ''}
          ${u.licencia ? html`<dt>Licencia</dt><dd>${u.licencia}</dd>` : ''}
        </dl>
        <div class="campo"><label for="telefono">Celular (WhatsApp)</label>
          <input class="input" id="telefono" name="telefono" inputmode="tel" value="${u.telefono || ''}" placeholder="2345 401234">
          <p class="campo__ayuda">Código de área sin 0 y número sin 15. Tesorería te manda el cupón a este número.</p></div>
        <button class="btn btn--sec" type="submit">Guardar celular</button>
      </form>
      <p class="muted chico" style="margin-top:16px">Para cambiar tu nombre o email, pedíselo a tesorería.</p>
    </section>
    <button class="btn btn--peligro" type="button" data-salir>${icono('salir')} Salir</button>`}
  </div>`);

  const fp = ctx.el.querySelector('#form-pass');
  fp.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = datosForm(fp);
    if (d.nueva.length < 8) return error({ message: 'La contraseña nueva tiene que tener al menos 8 caracteres.' });
    if (d.nueva !== d.repetir) return error({ message: 'Las dos contraseñas nuevas no coinciden.' });
    conBoton(fp.querySelector('[type=submit]'), async () => {
      try {
        const r = await post('/api/auth/password', { actual: d.actual, nueva: d.nueva });
        ctx.actualizarUsuario(r.usuario);
        toast('Contraseña actualizada', 'ok');
        if (forzado) ctx.ir(r.usuario.rol === 'admin' ? '#/panel' : '#/inicio');
        else fp.reset();
      } catch (err) { error(err); }
    });
  });

  const fd = ctx.el.querySelector('#form-datos');
  fd?.addEventListener('submit', (e) => {
    e.preventDefault();
    conBoton(fd.querySelector('[type=submit]'), async () => {
      try {
        await put('/api/perfil', { telefono: fd.telefono.value });
        ctx.actualizarUsuario({ ...u, telefono: fd.telefono.value });
        toast('Celular guardado', 'ok');
      } catch (err) { error(err); }
    });
  });
}
