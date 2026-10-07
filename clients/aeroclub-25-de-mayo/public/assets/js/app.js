import { get, post, html, pintar, icono, iniciales, error, cargando, ROLES } from './lib.js';
import inicio from './views/inicio.js';
import cargar from './views/cargar.js';
import { misVuelos, vuelosAdmin } from './views/vuelos.js';
import { miCuenta, cuentaSocio } from './views/cuenta.js';
import perfil from './views/perfil.js';
import panel from './views/panel.js';
import cuentas from './views/cuentas.js';
import { cierres, detalleCierre } from './views/cierres.js';
import socios from './views/socios.js';
import { flota } from './views/flota.js';
import reportes from './views/reportes.js';
import registro from './views/registro.js';
import ajustes from './views/ajustes.js';
import { nuevoTicket, misTickets, ticketsAdmin, aeronaves } from './views/tickets.js';
import pagosInformados from './views/pagos.js';
import novedades from './views/novedades.js';

// Quién entra a cada ruta: socio (piloto, tesorería y consulta), staff (tesorería y consulta),
// admin (sólo tesorería), rampa (rampa y tesorería).
const RUTAS = [
  { ruta: '/inicio', vista: inicio, titulo: 'Inicio', para: 'socio' },
  { ruta: '/cargar', vista: cargar, titulo: 'Cargar vuelo', para: 'socio' },
  { ruta: '/vuelos/:id/editar', vista: cargar, titulo: 'Corregir vuelo', para: 'admin' },
  { ruta: '/vuelos', vista: misVuelos, titulo: 'Mis vuelos', para: 'socio' },
  { ruta: '/cuenta', vista: miCuenta, titulo: 'Mi cuenta', para: 'socio' },
  { ruta: '/perfil', vista: perfil, titulo: 'Perfil', para: 'todos' },
  { ruta: '/panel', vista: panel, titulo: 'Panel', para: 'staff' },
  { ruta: '/admin/vuelos', vista: vuelosAdmin, titulo: 'Vuelos', para: 'staff' },
  { ruta: '/admin/cuentas/:id', vista: cuentaSocio, titulo: 'Cuenta', para: 'staff' },
  { ruta: '/admin/cuentas', vista: cuentas, titulo: 'Cuentas', para: 'staff' },
  { ruta: '/admin/pagos', vista: pagosInformados, titulo: 'Pagos informados', para: 'staff' },
  { ruta: '/admin/tickets/nuevo', vista: nuevoTicket, titulo: 'Nuevo ticket', para: 'admin' },
  { ruta: '/admin/tickets', vista: ticketsAdmin, titulo: 'Tickets de servicios', para: 'staff' },
  { ruta: '/admin/aeronaves', vista: aeronaves, titulo: 'Aeronaves', para: 'staff' },
  { ruta: '/admin/cierres/:id', vista: detalleCierre, titulo: 'Cierre', para: 'staff' },
  { ruta: '/admin/cierres', vista: cierres, titulo: 'Cierres y cupones', para: 'staff' },
  { ruta: '/admin/socios', vista: socios, titulo: 'Socios', para: 'staff' },
  { ruta: '/admin/flota', vista: flota, titulo: 'Flota y tarifas', para: 'staff' },
  { ruta: '/admin/reportes', vista: reportes, titulo: 'Reportes', para: 'staff' },
  { ruta: '/admin/registro', vista: registro, titulo: 'Registro', para: 'staff' },
  { ruta: '/admin/ajustes', vista: ajustes, titulo: 'Configuración', para: 'staff' },
  { ruta: '/mantenimiento', vista: novedades, titulo: 'Novedades', para: 'mantenimiento' },
  { ruta: '/rampa', vista: nuevoTicket, titulo: 'Nuevo ticket', para: 'rampa' },
  { ruta: '/rampa/tickets', vista: misTickets, titulo: 'Tickets', para: 'rampa' },
  { ruta: '/rampa/aeronaves', vista: aeronaves, titulo: 'Aeronaves', para: 'rampa' }
];

const PERMISOS = {
  todos: () => true,
  socio: (r) => ['piloto', 'admin', 'consulta'].includes(r),
  staff: (r) => ['admin', 'consulta'].includes(r),
  admin: (r) => r === 'admin',
  rampa: (r) => ['rampa', 'admin'].includes(r),
  mantenimiento: (r) => ['mantenimiento', 'admin', 'consulta'].includes(r)
};

