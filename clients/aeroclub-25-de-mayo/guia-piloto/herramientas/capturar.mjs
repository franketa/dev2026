// Capturas de la app para la guía, con Chrome headless por CDP (sin dependencias).
// Antes: sh herramientas/preparar-demo.sh y levantar la app con esa base en el puerto 3918.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://localhost:3918';
const OUT = join(import.meta.dirname, '..', '.capturas');
const PERFIL = join(import.meta.dirname, '..', '.chrome');
mkdirSync(OUT, { recursive: true });
rmSync(PERFIL, { recursive: true, force: true });
const W = 390, H = 844;

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${PERFIL}`, '--no-first-run', '--hide-scrollbars',
  '--disable-gpu', '--lang=es-AR', 'about:blank'
], { stdio: 'ignore' });

const esperar = (ms) => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 50 && !ws; i++) {
  try { ws = (await (await fetch('http://127.0.0.1:9333/json/version')).json()).webSocketDebuggerUrl; } catch { await esperar(200); }
}
const sock = new WebSocket(ws);
await new Promise(r => sock.addEventListener('open', r));
let id = 0; const pend = new Map();
sock.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const n = ++id; pend.set(n, { res, rej }); sock.send(JSON.stringify({ id: n, method, params, sessionId }));
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
const cdp = (m, p) => send(m, p, S);
await cdp('Page.enable');
await cdp('Runtime.enable');
const metricas = (h = H) => cdp('Emulation.setDeviceMetricsOverride', { width: W, height: h, deviceScaleFactor: 2, mobile: true });
await metricas();
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });

async function ev(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${expr.slice(0, 80)}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
}
async function ir(url, ms = 1500) { await cdp('Page.navigate', { url }); await esperar(ms); }
async function foto(nombre, { completa = false } = {}) {
  if (completa) {
    const alto = await ev('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)');
    await metricas(Math.max(H, alto));
    await esperar(400);
  }
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${nombre}.png`), Buffer.from(data, 'base64'));
  if (completa) { await metricas(); await esperar(200); }
  console.log('✓', nombre);
}
async function entrar(email, pass = 'piloto1234') {
  await ir(`${BASE}/`, 800);
  await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'X-A25':'1'}}).then(()=>1)`);
  const r = await ev(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-A25':'1'},body:JSON.stringify({email:${JSON.stringify(email)},password:${JSON.stringify(pass)}})}).then(r=>r.status)`);
  if (r !== 200) throw new Error(`login ${email}: ${r}`);
}
const clic = (sel) => ev(`(document.querySelector(${JSON.stringify(sel)}) || (()=>{throw new Error('no está ${sel}')})()).click(), 1`);
const escribir = (sel, valor) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.value = ${JSON.stringify(valor)};
  e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); return 1; })()`);


// Navegación limpia: pasar por about:blank cierra cualquier ventana que haya quedado abierta.
async function irLimpio(url, ms = 1500) { await cdp('Page.navigate', { url: 'about:blank' }); await esperar(150); await cdp('Page.navigate', { url }); await esperar(ms); }

// Recorte de un elemento (busca con una expresión JS que devuelve el elemento).
async function recorte(nombre, buscar, { maxAlto = 2000, margen = 10 } = {}) {
  const alto = await ev('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)');
  await metricas(Math.max(H, alto));
  await esperar(350);
  const r = await ev(`(() => { const e = (${buscar}); if (!e) throw new Error('no encontré el elemento'); const b = e.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height }; })()`);
  const clip = { x: Math.max(0, r.x - margen), y: Math.max(0, r.y - margen), width: Math.min(W, r.w + margen * 2), height: Math.min(maxAlto, r.h) + margen * 2, scale: 1 };
  const { data } = await cdp('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
  writeFileSync(join(OUT, `${nombre}.png`), Buffer.from(data, 'base64'));
  await metricas(); await esperar(150);
  console.log('✓', nombre);
}
const conTitulo = (sel, txt) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(e => (e.querySelector('h2')?.textContent || '').includes(${JSON.stringify(txt)}))`;
const q = (sel, i = 0) => `document.querySelectorAll(${JSON.stringify(sel)})[${i}]`;

