import { get, post, html, pintar, icono, iniciales, error, cargando } from './lib.js';
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

const RUTAS = [
  { ruta: '/inicio', vista: inicio, titulo: 'Inicio' },
  { ruta: '/cargar', vista: cargar, titulo: 'Cargar vuelo' },
  { ruta: '/vuelos/:id/editar', vista: cargar, titulo: 'Corregir vuelo' },
  { ruta: '/vuelos', vista: misVuelos, titulo: 'Mis vuelos' },
  { ruta: '/cuenta', vista: miCuenta, titulo: 'Mi cuenta' },
  { ruta: '/perfil', vista: perfil, titulo: 'Perfil' },
  { ruta: '/panel', vista: panel, titulo: 'Panel', admin: true },
  { ruta: '/admin/vuelos', vista: vuelosAdmin, titulo: 'Vuelos', admin: true },
  { ruta: '/admin/cuentas/:id', vista: cuentaSocio, titulo: 'Cuenta', admin: true },
  { ruta: '/admin/cuentas', vista: cuentas, titulo: 'Cuentas', admin: true },
  { ruta: '/admin/cierres/:id', vista: detalleCierre, titulo: 'Cierre', admin: true },
  { ruta: '/admin/cierres', vista: cierres, titulo: 'Cierres y cupones', admin: true },
  { ruta: '/admin/socios', vista: socios, titulo: 'Socios', admin: true },
  { ruta: '/admin/flota', vista: flota, titulo: 'Flota y tarifas', admin: true },
  { ruta: '/admin/reportes', vista: reportes, titulo: 'Reportes', admin: true },
  { ruta: '/admin/registro', vista: registro, titulo: 'Registro', admin: true },
  { ruta: '/admin/ajustes', vista: ajustes, titulo: 'Configuración', admin: true }
];

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
  { href: '#/admin/cierres', txt: 'Cierres y cupones', ic: 'cierre' },
  { href: '#/admin/socios', txt: 'Socios', ic: 'usuarios' },
  { href: '#/admin/flota', txt: 'Flota y tarifas', ic: 'hangar' },
  { href: '#/admin/reportes', txt: 'Reportes', ic: 'reporte' },
  { href: '#/admin/registro', txt: 'Registro', ic: 'escudo' },
  { href: '#/admin/ajustes', txt: 'Configuración', ic: 'ajustes' }
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

const esAdmin = () => usuario?.rol === 'admin';
const inicioPorRol = () => (esAdmin() ? '/panel' : '/inicio');

function itemMenu(it, actual) {
  const activo = actual === it.href.slice(1) || (it.href !== '#/inicio' && actual.startsWith(it.href.slice(1) + '/'));
  return html`<a href="${it.href}" class="${it.cargar ? 'menu__cargar' : ''}" ${activo ? html`aria-current="page"` : ''}>${icono(it.ic)}<span>${it.txt}</span></a>`;
}

function pintarMenus(actual) {
  const menuPiloto = esAdmin()
    ? [MENU_PILOTO[1], { href: '#/inicio', txt: 'Mi resumen', ic: 'inicio' }, MENU_PILOTO[2], MENU_PILOTO[3]]
    : MENU_PILOTO.filter(i => i.href !== '#/perfil');

  pintar(document.getElementById('lateral'), html`
    <a class="lateral__marca" href="#${inicioPorRol()}">
      <img src="/assets/img/escudo-256.png" alt="" width="46" height="46">
      <span class="barra__club">Aeroclub 25 de Mayo<small>${esAdmin() ? 'Tesorería' : 'Socios'}</small></span>
    </a>
    <div class="menu">
      ${esAdmin() ? html`${itemMenu(MENU_PILOTO[1], actual)}<div class="menu__grupo">Administración</div>${MENU_ADMIN.map(i => itemMenu(i, actual))}<div class="menu__grupo">Mi actividad</div>${menuPiloto.slice(1).map(i => itemMenu(i, actual))}` : menuPiloto.map(i => itemMenu(i, actual))}
    </div>
    <div class="lateral__pie">
      <a class="avatar" href="#/perfil" aria-label="Mi perfil">${iniciales(usuario.nombre, usuario.apellido)}</a>
      <div><strong>${usuario.nombre} ${usuario.apellido}</strong><small>${usuario.email}</small></div>
      <button class="btn btn--fantasma btn--chico" type="button" data-salir aria-label="Salir">${icono('salir')}</button>
    </div>`);

  const inf = esAdmin()
    ? [MENU_ADMIN[0], MENU_ADMIN[2], MENU_PILOTO[1], MENU_ADMIN[3], { mas: true }]
    : [MENU_PILOTO[0], MENU_PILOTO[2], MENU_PILOTO[1], MENU_PILOTO[3], MENU_PILOTO[4]];
  pintar(document.getElementById('nav-inf'), inf.map(it => {
    if (it.mas) return html`<button type="button" data-cajon>${icono('menu')}<span>Más</span></button>`;
    const activo = actual === it.href.slice(1) || actual.startsWith(it.href.slice(1) + '/');
    if (it.cargar) return html`<a href="${it.href}" class="nav-inf__cargar" ${activo ? html`aria-current="page"` : ''}><span class="boton-central">${icono('mas')}</span><span>Cargar</span></a>`;
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
    ${itemMenu({ href: '#/inicio', txt: 'Mi resumen', ic: 'inicio' }, actual)}${itemMenu(MENU_PILOTO[2], actual)}${itemMenu(MENU_PILOTO[3], actual)}${itemMenu(MENU_PILOTO[4], actual)}
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
  if (!destino || (destino.admin && !esAdmin())) { location.replace(`#${inicioPorRol()}`); return; }

  pintarMenus(ruta);
  document.getElementById('barra-seccion').textContent = destino.titulo;
  document.title = `${destino.titulo} · Aeroclub 25 de Mayo`;

  const mio = ++token;
  const el = document.createElement('div');
  if (!opciones.mantener) pintar($vista, cargando());
  const ctx = {
    el, usuario, params, query,
    esAdmin: esAdmin(),
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
  window.addEventListener('hashchange', navegar);
  navegar();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

arrancar();