const MENU_PILOTO = [
  { href: '#/inicio', txt: 'Inicio', ic: 'inicio' },
  { href: '#/cargar', txt: 'Cargar vuelo', ic: 'avion', cargar: true },
  { href: '#/vuelos', txt: 'Mis vuelos', ic: 'lista' },
  { href: '#/cuenta', txt: 'Mi cuenta', ic: 'cuenta' },
  { href: '#/perfil', txt: 'Perfil', ic: 'usuario' }
];
const MENU_ADMIN = [
  { href: '#/panel', txt: 'Panel', ic: 'panel' },
  { href: '#/admin/vuelos', txt: 'Vuelos', ic: 'lista' },
  { href: '#/admin/cuentas', txt: 'Cuentas', ic: 'cuenta' },
  { href: '#/admin/pagos', txt: 'Pagos informados', ic: 'informar' },
  { href: '#/admin/tickets', txt: 'Tickets de servicios', ic: 'ticket' },
  { href: '#/admin/cierres', txt: 'Cierres y cupones', ic: 'cierre' },
  { href: '#/admin/socios', txt: 'Socios', ic: 'usuarios' },
  { href: '#/admin/flota', txt: 'Flota y tarifas', ic: 'hangar' },
  { href: '#/mantenimiento', txt: 'Novedades', ic: 'nota' },
  { href: '#/admin/reportes', txt: 'Reportes', ic: 'reporte' },
  { href: '#/admin/registro', txt: 'Registro', ic: 'escudo' },
  { href: '#/admin/ajustes', txt: 'Configuración', ic: 'ajustes' }
];
const MENU_RAMPA = [
  { href: '#/rampa', txt: 'Nuevo ticket', ic: 'mas', exacto: true },
  { href: '#/rampa/tickets', txt: 'Tickets', ic: 'ticket' },
  { href: '#/rampa/aeronaves', txt: 'Aeronaves', ic: 'avion' },
  { href: '#/perfil', txt: 'Perfil', ic: 'usuario' }
];

const MENU_MANT = [
  { href: '#/mantenimiento', txt: 'Novedades', ic: 'nota' },
  { href: '#/perfil', txt: 'Perfil', ic: 'usuario' }
];

let usuario = null;
const $vista = document.getElementById('vista');

function coincide(patron, ruta) {
  const a = patron.split('/'); const b = ruta.split('/');
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

function leerHash() {
  const h = location.hash.slice(1) || '';
  const [ruta, qs = ''] = h.split('?');
  return { ruta: ruta || '', query: Object.fromEntries(new URLSearchParams(qs)) };
}

const rol = () => usuario?.rol;
const esStaff = () => PERMISOS.staff(rol());
const inicioPorRol = () => (esStaff() ? '/panel' : rol() === 'rampa' ? '/rampa' : rol() === 'mantenimiento' ? '/mantenimiento' : '/inicio');

function itemMenu(it, actual) {
  const destino = it.href.slice(1);
  const activo = actual === destino || (!it.exacto && it.href !== '#/inicio' && actual.startsWith(destino + '/'));
  return html`<a href="${it.href}" class="${it.cargar ? 'menu__cargar' : ''}" ${activo ? html`aria-current="page"` : ''}>${icono(it.ic)}<span>${it.txt}</span></a>`;
}

const MI_ACTIVIDAD = [{ href: '#/inicio', txt: 'Mi resumen', ic: 'inicio' }, MENU_PILOTO[2], MENU_PILOTO[3]];

function pintarMenus(actual) {
  let lateral;
  if (esStaff()) {
    lateral = html`${itemMenu(MENU_PILOTO[1], actual)}<div class="menu__grupo">Administración</div>${MENU_ADMIN.map(i => itemMenu(i, actual))}<div class="menu__grupo">Mi actividad</div>${MI_ACTIVIDAD.map(i => itemMenu(i, actual))}`;
  } else if (rol() === 'rampa') {
    lateral = MENU_RAMPA.filter(i => i.href !== '#/perfil').map(i => itemMenu(i, actual));
  } else if (rol() === 'mantenimiento') {
    lateral = itemMenu(MENU_MANT[0], actual);
  } else {
    lateral = MENU_PILOTO.filter(i => i.href !== '#/perfil').map(i => itemMenu(i, actual));
  }

  pintar(document.getElementById('lateral'), html`
    <a class="lateral__marca" href="#${inicioPorRol()}">
      <img src="/assets/img/escudo-256.png?v=2" alt="" width="46" height="46">
      <span class="barra__club">Aeroclub 25 de Mayo<small>${rol() === 'piloto' ? 'Socios' : ROLES[rol()]}</small></span>
    </a>
    <div class="menu">${lateral}</div>
    <div class="lateral__pie">
      <a class="avatar" href="#/perfil" aria-label="Mi perfil">${iniciales(usuario.nombre, usuario.apellido)}</a>
      <div><strong>${usuario.nombre} ${usuario.apellido}</strong><small>${usuario.email}</small></div>
      <button class="btn btn--fantasma btn--chico" type="button" data-salir aria-label="Salir">${icono('salir')}</button>
    </div>`);

  const inf = esStaff()
    ? [MENU_ADMIN[0], MENU_ADMIN[2], MENU_PILOTO[1], MENU_ADMIN[5], { mas: true }]
    : rol() === 'rampa'
      ? [MENU_RAMPA[1], { ...MENU_RAMPA[0], cargar: true }, MENU_RAMPA[2], MENU_RAMPA[3]]
      : rol() === 'mantenimiento' ? MENU_MANT
      : [MENU_PILOTO[0], MENU_PILOTO[2], MENU_PILOTO[1], MENU_PILOTO[3], MENU_PILOTO[4]];
  pintar(document.getElementById('nav-inf'), inf.map(it => {
    if (it.mas) return html`<button type="button" data-cajon>${icono('menu')}<span>Más</span></button>`;
    const destino = it.href.slice(1);
    const activo = actual === destino || (!it.exacto && actual.startsWith(destino + '/'));
    if (it.cargar) return html`<a href="${it.href}" class="nav-inf__cargar" ${activo ? html`aria-current="page"` : ''}><span class="boton-central">${icono('mas')}</span><span>${rol() === 'rampa' ? 'Ticket' : 'Cargar'}</span></a>`;
    const corto = { 'Mis vuelos': 'Vuelos', 'Mi cuenta': 'Cuenta', 'Cierres y cupones': 'Cierres' }[it.txt] || it.txt;
    return html`<a href="${it.href}" ${activo ? html`aria-current="page"` : ''}>${icono(it.ic)}<span>${corto}</span></a>`;
  }));
  pintar(document.getElementById('barra-avatar'), iniciales(usuario.nombre, usuario.apellido));
}

function abrirCajon() {
  const actual = leerHash().ruta;
  const fondo = document.createElement('div');
  fondo.className = 'cajon-fondo';
  const cajon = document.createElement('div');
  cajon.className = 'cajon';
  cajon.setAttribute('role', 'dialog');
  cajon.setAttribute('aria-label', 'Todas las secciones');
  pintar(cajon, html`<div class="menu">
    <div class="menu__grupo">Administración</div>${MENU_ADMIN.map(i => itemMenu(i, actual))}
    <div class="menu__grupo">Mi actividad</div>
    ${MI_ACTIVIDAD.map(i => itemMenu(i, actual))}${itemMenu(MENU_PILOTO[4], actual)}
    <button type="button" data-salir>${icono('salir')}<span>Salir</span></button>
  </div>`);
  document.body.append(fondo, cajon);
  requestAnimationFrame(() => { fondo.classList.add('abierto'); cajon.classList.add('abierto'); });
  const cerrar = () => { fondo.remove(); cajon.remove(); };
  fondo.addEventListener('click', cerrar);
  cajon.addEventListener('click', (e) => { if (e.target.closest('a')) cerrar(); });
  window.addEventListener('hashchange', cerrar, { once: true });
}

async function salir() {
  try { await post('/api/auth/logout'); } finally { location.href = '/'; }
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-salir]')) salir();
  if (e.target.closest('[data-cajon]')) abrirCajon();
});

