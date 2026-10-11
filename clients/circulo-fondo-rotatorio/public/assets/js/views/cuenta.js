// Avisos (notificaciones) y perfil (cambio de contraseña).

import { get, post, html, pintar, icono, fechaHora, error, toast, conBoton, verContrasenas, vacio } from '../lib.js';

export async function avisos(ctx) {
  const { notificaciones } = await get('/api/notificaciones');
  const IC = { ok: 'check', mal: 'alerta', alerta: 'alerta', info: 'info' };
  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>Avisos</h1><p>Cambios de estado de solicitudes, fondos, rendiciones y comprobantes rechazados.</p></div></div>
    ${notificaciones.length ? html`<div class="lista">${notificaciones.map(n => html`<a class="item" href="${n.link || '#/avisos'}" style="${n.leida ? '' : 'background:var(--celeste-3)'}">
      <span class="item__icono" style="${n.tipo === 'mal' ? 'background:var(--rojo-fondo);color:var(--rojo)' : n.tipo === 'ok' ? 'background:var(--verde-fondo);color:var(--verde)' : ''}">${icono(IC[n.tipo])}</span>
      <div class="item__texto" style="white-space:normal"><strong style="white-space:normal;font-weight:${n.leida ? 500 : 700}">${n.texto}</strong><small>${fechaHora(n.creado_en)}</small></div></a>`)}</div>`
      : vacio('No tenés avisos.', 'campana')}
  </div>`);
  if (notificaciones.some(n => !n.leida)) { await post('/api/notificaciones/leidas'); ctx.avisos(); }
}

export async function perfil(ctx) {
  const u = ctx.usuario;
  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>${u.nombre} ${u.apellido}</h1><p>${u.rol_nombre}${u.sede_nombre ? ` · ${u.sede_nombre}` : ''} · ${u.email}</p></div></div>
    ${u.debe_cambiar_password ? html`<div class="aviso">${icono('candado')}<span>Estás entrando con una contraseña temporal. <b>Elegí una nueva para seguir.</b></span></div>` : ''}
    <form class="panel form" id="f" novalidate style="max-width:460px">
      <h2>Cambiar contraseña</h2>
      <div class="campo"><label for="actual">Contraseña actual</label><input class="input" type="password" id="actual" name="actual" autocomplete="current-password" required></div>
      <div class="campo"><label for="nueva">Contraseña nueva</label><input class="input" type="password" id="nueva" name="nueva" autocomplete="new-password" minlength="8" required><span class="campo__ayuda">Al menos 8 caracteres.</span></div>
      <button class="btn btn--principal" type="submit">Guardar contraseña</button>
    </form>
    <button class="btn btn--sec" type="button" data-salir style="align-self:flex-start">${icono('salir')} Salir</button>
  </div>`);
  const f = ctx.el.querySelector('#f');
  verContrasenas(f);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    conBoton(f.querySelector('[type=submit]'), async () => {
      try {
        await post('/api/auth/password', { actual: f.actual.value, nueva: f.nueva.value });
        toast('Contraseña actualizada', 'ok');
        location.href = '/app';
      } catch (ex) { error(ex); }
    });
  });
}
