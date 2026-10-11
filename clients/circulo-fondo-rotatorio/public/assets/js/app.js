import { get, post, html, pintar, icono, iniciales, error, cargando, marca } from './lib.js';
import inicio from './views/inicio.js';
import panel from './views/panel.js';
import cargar from './views/cargar.js';
import { listaGastos, detalleGasto } from './views/gastos.js';
import { listaSolicitudes, nuevaSolicitud, detalleSolicitud } from './views/solicitudes.js';
import fondos from './views/fondos.js';
import proveedores from './views/proveedores.js';
import { rendicion, rendicionRecibida, recibidas } from './views/rendicion.js';
import { asignar, sedes, certificados } from './views/central.js';
import auditoria from './views/auditoria.js';
import { adminSedes, adminUsuarios, adminRubros, adminParametros, adminPermisos } from './views/admin.js';
import { avisos, perfil } from './views/cuenta.js';

let usuario = null;
const puede = (p) => usuario?.permisos.includes(p);
const esSede = () => usuario?.ambito === 'sede';
const algun = (...ps) => ps.some(puede);

// Quién entra a cada ruta.
const RUTAS = [
  { ruta: '/inicio', vista: inicio, titulo: 'Inicio', para: esSede },
  { ruta: '/cargar', vista: cargar, titulo: 'Cargar gasto', para: () => esSede() && puede('gastos.cargar') },
  { ruta: '/gastos/:id', vista: detalleGasto, titulo: 'Gasto', para: () => true },
  { ruta: '/gastos', vista: listaGastos, titulo: 'Gastos', para: () => true },
  { ruta: '/solicitudes/nueva', vista: nuevaSolicitud, titulo: 'Nueva solicitud', para: () => puede('solicitudes.crear') },
  { ruta: '/solicitudes/:id', vista: detalleSolicitud, titulo: 'Solicitud', para: () => true },
  { ruta: '/solicitudes', vista: listaSolicitudes, titulo: 'Solicitudes', para: () => true },
  { ruta: '/fondos', vista: fondos, titulo: 'Fondos', para: () => true },
  { ruta: '/proveedores', vista: proveedores, titulo: 'Proveedores', para: () => true },
  { ruta: '/rendicion/:periodo', vista: rendicion, titulo: 'Rendición', para: esSede },
  { ruta: '/rendicion', vista: rendicion, titulo: 'Rendición', para: esSede },
  { ruta: '/certificados', vista: certificados, titulo: 'Retenciones', para: () => true },
  { ruta: '/auditoria', vista: auditoria, titulo: 'Auditoría', para: () => puede('auditoria.ver') },
  { ruta: '/avisos', vista: avisos, titulo: 'Avisos', para: () => true },
  { ruta: '/perfil', vista: perfil, titulo: 'Mi perfil', para: () => true },
  { ruta: '/central/panel', vista: panel, titulo: 'Panel diario', para: () => !esSede() },
  { ruta: '/central/asignar', vista: asignar, titulo: 'Asignar fondos', para: () => puede('sedes.ver_todas') },
  { ruta: '/central/pago', vista: cargar, titulo: 'Pago directo', para: () => puede('gastos.pago_central') },
  { ruta: '/central/sedes/:id', vista: fondos, titulo: 'Sede', para: () => puede('sedes.ver_todas') },
  { ruta: '/central/sedes', vista: sedes, titulo: 'Sedes', para: () => puede('sedes.ver_todas') },
  { ruta: '/central/rendiciones/:sede/:periodo', vista: rendicionRecibida, titulo: 'Rendición', para: () => puede('sedes.ver_todas') },
  { ruta: '/central/rendiciones', vista: recibidas, titulo: 'Rendiciones recibidas', para: () => puede('rendiciones.recibidas') },
  { ruta: '/admin/sedes', vista: adminSedes, titulo: 'Sedes', para: () => puede('admin.sedes') },
  { ruta: '/admin/usuarios', vista: adminUsuarios, titulo: 'Usuarios', para: () => puede('admin.usuarios') },
  { ruta: '/admin/rubros', vista: adminRubros, titulo: 'Rubros', para: () => puede('admin.rubros') },
  { ruta: '/admin/parametros', vista: adminParametros, titulo: 'Parámetros', para: () => puede('admin.parametros') },
  { ruta: '/admin/permisos', vista: adminPermisos, titulo: 'Permisos', para: () => puede('admin.permisos') }
];