try {
  // Ingreso
  await irLimpio(`${BASE}/`, 800);
  await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'X-A25':'1'}}).then(()=>1)`);
  await irLimpio(`${BASE}/`, 1200);
  await foto('01-ingreso');
  await escribir('#email', 'sofia.cabrera@demo.com');
  await escribir('#password', 'contraseña-mal');
  await clic('#form-ingreso [type=submit]'); await esperar(900);
  await recorte('01b-ingreso-error', q('#ingreso-error'));

  // Primera vez: contraseña temporal
  await entrar('mateo.ledesma@demo.com');
  await irLimpio(`${BASE}/app#/inicio`, 1800);
  await foto('02-bienvenida');

  // Inicio
  await entrar('sofia.cabrera@demo.com');
  await irLimpio(`${BASE}/app#/inicio`, 1800);
  await foto('03-inicio');
  await recorte('03a-saldo', q('.saldo'));
  await recorte('03b-pagar', q('.pagar'));
  await recorte('03c-cta-cargar', q('.cta-cargar'));
  await recorte('03d-ultimo-cupon', conTitulo('section.panel', 'Último cupón'));
  await recorte('03e-ultimos-vuelos', conTitulo('section.panel', 'Últimos vuelos'));
  await recorte('03f-horas-avion', conTitulo('section.pila', 'Tus horas por avión'));
  await recorte('03g-nav', q('#nav-inf'), { margen: 0 });
  await ev(`document.querySelector('.saldo .ayuda').click(), 1`); await esperar(500);
  await foto('04-ayuda-saldo');

  // Cargar vuelo
  await irLimpio(`${BASE}/app#/cargar`, 1600);
  await foto('05-cargar');
  await ev(`(() => { const r = document.querySelector('input[name=avion_id]'); r.checked = true; r.dispatchEvent(new Event('change', {bubbles:true})); return 1; })()`);
  await escribir('[name=salida_h]', '14'); await escribir('[name=salida_m]', '30');
  await escribir('[name=llegada_h]', '15'); await escribir('[name=llegada_m]', '42');
  await ev(`(() => { const r = document.querySelector('input[name=tipo][value=instruccion]'); r.checked = true; r.dispatchEvent(new Event('change', {bubbles:true})); return 1; })()`);
  await esperar(300);
  await ev(`(() => { const s = document.querySelector('#instructor'); s.value = [...s.options].find(o => o.value && !o.disabled).value; s.dispatchEvent(new Event('change', {bubbles:true})); return 1; })()`);
  await escribir('#notas', 'Le faltaba aceite: cargué 1 qt. Todo lo demás en orden.');
  await ev(`document.activeElement.blur(), 1`); await esperar(400);
  for (let i = 0; i < 6; i++) await recorte(`05${'abcdef'[i]}-paso${i + 1}`, q('.carga__paso', i));
  await clic('#form-vuelo [type=submit]'); await esperar(800);
  await foto('06-revisa-vuelo');
  await ev(`[...document.querySelectorAll('.modal button')].find(b => /Aceptar/.test(b.textContent)).click(), 1`); await esperar(2200);
  await foto('07-vuelo-guardado');

  // Mis vuelos
  await irLimpio(`${BASE}/app#/vuelos`, 1800);
  await foto('08-mis-vuelos');
  await recorte('08a-cifras', q('.cifras'));
  await recorte('08b-tiras', q('.tiras'), { maxAlto: 640 });
  await recorte('08c-historico', conTitulo('section.panel', 'Desde el principio'));
  await ev(`document.querySelectorAll('.tira')[0].click(), 1`); await esperar(1000);
  await foto('09-detalle-vuelo');
  await irLimpio(`${BASE}/app#/vuelos?periodo=2026-09`, 1800);
  await recorte('08d-tiras-facturadas', q('.tiras'), { maxAlto: 420 });

  // Mi cuenta
  await irLimpio(`${BASE}/app#/cuenta`, 1800);
  await foto('10-cuenta');
  await recorte('10a-saldo', q('.saldo'));
  await recorte('10b-cupones', conTitulo('section.panel', 'Cupones'));
  await recorte('10c-movimientos', conTitulo('section.panel', 'Movimientos'), { maxAlto: 700 });
  await clic('.vista__acciones [data-informar]'); await esperar(800);
  await escribir('#ip-nota', 'Transferí desde mi cuenta del Banco Provincia');
  await foto('11-informar-pago');
  await ev(`document.querySelector('.modal [type=submit]').click(), 1`); await esperar(1800);
  await irLimpio(`${BASE}/app#/cuenta`, 1800);
  await recorte('10d-tus-pagos', conTitulo('section.panel', 'Tus pagos'));

  // Cupón en PDF
  const pdf = await ev(`fetch('/api/cuenta').then(r => r.json()).then(d => fetch('/api/cupones/' + d.cupones[0].id + '/pdf')).then(r => r.arrayBuffer()).then(b => { let s = ''; const u = new Uint8Array(b); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); })`);
  writeFileSync(join(OUT, 'cupon.pdf'), Buffer.from(pdf, 'base64'));
  console.log('✓ cupon.pdf');

  // Perfil
  await irLimpio(`${BASE}/app#/perfil`, 1500);
  await foto('12-perfil');
  await recorte('12a-datos', conTitulo('section.panel', 'Tus datos'));

  // Novedades (ya hay una: la del vuelo recién cargado)
  await irLimpio(`${BASE}/app#/inicio`, 1800);
  await recorte('03h-novedades', conTitulo('section.panel', 'Novedades de la flota')).catch(e => console.log('sin novedades', e.message));

  // Avisos
  await entrar('hernan.iturralde@demo.com');
  await irLimpio(`${BASE}/app#/inicio`, 1800);
  await recorte('13a-bloqueado', q('.aviso'));
  await recorte('13b-cargar-bloqueado', q('.cta-cargar'));
  await entrar('julian.pereyra@demo.com');
  await irLimpio(`${BASE}/app#/inicio`, 1800);
  await recorte('13c-cma-vencido', q('.aviso'));
  await entrar('martin.olivera@demo.com');
  await irLimpio(`${BASE}/app#/inicio`, 1800);
  await recorte('13d-cma-por-vencer', q('.aviso'));
  await entrar('tomas.aguirre@demo.com');
  await irLimpio(`${BASE}/app#/inicio`, 1800);
  await recorte('13e-email', q('.aviso--link'));
} catch (e) {
  console.error('ERROR', e.message);
  await foto('zz-error').catch(() => {});
} finally {
  sock.close();
  chrome.kill();
}