let token = 0;
async function navegar(opciones = {}) {
  const { ruta, query } = leerHash();
  if (!ruta) { location.replace(`#${inicioPorRol()}`); return; }
  if (usuario.debe_cambiar_password && ruta !== '/perfil') { location.replace('#/perfil'); return; }

  let destino = null; let params = {};
  for (const r of RUTAS) { const p = coincide(r.ruta, ruta); if (p) { destino = r; params = p; break; } }
  if (!destino || !PERMISOS[destino.para](rol())) { location.replace(`#${inicioPorRol()}`); return; }

  pintarMenus(ruta);
  document.getElementById('barra-seccion').textContent = destino.titulo;
  document.title = `${destino.titulo} · Aeroclub 25 de Mayo`;

  const mio = ++token;
  const el = document.createElement('div');
  if (!opciones.mantener) pintar($vista, cargando());
  const ctx = {
    el, usuario, params, query,
    esAdmin: rol() === 'admin',          // puede cambiar cosas en la administración
    esStaff: esStaff(),                  // ve la administración (tesorería y consulta)
    vigente: () => mio === token,
    ir: (h) => { location.hash = h; },
    recargar: () => navegar({ mantener: true }),
    actualizarUsuario: (u) => { usuario = u; }
  };
  try {
    await destino.vista(ctx);
    if (mio !== token) return;
    $vista.replaceChildren(el);
    if (!opciones.mantener) window.scrollTo(0, 0);
  } catch (e) {
    if (mio !== token) return;
    pintar($vista, html`<div class="vacio">${icono('alerta')}<p>${e.message || 'No se pudo cargar esta sección.'}</p><button class="btn btn--sec" type="button" data-reintentar>Reintentar</button></div>`);
    $vista.querySelector('[data-reintentar]')?.addEventListener('click', navegar);
    if (e.status !== 401) error(e);
  }
}

async function arrancar() {
  try {
    usuario = (await get('/api/auth/me')).usuario;
  } catch {
    location.href = '/';
    return;
  }
  // El usuario de consulta ve todo, pero los botones que cambian cosas no aparecen.
  document.body.classList.toggle('solo-lectura', usuario.rol === 'consulta');
  window.addEventListener('hashchange', navegar);
  navegar();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

arrancar();