function menuSede() {
  return [
    { href: '#/inicio', txt: 'Inicio', ic: 'inicio' },
    puede('gastos.cargar') && { href: '#/cargar', txt: 'Cargar gasto', ic: 'mas', destacado: true },
    { href: '#/gastos', txt: 'Gastos', ic: 'lista' },
    { href: '#/solicitudes', txt: 'Solicitudes', ic: 'solicitud' },
    { href: '#/fondos', txt: 'Fondos', ic: 'banco' },
    { href: '#/proveedores', txt: 'Proveedores', ic: 'proveedor' },
    { href: '#/rendicion', txt: 'Rendición', ic: 'rendicion' },
    { href: '#/certificados', txt: 'Retenciones', ic: 'retencion' },
    puede('auditoria.ver') && { href: '#/auditoria', txt: 'Auditoría', ic: 'escudo' }
  ].filter(Boolean);
}
function menuCentral() {
  const operacion = [
    algun('solicitudes.resolver', 'solicitudes.resolver_escaladas', 'fondos.autorizar_extra', 'rendiciones.recibidas') && { href: '#/central/panel', txt: 'Panel diario', ic: 'panel' },
    puede('gastos.pago_central') && { href: '#/central/pago', txt: 'Pago directo', ic: 'pago', destacado: true },
    puede('sedes.ver_todas') && { href: '#/central/asignar', txt: 'Asignar fondos', ic: 'flechas' },
    puede('sedes.ver_todas') && { href: '#/central/sedes', txt: 'Sedes y saldos', ic: 'edificio' },
    { href: '#/solicitudes', txt: 'Solicitudes', ic: 'solicitud' },
    { href: '#/gastos', txt: 'Gastos', ic: 'lista' },
    puede('rendiciones.recibidas') && { href: '#/central/rendiciones', txt: 'Rendiciones recibidas', ic: 'enviada' },
    { href: '#/certificados', txt: 'Retenciones', ic: 'retencion' },
    { href: '#/proveedores', txt: 'Proveedores', ic: 'proveedor' },
    puede('auditoria.ver') && { href: '#/auditoria', txt: 'Auditoría', ic: 'escudo' }
  ].filter(Boolean);
  const adm = [
    puede('admin.sedes') && { href: '#/admin/sedes', txt: 'Sedes', ic: 'edificio' },
    puede('admin.usuarios') && { href: '#/admin/usuarios', txt: 'Usuarios', ic: 'usuarios' },
    puede('admin.rubros') && { href: '#/admin/rubros', txt: 'Rubros', ic: 'lista' },
    puede('admin.parametros') && { href: '#/admin/parametros', txt: 'Parámetros', ic: 'ajustes' },
    puede('admin.permisos') && { href: '#/admin/permisos', txt: 'Permisos', ic: 'candado' }
  ].filter(Boolean);
  return { operacion, adm };
}

let sinLeer = 0;
const $vista = document.getElementById('vista');
const inicioPorRol = () => (esSede() ? '/inicio' : algun('solicitudes.resolver', 'solicitudes.resolver_escaladas', 'fondos.autorizar_extra', 'rendiciones.recibidas') ? '/central/panel' : '/gastos');

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
  const [ruta, q = ''] = h.split('?');
  return { ruta: ruta || '', query: Object.fromEntries(new URLSearchParams(q)) };
}

