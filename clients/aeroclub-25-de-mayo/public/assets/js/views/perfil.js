import { get, post, put, html, pintar, icono, toast, error, conBoton, datosForm, rolTexto, verContrasenas, modal } from '../lib.js';

export default async function perfil(ctx) {
  const u = ctx.usuario;
  const forzado = u.debe_cambiar_password;
  // El piloto no edita sus datos: se los pide a tesorería por mail.
  const piloto = u.rol === 'piloto';
  const filaEmail = html`<dt>Email</dt><dd>${u.email} ${u.email_verificado
    ? html`<span class="chip chip--ok">Verificado</span>`
    : html`<span class="chip chip--pend">Sin verificar</span>`}</dd>`;

  pintar(ctx.el, html`
  <div class="vista" style="max-width:640px">
    <div class="vista__cab"><div><h1>${forzado ? 'Te damos la bienvenida' : 'Perfil'}</h1>
      <p>${forzado ? 'Antes de empezar, elegí tu propia contraseña.' : `${u.nombre} ${u.apellido}, ${u.rol === 'piloto' && u.es_instructor ? 'piloto instructor' : rolTexto(u).toLowerCase()}`}</p></div></div>

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
      ${u.email_verificado ? '' : html`<div class="aviso aviso--info" style="margin-bottom:16px">${icono('info')}<span>Confirmá que <b>${u.email}</b> es tu email: te mandamos un link y lo abrís desde tu correo.
        <br><button class="btn btn--sec btn--chico" type="button" data-verificar style="margin-top:10px">${icono('check')} Mandarme el link</button></span></div>`}
      ${piloto ? html`
      <dl class="detalle">
        <dt>Nombre</dt><dd>${u.nombre} ${u.apellido}</dd>
        ${filaEmail}
        <dt>Celular</dt><dd>${u.telefono || html`<span class="muted">Sin cargar</span>`}</dd>
        ${u.dni ? html`<dt>DNI</dt><dd>${u.dni}</dd>` : ''}
        ${u.licencia ? html`<dt>Licencia</dt><dd>${u.licencia}</dd>` : ''}
      </dl>
      <p class="muted chico" style="margin:16px 0 12px">Si algún dato está mal o cambió, pedile a tesorería que lo actualice.</p>
      <button class="btn btn--sec" type="button" data-pedir-cambio>${icono('editar')} Pedir un cambio de datos</button>`
      : html`
      <form class="form" id="form-datos" novalidate>
        <dl class="detalle">
          ${filaEmail}
          ${u.dni ? html`<dt>DNI</dt><dd>${u.dni}</dd>` : ''}
          ${u.licencia ? html`<dt>Licencia</dt><dd>${u.licencia}</dd>` : ''}
        </dl>
        <div class="campo"><label for="telefono">Celular (WhatsApp)</label>
          <input class="input" id="telefono" name="telefono" inputmode="tel" value="${u.telefono || ''}" placeholder="2345 401234">
          <p class="campo__ayuda">Código de área sin 0 y número sin 15.</p></div>
        <button class="btn btn--sec" type="submit">Guardar celular</button>
      </form>
      <p class="muted chico" style="margin-top:16px">Para cambiar tu nombre o email, pedíselo a tesorería.</p>`}
    </section>
    <button class="btn btn--peligro" type="button" data-salir>${icono('salir')} Salir</button>`}
  </div>`);

  const fp = ctx.el.querySelector('#form-pass');
  verContrasenas(fp);
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
        if (forzado) ctx.ir({ admin: '#/panel', consulta: '#/panel', rampa: '#/rampa' }[r.usuario.rol] || '#/inicio');
        else fp.reset();
      } catch (err) { error(err); }
    });
  });

  ctx.el.querySelector('[data-pedir-cambio]')?.addEventListener('click', () => pedirCambio(u));
  const bv = ctx.el.querySelector('[data-verificar]');
  bv?.addEventListener('click', () => conBoton(bv, async () => {
    try {
      const r = await post('/api/auth/verificar-email', {});
      toast(`Te mandamos el link a ${r.email}. Revisá también el spam.`, 'ok');
    } catch (err) { error(err); }
  }));

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

// Pedido de cambio de datos a tesorería: lo manda el sistema por mail. Si el envío de mails no
// está configurado, se arma el mail para mandarlo desde el correo del piloto.
async function pedirCambio(u) {
  let contacto;
  try { contacto = await get('/api/perfil/contacto'); } catch (err) { return error(err); }
  if (!contacto.email) return error({ message: 'Tesorería todavía no cargó su email. Avisales por WhatsApp o en el club.' });
  const directo = contacto.envio_directo;
  const m = modal({
    titulo: 'Pedir un cambio de datos',
    subtitulo: directo ? 'Le llega a tesorería por mail y te contestan a tu email.' : `Se abre tu correo con el pedido listo para mandar a ${contacto.email}.`,
    contenido: html`<form class="form" novalidate>
      <div class="campo"><label for="pc-texto">¿Qué hay que cambiar?</label>
        <textarea class="textarea" id="pc-texto" name="texto" maxlength="600" required autofocus placeholder="Ej.: mi celular nuevo es 2345 401234"></textarea></div>
      <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">${directo ? 'Mandar pedido' : 'Escribir el mail'}</button></div>
    </form>`
  });
  const form = m.el.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const texto = form.texto.value.trim();
    if (!texto) { form.texto.setAttribute('aria-invalid', 'true'); form.texto.focus(); return; }
    if (directo) {
      conBoton(form.querySelector('[type=submit]'), async () => {
        try {
          await post('/api/perfil/pedido-cambio', { texto });
          toast('Pedido enviado a tesorería', 'ok');
          m.cerrar(true);
        } catch (err) { error(err); }
      });
      return;
    }
    const asunto = `Cambio de datos: ${u.nombre} ${u.apellido}`;
    const cuerpo = `Hola, soy ${u.nombre} ${u.apellido} (${u.email}). Necesito cambiar estos datos en el sistema del aeroclub:\n\n${texto}\n\nGracias.`;
    location.href = `mailto:${contacto.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
    m.cerrar(true);
  });
}