function itemMenu(it, actual) {
  const destino = it.href.slice(1);
  const activo = actual === destino || actual.startsWith(destino + '/');
  return html`<a href="${it.href}" class="${it.destacado ? 'menu__cargar' : ''}" ${activo ? html`aria-current="page"` : ''}>${icono(it.ic)}<span>${it.txt}</span></a>`;
}
function menuCompleto(actual) {
  if (esSede()) return menuSede().map(i => itemMenu(i, actual));
  const { operacion, adm } = menuCentral();
  return html`${operacion.map(i => itemMenu(i, actual))}${adm.length ? html`<div class="menu__grupo">Administración</div>${adm.map(i => itemMenu(i, actual))}` : ''}`;
}

function pintarMenus(actual) {
  const sub = usuario.sede_nombre ? `${usuario.rol_nombre} · ${usuario.sede_nombre}` : usuario.rol_nombre;
  pintar(document.getElementById('lateral'), html`
    <a class="lateral__marca" href="#${inicioPorRol()}">${marca()}<span><strong>Fondo rotatorio</strong><small>Círculo de Oficiales FAA</small></span></a>
    <div class="menu">${menuCompleto(actual)}
      <div class="menu__grupo">Mi cuenta</div>
      <a href="#/avisos" ${actual === '/avisos' ? html`aria-current="page"` : ''}>${icono('campana')}<span>Avisos</span>${sinLeer ? html`<span class="menu__badge">${sinLeer}</span>` : ''}</a>
    </div>
    <div class="lateral__pie">
      <a class="avatar" href="#/perfil" aria-label="Mi perfil">${iniciales(usuario.nombre, usuario.apellido)}</a>
      <div><strong>${usuario.nombre} ${usuario.apellido}</strong><small>${sub}</small></div>
      <button type="button" data-salir aria-label="Salir">${icono('salir')}</button>
    </div>`);

  // Barra inferior (celular): lo de todos los días + "Más".
  let inf;
  if (esSede()) {
    const m = menuSede();
    const cargarIt = m.find(i => i.destacado);
    inf = [m[0], m.find(i => i.href === '#/gastos'), cargarIt ? { ...cargarIt, central: true } : m.find(i => i.href === '#/fondos'), m.find(i => i.href === '#/solicitudes'), { mas: true }];
  } else {
    const { operacion } = menuCentral();
    const pago = operacion.find(i => i.destacado);
    inf = [operacion[0], operacion.find(i => i.href === '#/solicitudes'), pago ? { ...pago, central: true } : operacion.find(i => i.href === '#/central/sedes'), operacion.find(i => i.href === '#/central/rendiciones') || operacion.find(i => i.href === '#/gastos'), { mas: true }].filter(Boolean);
  }
  const CORTO = { 'Panel diario': 'Panel', 'Rendiciones recibidas': 'Rendiciones', 'Cargar gasto': 'Cargar', 'Pago directo': 'Pagar', 'Sedes y saldos': 'Sedes' };
  pintar(document.getElementById('nav-inf'), inf.map(it => {
    if (it.mas) return html`<button type="button" data-cajon>${icono('menu')}<span>Más</span></button>`;
    const destino = it.href.slice(1);
    const activo = actual === destino || actual.startsWith(destino + '/');
    if (it.central) return html`<a href="${it.href}" class="nav-inf__central" ${activo ? html`aria-current="page"` : ''}><span class="boton-central">${icono(it.ic)}</span><span>${CORTO[it.txt] || it.txt}</span></a>`;
    return html`<a href="${it.href}" ${activo ? html`aria-current="page"` : ''}>${icono(it.ic)}<span>${CORTO[it.txt] || it.txt}</span></a>`;
  }));
  document.getElementById('barra-sede').textContent = sub;
  pintar(document.getElementById('barra-campana'), html`${icono('campana')}${sinLeer ? html`<span class="campana__n">${sinLeer}</span>` : ''}`);
}

function abrirCajon() {
  const actual = leerHash().ruta;
  const fondo = document.createElement('div');
  fondo.className = 'cajon-fondo';
  const cajon = document.createElement('div');
  cajon.className = 'cajon';
  cajon.setAttribute('role', 'dialog');
  cajon.setAttribute('aria-label', 'Todas las secciones');
  pintar(cajon, html`<div class="menu">${menuCompleto(actual)}
    <div class="menu__grupo">Mi cuenta</div>
    ${itemMenu({ href: '#/avisos', txt: 'Avisos', ic: 'campana' }, actual)}${itemMenu({ href: '#/perfil', txt: 'Mi perfil', ic: 'usuario' }, actual)}
    <button type="button" data-salir>${icono('salir')}<span>Salir</span></button></div>`);
  document.body.append(fondo, cajon);
  requestAnimationFrame(() => { fondo.classList.add('abierto'); cajon.classList.add('abierto'); });
  const cerrar = () => { fondo.remove(); cajon.remove(); };
  fondo.addEventListener('click', cerrar);
  cajon.addEventListener('click', (e) => { if (e.target.closest('a')) cerrar(); });
  window.addEventListener('hashchange', cerrar, { once: true });
}

async function salir() { try { await post('/api/auth/logout'); } finally { location.href = '/'; } }
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-salir]')) salir();
  if (e.target.closest('[data-cajon]')) abrirCajon();
});

async function actualizarAvisos() {
  try {
    const { sin_leer } = await get('/api/notificaciones/contador');
    if (sin_leer !== sinLeer) { sinLeer = sin_leer; pintarMenus(leerHash().ruta); }
  } catch { /* sin conexión: se reintenta en el próximo ciclo */ }
}

let token = 0;
async function navegar(opciones = {}) {
  const { ruta, query } = leerHash();
  if (!ruta) { location.replace(`#${inicioPorRol()}`); return; }
  if (usuario.debe_cambiar_password && ruta !== '/perfil') { location.replace('#/perfil'); return; }
  let destino = null; let params = {};
  for (const r of RUTAS) { const p = coincide(r.ruta, ruta); if (p) { destino = r; params = p; break; } }
  if (!destino || !destino.para()) { location.replace(`#${inicioPorRol()}`); return; }

  pintarMenus(ruta);
  document.getElementById('barra-seccion').textContent = destino.titulo;
  document.title = `${destino.titulo} · Fondo rotatorio`;
  const mio = ++token;
  const el = document.createElement('div');
  if (!opciones.mantener) pintar($vista, cargando());
  const ctx = {
    el, usuario, params, query, puede, esSede: esSede(),
    vigente: () => mio === token,
    ir: (h) => { location.hash = h; },
    recargar: () => navegar({ mantener: true }),
    avisos: actualizarAvisos
  };
  try {
    await destino.vista(ctx);
    if (mio !== token) return;
    $vista.replaceChildren(el);
    if (!opciones.mantener) window.scrollTo(0, 0);
  } catch (e) {
    if (mio !== token) return;
    pintar($vista, html`<div class="vacio">${icono('alerta')}<p>${e.message || 'No se pudo cargar esta sección.'}</p><button class="btn btn--sec" type="button" data-reintentar>Reintentar</button></div>`);
    $vista.querySelector('[data-reintentar]')?.addEventListener('click', () => navegar());
    if (e.status !== 401) error(e);
  }
}

async function arrancar() {
  try {
    usuario = (await get('/api/auth/me')).usuario;
  } catch { location.href = '/'; return; }
  try { sinLeer = (await get('/api/notificaciones/contador')).sin_leer; } catch { /* sigue igual */ }
  window.addEventListener('hashchange', () => { navegar(); actualizarAvisos(); });
  navegar();
  setInterval(actualizarAvisos, 60000);
}

arrancar();
