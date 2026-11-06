/* ==========================================================================
   Tesorería · Caja y Pagos — Aeroclub 25 de Mayo
   Módulo encapsulado. No toca nada fuera de su contenedor.

   Uso en la plataforma (assets/js/views/tesoreria.js):
     import tesoreria from './tesoreria.js';           // export por defecto = vista
     { ruta: '/admin/tesoreria', vista: tesoreria, titulo: 'Tesorería', para: 'staff' }
   La vista recibe ctx = { el, usuario, params, query, esAdmin, esStaff, ir, ... }.
   Edita sólo si ctx.esAdmin; el rol "consulta" ve todo en modo lectura.

   Uso aislado:  montar(elemento, { adapter, permisos:{editar:true}, seccion })

   Almacenamiento: todo pasa por un adaptador con tres métodos
     cargar(alCambiar) -> Promise<{ [ruta]: objeto }>
     guardar(ruta, objeto) -> Promise
     borrar(ruta) -> Promise
   Rutas usadas: movs/<id>, pend/<ID>, socios/<id>, cuentas/<id>, app/cfg.
   Contrato REST sugerido para el adaptador de la plataforma (adaptadorApi):
     GET    /api/admin/tesoreria/docs          -> { docs: { "<ruta>": {...}, ... } }
     PUT    /api/admin/tesoreria/docs/<ruta>   (cuerpo = objeto)
     DELETE /api/admin/tesoreria/docs/<ruta>
   ========================================================================== */

/* ---------------- Constantes ---------------- */
const MEDIOS = ['Efectivo Pesos', 'Banco Nación', 'Banco Santander', 'Efectivo USD', 'Banco Nación USD'];
const MEDIOS_SEL = ['Efectivo Pesos', 'Efectivo USD', 'Banco Nación', 'Banco Santander', 'Banco Nación USD'];
const MEDIO_HDR = ['Efectivo $', 'Banco Nación $', 'Banco Santander $', 'Efectivo USD', 'Banco Nación USD'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const LIM = { movs: 3500, pend: 500, socios: 500, cuentas: 60 };
const TZ = 'America/Argentina/Buenos_Aires';
const SECCIONES = [
  ['resumen', 'Resumen'], ['movimientos', 'Ingresos y gastos'], ['pendientes', 'Pendientes'],
  ['saldos', 'Saldos caja y bancos'], ['listado', 'Listado contable'], ['socios', 'Socios y entidades'],
  ['cuentas', 'Cuentas contables'], ['instrucciones', 'Instrucciones']
];
let XLSX_URL = '/assets/js/vendor/xlsx.full.min.js'; // el sitio exige scripts del mismo origen (CSP)

/* ---------------- Utilidades ---------------- */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lc = (s) => String(s == null ? '' : s).toLowerCase();
const eq = (a, b) => lc(a) === lc(b);
const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n) => (n === '' || n == null || isNaN(n) ? '' : nf.format(n));
const money = (n) => (n < 0 ? '<span class="monto--neg">' + fmt(n) + '</span>' : fmt(n));
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const d2n = (i) => Date.UTC(+i.slice(0, 4), +i.slice(5, 7) - 1, +i.slice(8, 10)) / 864e5;
const n2d = (n) => new Date(Math.round(n * 864e5)).toISOString().slice(0, 10);
const addD = (i, k) => n2d(d2n(i) + k);
const fmtD = (i) => (i ? i.slice(8, 10) + '/' + i.slice(5, 7) + '/' + i.slice(0, 4) : '');
const pad = (n, w) => String(n).padStart(w, '0');
const mStart = (y, m) => y + '-' + pad(m, 2) + '-01';
const mEnd = (y, m) => n2d(d2n(m === 12 ? (y + 1) + '-01-01' : y + '-' + pad(m + 1, 2) + '-01') - 1);
const numOrNull = (v) => { if (v === '' || v == null) return null; const n = +v; return isNaN(n) ? null : n; };
const esUsd = (medio) => /usd$/i.test(medio || '');
function serial2iso(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return n2d(v - 25569);
  const s = String(v).trim(); let m;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return m[3] + '-' + pad(m[2], 2) + '-' + pad(m[1], 2);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

/* ---------------- Adaptadores de almacenamiento ---------------- */
export function adaptadorLocal(clave = 'tesoreria_aero_v1') {
  let docs = {};
  const salvar = () => { try { localStorage.setItem(clave, JSON.stringify(docs)); } catch (e) { /* sin almacenamiento */ } };
  return {
    etiqueta: 'Datos guardados solo en este navegador',
    cargar() { try { docs = JSON.parse(localStorage.getItem(clave)) || {}; } catch (e) { docs = {}; } return Promise.resolve({ ...docs }); },
    guardar(r, o) { docs[r] = o; salvar(); return Promise.resolve(); },
    borrar(r) { delete docs[r]; salvar(); return Promise.resolve(); }
  };
}

export function adaptadorApi(base = '/api/admin/tesoreria', http = {}) {
  const ruta = (r) => base + '/docs/' + r.split('/').map(encodeURIComponent).join('/');
  const pedir = async (url, init) => {
    const r = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-A25': '1' }, ...init });
    if (!r.ok) { const e = new Error((await r.json().catch(() => ({}))).error || 'No se pudo completar la operación.'); e.status = r.status; throw e; }
    return r.status === 204 ? null : r.json();
  };
  return {
    etiqueta: '',
    cargar: async () => (await (http.get ? http.get(base + '/docs') : pedir(base + '/docs'))).docs || {},
    guardar: (r, o) => (http.put ? http.put(ruta(r), o) : pedir(ruta(r), { method: 'PUT', body: JSON.stringify(o) })),
    borrar: (r) => pedir(ruta(r), { method: 'DELETE' })
  };
}

/* ---------------- Vista para la plataforma ---------------- */
export default async function tesoreria(ctx) {
  const adapter = ctx.adapter || adaptadorApi('/api/admin/tesoreria');
  const api = montar(ctx.el, {
    adapter,
    permisos: { editar: !!ctx.esAdmin },
    seccion: ctx.query && ctx.query.s,
    alCambiarSeccion: (s) => { try { history.replaceState(null, '', '#/admin/tesoreria?s=' + s); } catch (e) { /* nada */ } }
  });
  await api.listo;
}

/* ---------------- Módulo ---------------- */
export function montar(root, opts = {}) {
  const adapter = opts.adapter || adaptadorLocal();
  if (opts.xlsxUrl) XLSX_URL = opts.xlsxUrl;
  const canEdit = !opts.permisos || opts.permisos.editar !== false;
  let docs = {};
  let cargado = false;
  let errorCarga = '';
  let rT = 0, pendiente = false, toastT = 0, destruido = false;
  const ui = {
    tab: SECCIONES.some((t) => t[0] === opts.seccion) ? opts.seccion : 'resumen',
    corte: '', moneda: 'ARS', mesAn: '',
    lst: { tipo: 'Mensual', mes: +today().slice(5, 7) - 1, anio: Math.min(2030, Math.max(2026, +today().slice(0, 4))), desde: today().slice(0, 8) + '01', hasta: today() },
    fMes: '', fTxt: '', showAll: false, confirm: null, imp: null, comp: null, draft: { mov: {}, pend: {}, soc: {}, cta: {}, reg: {} }
  };

  root.innerHTML =
    '<div class="tes">' +
    '<div class="tes-cab"><div class="vista__cab"><div><h1>Caja</h1><p>Caja, cobros y pagos del Aeroclub. Los saldos y vencimientos se calculan solos a partir de lo que cargues.</p></div>' +
    '<div class="vista__acciones"><span class="tes-estado muted chico"></span>' +
    '<button class="btn btn--principal tes-solo-edit" type="button" data-impext>Importar extracto</button>' +
    '<label class="btn btn--sec tes-solo-edit" data-impl>Importar planilla .xlsx<input type="file" accept=".xlsx,.xls" data-imp hidden></label>' +
    '<button class="btn btn--sec" type="button" data-exp>Exportar a Excel</button></div></div>' +
    '<nav class="tes-tabs" role="tablist"></nav></div><div class="tes-main"></div>' +
    '<div class="tes-pop" role="listbox" hidden></div>' +
    '<div class="tes-toast" role="status" hidden></div></div>';
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => root.querySelectorAll(s);
  const main = $('.tes-main');
  if (!canEdit) { ['[data-impl]', '[data-impext]'].forEach((q) => { const l = $(q); if (l) l.hidden = true; }); }
  if (adapter.etiqueta) $('.tes-estado').textContent = adapter.etiqueta;

  function toast(msg) { const t = $('.tes-toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3800); }

  /* ---- Datos ---- */
  const cadenas = {};
  function put(path, obj) {
    docs[path] = obj;
    const p = (cadenas[path] || Promise.resolve()).then(() => adapter.guardar(path, obj)).catch((e) => toast('No se pudo guardar: ' + ((e && e.message) || 'error')));
    cadenas[path] = p; return p;
  }
  function del(path) {
    delete docs[path];
    return Promise.resolve(adapter.borrar(path)).catch((e) => toast('No se pudo borrar: ' + ((e && e.message) || 'error')));
  }
  function coll(name) {
    const pre = name + '/', out = [];
    for (const k in docs) if (k.indexOf(pre) === 0) out.push({ ...docs[k], _p: k });
    out.sort((a, b) => (a.n || 0) - (b.n || 0) || (a._p < b._p ? -1 : 1));
    return out;
  }
  const cfg = () => docs['app/cfg'] || {};
  const porNombre = (a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base', numeric: true });

  /* ---- Cálculos (equivalen a las fórmulas de la planilla) ---- */
  function derive() {
    const corte = ui.corte || today(), moneda = ui.moneda;
    const M = coll('movs').map((m, i) => {
      const cob = +m.cob || 0, pag = +m.pag || 0, f = m.f || '';
      return { ...m, cob, pag, saldo: cob - pag, mes: f ? +f.slice(5, 7) : '', anio: f ? +f.slice(0, 4) : '', idx: i };
    });
    // Ordenados por fecha (los más antiguos primero); a igual fecha, por orden de carga. Sin fecha, al final.
    M.sort((a, b) => ((a.f || '9999') < (b.f || '9999') ? -1 : (a.f || '9999') > (b.f || '9999') ? 1 : (a.n || 0) - (b.n || 0)));
    M.forEach((m, i) => { m.idx = i; });
    const P = coll('pend').map((p) => {
      const imp = numOrNull(p.imp); let cobrado = '', saldo = '', estado = '', dias = '';
      if (imp !== null) {
        cobrado = 0;
        M.forEach((m) => { if (m.ref && eq(m.ref, p.id)) cobrado += (p.tipo === 'Por cobrar' ? m.cob : m.pag); });
        saldo = imp - cobrado;
        if (saldo <= 0) estado = p.tipo === 'Por cobrar' ? 'Cobrado' : 'Pagado';
        else if (p.fv && p.fv < corte) estado = 'Vencido';
        else estado = cobrado > 0 ? 'Parcial' : 'Pendiente';
        dias = (p.fv && saldo > 0) ? Math.max(0, d2n(corte) - d2n(p.fv)) : '';
      }
      return { ...p, imp, cobrado, saldo, estado, dias };
    });
    P.sort((a, b) => (a.id < b.id ? -1 : 1));
    const open = P.filter((p) => p.saldo !== '' && p.saldo > 0 && eq(p.mon, moneda));
    const sum = (tipo, pred) => open.filter((p) => p.tipo === tipo && (!pred || (p.fv && pred(p.fv)))).reduce((s, p) => s + p.saldo, 0);
    const R = {};
    ['Por cobrar', 'Por pagar'].forEach((t) => {
      const tot = sum(t), b1 = sum(t, (e) => e < corte && e >= addD(corte, -30)), b2 = sum(t, (e) => e < addD(corte, -30) && e >= addD(corte, -60)),
        b3 = sum(t, (e) => e < addD(corte, -60) && e >= addD(corte, -90)), b4 = sum(t, (e) => e < addD(corte, -90));
      R[t] = { tot, venc: sum(t, (e) => e < corte), prox: sum(t, (e) => e >= corte && e <= addD(corte, 30)), n: open.filter((p) => p.tipo === t).length, aging: [tot - (b1 + b2 + b3 + b4), b1, b2, b3, b4] };
    });
    const mesAn = ui.mesAn || corte.slice(0, 7), y = +mesAn.slice(0, 4), mo = +mesAn.slice(5, 7);
    const d0 = mStart(y, mo), d1 = mo === 12 ? mStart(y + 1, 1) : mStart(y, mo + 1);
    const cuentas = coll('cuentas');
    const porCta = cuentas.map((c) => {
      let cob = 0, pag = 0;
      M.forEach((m) => { if (eq(m.cta, c.nombre) && m.f && m.f >= d0 && m.f < d1 && !esUsd(m.medio)) { cob += m.cob; pag += m.pag; } });
      return { nombre: c.nombre, cob, pag, neto: cob - pag };
    });
    const c = cfg(), run = [0, 1, 2, 3, 4].map((i) => +c['s' + i] || 0), saldos = [];
    for (let k = 0; k < 25; k++) {
      const yy = 2026 + Math.floor((9 + k) / 12), mm = ((9 + k) % 12) + 1, row = { y: yy, m: mm, v: [] };
      for (let e = 0; e < 5; e++) {
        let s = 0; M.forEach((m) => { if (m.mes === mm && m.anio === yy && eq(m.medio, MEDIOS[e])) s += m.saldo; });
        run[e] += s; row.v.push(run[e]);
      }
      saldos.push(row);
    }
    const socios = coll('socios').map((s) => {
      const f = (t, mn) => P.filter((p) => p.saldo !== '' && p.saldo > 0 && eq(p.per, s.nombre) && p.tipo === t && p.mon === mn).reduce((a, p) => a + p.saldo, 0);
      return { ...s, cA: f('Por cobrar', 'ARS'), pA: f('Por pagar', 'ARS'), cU: f('Por cobrar', 'USD'), pU: f('Por pagar', 'USD') };
    });
    socios.sort(porNombre);
    const L = ui.lst; let desde, hasta;
    if (L.tipo === 'Mensual') { desde = mStart(+L.anio, +L.mes + 1); hasta = mEnd(+L.anio, +L.mes + 1); } else { desde = L.desde; hasta = L.hasta; }
    const items = M.filter((m) => m.f && desde && hasta && m.f >= desde && m.f <= hasta && (m.cob + m.pag) !== 0)
      .sort((a, b) => (a.f < b.f ? -1 : a.f > b.f ? 1 : a.idx - b.idx))
      .map((m) => ({ ...m, mon: esUsd(m.medio) ? 'USD' : 'ARS' }));
    const sinC = items.filter((m) => !m.cta).length, sinM = items.filter((m) => !m.medio).length;
    const aviso = (L.tipo !== 'Mensual' && L.hasta < L.desde) ? 'Revisá: Hasta es anterior a Desde' : items.length === 0 ? 'No hay movimientos en el período' : (sinC + sinM === 0 ? 'Sin observaciones' : 'Completar cuenta / medio de pago');
    const tot = (mn) => { let a = 0, b = 0; items.forEach((m) => { if (m.mon === mn) { a += m.cob; b += m.pag; } }); return { cob: a, pag: b, neto: a - b }; };
    return { corte, M, P, R, mesAn, porCta, saldos, socios, cuentas, L: { desde, hasta, items, sinC, sinM, aviso, ars: tot('ARS'), usd: tot('USD') } };
  }

  /* ---- Piezas de interfaz ---- */
  const fld = (l, inner, cls) => '<div class="campo ' + (cls || '') + '"><label class="campo__label">' + l + '</label>' + inner + '</div>';
  const numIn = (doc, f, v) => '<input type="number" step="0.01" data-doc="' + esc(doc) + '" data-f="' + f + '" data-t="num" value="' + (v == null ? '' : esc(v)) + '">';
  const txtIn = (doc, f, v, list, cls) => '<input type="text" data-doc="' + esc(doc) + '" data-f="' + f + '" value="' + esc(v) + '"' + (list ? ' data-lista="' + list + '" autocomplete="off"' : '') + (cls ? ' class="' + cls + '"' : '') + '>';
  const datIn = (doc, f, v) => '<input type="date" data-doc="' + esc(doc) + '" data-f="' + f + '" value="' + esc(v) + '">';
  const selIn = (doc, f, v, opts2) => {
    const o = opts2.slice(); if (v && o.indexOf(v) < 0) o.push(v);
    return '<select data-doc="' + esc(doc) + '" data-f="' + f + '"><option value=""></option>' + o.map((x) => '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>';
  };
  const dIn = (kind, f, v, type, list, extra) => '<input id="tes-d-' + kind + '-' + f + '-' + uid + '" type="' + type + '" data-draft="' + kind + '" data-f="' + f + '" value="' + esc(v == null ? '' : v) + '"' + (list ? ' data-lista="' + list + '" autocomplete="off"' : '') + (extra || '') + '>';
  const dSel = (kind, f, v, opts2) => '<select id="tes-d-' + kind + '-' + f + '-' + uid + '" data-draft="' + kind + '" data-f="' + f + '"><option value=""></option>' + opts2.map((x) => '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>';
  const chipEstado = (e) => { if (!e) return ''; const c = e === 'Vencido' ? 'chip--mal' : e === 'Parcial' ? 'chip--pend' : (e === 'Cobrado' || e === 'Pagado') ? 'chip--ok' : 'chip--neutro'; return '<span class="chip ' + c + '">' + e + '</span>'; };
  const delBtn = (path) => '<button class="btn btn--chico btn--fantasma tes-peligro" type="button" data-del="' + esc(path) + '"' + (canEdit ? '' : ' disabled') + '>' + (ui.confirm === path ? '¿Seguro?' : 'Borrar') + '</button>';
  const panel = (titulo, cuerpo, nota) => '<section class="panel"><div class="panel__cab"><h2>' + titulo + '</h2></div>' + (nota ? '<p class="tes-nota">' + nota + '</p>' : '') + cuerpo + '</section>';
  const tablaFija = (head, body, cls, extra) => tabla(head, body, cls).replace('class="tabla-caja"', 'class="tabla-caja tes-fija' + (extra ? ' ' + extra : '') + '"');
  const fijo = (h) => '<div class="tes-fijo">' + h + '</div>';
  const tabla = (head, body, cls) => '<div class="tabla-caja"><table class="tabla ' + (cls || '') + '"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  const th = (t, n) => '<th' + (n ? ' class="num"' : '') + '>' + t + '</th>';
  const td = (t, n, c) => '<td class="' + (n ? 'num ' : '') + (c || '') + '">' + t + '</td>';
  const uid = Math.random().toString(36).slice(2, 7);

  /* ---- Vistas ---- */
  function vResumen(D) {
    const R = D.R, mon = ui.moneda;
    const mx = Math.max(1, ...R['Por cobrar'].aging, ...R['Por pagar'].aging);
    const bar = (v) => '<td class="num tes-barcell"><i style="width:' + Math.max(0, Math.min(100, v / mx * 100)) + '%"></i><span>' + money(v) + '</span></td>';
    const ag = ['No vencido / sin vencimiento', 'Vencido 1-30 días', 'Vencido 31-60 días', 'Vencido 61-90 días', 'Vencido más de 90 días'];
    const rows = [['Saldo pendiente total', 'tot'], ['De lo cual vencido', 'venc'], ['Vence en los próximos 30 días', 'prox']];
    let h = '<section class="panel tes-pad"><div class="tes-ctl">' +
      fld('Fecha de corte', '<div class="tes-inline"><input type="date" data-id="corte" value="' + esc(D.corte) + '"><button class="btn btn--sec btn--chico" type="button" data-hoy>Hoy</button></div>') +
      fld('Moneda a analizar', '<div class="tes-seg" role="group"><button type="button" data-moneda="ARS" aria-pressed="' + (mon === 'ARS') + '">ARS</button><button type="button" data-moneda="USD" aria-pressed="' + (mon === 'USD') + '">USD</button></div>') +
      '<p class="tes-nota" style="flex:1 1 240px;margin:0">Por defecto es la fecha de hoy; podés fijar otra para ver la situación a ese día.</p></div></section>';
    h = fijo(h);
    let a = rows.map((r) => { const x = R['Por cobrar'][r[1]], y = R['Por pagar'][r[1]]; return '<tr>' + td(r[0]) + td(money(x), 1) + td(money(y), 1) + td(money(x - y), 1) + '</tr>'; }).join('');
    a += '<tr>' + td('Documentos abiertos (cantidad)') + td(R['Por cobrar'].n, 1) + td(R['Por pagar'].n, 1) + td('') + '</tr>';
    let b = ag.map((l, i) => '<tr>' + td(l) + bar(R['Por cobrar'].aging[i]) + bar(R['Por pagar'].aging[i]) + '</tr>').join('');
    const sm = (x) => x.reduce((p, q) => p + q, 0);
    b += '<tr class="tes-tot">' + td('Total') + td(money(sm(R['Por cobrar'].aging)), 1) + td(money(sm(R['Por pagar'].aging)), 1) + '</tr>';
    h += '<div class="tes-grid2">' + panel('Situación al corte · ' + mon, tabla(th('') + th('Por cobrar', 1) + th('Por pagar', 1) + th('Neto (cobrar − pagar)', 1), a)) +
      panel('Antigüedad según vencimiento', tabla(th('') + th('Por cobrar', 1) + th('Por pagar', 1), b)) + '</div>';
    let tc = 0, tp = 0; D.porCta.forEach((c) => { tc += c.cob; tp += c.pag; });
    let c2 = D.porCta.map((c) => '<tr>' + td(esc(c.nombre)) + td(money(c.cob), 1) + td(money(c.pag), 1) + td(money(c.neto), 1) + '</tr>').join('');
    if (!D.porCta.length) c2 = '<tr><td colspan="4" class="tes-nota">Cargá cuentas en la sección “Cuentas contables”.</td></tr>';
    c2 += '<tr class="tes-tot">' + td('Total') + td(money(tc), 1) + td(money(tp), 1) + td(money(tc - tp), 1) + '</tr>';
    h += panel('Movimientos del mes por cuenta (en pesos)',
      '<div class="tes-pad tes-sep">' + fld('Mes a analizar', '<input type="month" data-id="mesAn" value="' + esc(D.mesAn) + '">') + '</div>' +
      tabla(th('Cuenta') + th('Cobros', 1) + th('Pagos', 1) + th('Neto', 1), c2) +
      '<p class="tes-nota tes-pad">Cuentas en dólares (Efectivo USD / Banco Nación USD) excluidas de esta tabla.</p>');
    return h;
  }

  function vMovs(D) {
    const d = ui.draft.mov, all = D.M, meses = {};
    all.forEach((m) => { if (m.f) meses[m.f.slice(0, 7)] = 1; });
    const ml = Object.keys(meses).sort().reverse(), q = lc(ui.fTxt);
    let rows = all.filter((m) => {
      if (ui.fMes && (!m.f || m.f.slice(0, 7) !== ui.fMes)) return false;
      if (q && lc([m.tc, m.nro, m.det, m.soc, m.cta, m.medio, m.ref].join(' ')).indexOf(q) < 0) return false;
      return true;
    });
    const total = rows.length, cut = (!ui.showAll && total > 200);
    if (cut) rows = rows.slice(total - 200);
    rows = rows.slice().reverse(); // el movimiento más reciente siempre arriba
    const ctas = coll('cuentas').map((c) => c.nombre), socs = coll('socios').map((c) => c.nombre);
    let h = panel('Agregar movimiento', '<div class="tes-add">' +
      fld('Fecha', dIn('mov', 'f', d.f == null ? today() : d.f, 'date')) + fld('Tipo comprob.', dIn('mov', 'tc', d.tc, 'text', 'tc')) + fld('Comprob. N°', dIn('mov', 'nro', d.nro, 'text')) +
      fld('Detalle', dIn('mov', 'det', d.det, 'text'), 'tes-l') + fld('Socio / Entidad (opcional)', dIn('mov', 'soc', d.soc, 'text', 'soc')) + fld('Cuenta', dIn('mov', 'cta', d.cta, 'text', 'cta')) +
      fld('Cobros', dIn('mov', 'cob', d.cob, 'number', null, ' step="0.01"')) + fld('Pagos', dIn('mov', 'pag', d.pag, 'number', null, ' step="0.01"')) +
      fld('Efectivo / Banco', dSel('mov', 'medio', d.medio, MEDIOS_SEL)) + fld('Ref. doc. pendiente (opcional)', dIn('mov', 'ref', d.ref, 'text', 'ref')) +
      '<button class="btn btn--principal" type="button" data-add="mov"' + (canEdit ? '' : ' disabled') + '>Agregar</button></div>');
    const filtros = '<div class="tes-pad tes-ctl tes-sep">' +
      fld('Mes', '<select data-id="fMes"><option value="">Todos</option>' + ml.map((x) => '<option value="' + x + '"' + (x === ui.fMes ? ' selected' : '') + '>' + MESES[+x.slice(5, 7) - 1] + ' ' + x.slice(0, 4) + '</option>').join('') + '</select>') +
      fld('Buscar', '<input type="search" data-id="fTxt" value="' + esc(ui.fTxt) + '" placeholder="detalle, socio, cuenta…">') +
      (cut ? '<p class="tes-nota" style="margin:0">Mostrando los últimos 200 de ' + total + '. <button class="btn btn--chico btn--sec" type="button" data-showall>Mostrar todos</button></p>' : '<p class="tes-nota" style="margin:0">' + total + ' movimientos</p>') + '</div>';
    const tit = 'Planilla de ingresos y gastos · ' + all.length + ' de ' + LIM.movs;
    if (!rows.length) return fijo(h) + panel(tit, filtros + '<div class="vacio"><p>No hay movimientos para mostrar.</p></div>');
    const body = rows.map((m) => {
      const p = m._p, offC = m.cta && !ctas.some((c) => eq(c, m.cta)), offS = m.soc && !socs.some((c) => eq(c, m.soc));
      return '<tr><td class="num tes-calc">' + (m.idx + 1) + '</td><td class="w-d">' + datIn(p, 'f', m.f) + '</td><td class="w-m">' + txtIn(p, 'tc', m.tc, 'tc') + '</td><td class="w-n">' + txtIn(p, 'nro', m.nro) + '</td><td class="w-l">' + txtIn(p, 'det', m.det) + '</td><td class="w-m">' + txtIn(p, 'soc', m.soc, 'soc', offS ? 'tes-fuera' : '') + '</td><td class="w-m">' + txtIn(p, 'cta', m.cta, 'cta', offC ? 'tes-fuera' : '') + '</td>' +
        '<td class="w-n">' + numIn(p, 'cob', m.cob || null) + '</td><td class="w-n">' + numIn(p, 'pag', m.pag || null) + '</td><td class="num tes-calc">' + money(m.saldo) + '</td><td class="w-m">' + selIn(p, 'medio', m.medio, MEDIOS_SEL) + '</td>' +
        '<td class="num tes-calc">' + m.mes + '</td><td class="num tes-calc">' + m.anio + '</td><td class="w-s">' + txtIn(p, 'ref', m.ref, 'ref') + '</td><td>' + delBtn(p) + '</td></tr>';
    }).join('');
    return fijo(h) + panel(tit, filtros + tablaFija(th('N°', 1) + th('Fecha') + th('Tipo comprob.') + th('Comprob. N°') + th('Detalle') + th('Socio / Entidad') + th('Cuenta') + th('Cobros', 1) + th('Pagos', 1) + th('Saldo', 1) + th('Efectivo / Banco') + th('Mes', 1) + th('Año', 1) + th('Ref. doc.') + th(''), body, 'tes-grid', 'tes-mov'));
  }

  function vPend(D) {
    const d = ui.draft.pend;
    const nextN = D.P.reduce((a, p) => Math.max(a, parseInt(String(p.id).slice(2), 10) || 0), 0) + 1;
    let h = panel('Agregar documento pendiente', '<div class="tes-add">' +
      fld('Tipo', dSel('pend', 'tipo', d.tipo || 'Por pagar', ['Por cobrar', 'Por pagar'])) + fld('Fecha emisión', dIn('pend', 'fe', d.fe == null ? today() : d.fe, 'date')) + fld('Vencimiento', dIn('pend', 'fv', d.fv, 'date')) +
      fld('Persona / Entidad', dIn('pend', 'per', d.per, 'text', 'soc'), 'tes-l') + fld('Comprob. N°', dIn('pend', 'nro', d.nro, 'text')) + fld('Detalle', dIn('pend', 'det', d.det, 'text'), 'tes-l') +
      fld('Cuenta', dIn('pend', 'cta', d.cta, 'text', 'cta')) + fld('Moneda', dSel('pend', 'mon', d.mon || 'ARS', ['ARS', 'USD'])) + fld('Importe', dIn('pend', 'imp', d.imp, 'number', null, ' step="0.01"')) +
      '<button class="btn btn--principal" type="button" data-add="pend"' + (canEdit ? '' : ' disabled') + '>Agregar P-' + pad(nextN, 3) + '</button></div>');
    const nota = 'Cuando se cobre o pague, registrá el movimiento en “Ingresos y gastos” y elegí el ID en “Ref. doc.”. Cobrado/Pagado, saldo, estado y días de atraso se calculan solos.';
    const tit = 'Documentos pendientes de cobro y pago · ' + D.P.length + ' de ' + LIM.pend;
    if (!D.P.length) return fijo(h) + panel(tit, '<div class="vacio"><p>Todavía no hay documentos pendientes.</p></div>', nota);
    const body = D.P.map((p) => { const k = p._p;
      return '<tr><td class="tes-calc">' + esc(p.id) + '</td><td class="w-s">' + selIn(k, 'tipo', p.tipo, ['Por cobrar', 'Por pagar']) + '</td><td class="w-d">' + datIn(k, 'fe', p.fe) + '</td><td class="w-d">' + datIn(k, 'fv', p.fv) + '</td><td class="w-m">' + txtIn(k, 'per', p.per, 'soc') + '</td><td class="w-n">' + txtIn(k, 'nro', p.nro) + '</td><td class="w-l">' + txtIn(k, 'det', p.det) + '</td><td class="w-m">' + txtIn(k, 'cta', p.cta, 'cta') + '</td><td class="w-s">' + selIn(k, 'mon', p.mon, ['ARS', 'USD']) + '</td><td class="w-n">' + numIn(k, 'imp', p.imp) +
        '</td><td class="num tes-calc">' + fmt(p.cobrado) + '</td><td class="num tes-calc">' + money(p.saldo) + '</td><td>' + chipEstado(p.estado) + '</td><td class="num tes-calc">' + p.dias + '</td><td>' + delBtn(k) + '</td></tr>'; }).join('');
    return fijo(h) + panel(tit, tablaFija(th('ID') + th('Tipo') + th('Emisión') + th('Vencimiento') + th('Persona / Entidad') + th('Comprob. N°') + th('Detalle') + th('Cuenta') + th('Moneda') + th('Importe', 1) + th('Cobrado / Pagado', 1) + th('Saldo', 1) + th('Estado') + th('Días de atraso', 1) + th(''), body, 'tes-grid'), nota);
  }

  function vSaldos(D) {
    const c = cfg();
    let body = '<tr><td><b>Saldos al inicio</b></td>' + [0, 1, 2, 3, 4].map((i) => '<td class="w-n"><input type="number" step="0.01" data-cfg="s' + i + '" value="' + (c['s' + i] == null ? '' : esc(c['s' + i])) + '"></td>').join('') + '</tr>';
    D.saldos.forEach((r) => { body += '<tr><td>' + MESES[r.m - 1] + ' ' + r.y + '</td>' + r.v.map((v) => '<td class="num tes-calc">' + money(v) + '</td>').join('') + '</tr>'; });
    return panel('Saldos de caja y bancos', tabla(th('Período') + MEDIO_HDR.map((x) => th(x, 1)).join(''), body, 'tes-grid'),
      'Saldo al cierre de cada mes: saldo inicial más los movimientos acumulados de “Ingresos y gastos” según el campo Efectivo / Banco. Solo el renglón “Saldos al inicio” se carga a mano.');
  }

  function vListado(D) {
    const L = ui.lst, X = D.L;
    let h = '<section class="panel tes-pad"><div class="tes-ctl">' + fld('Tipo de listado', '<select data-id="l-tipo"><option' + (L.tipo === 'Mensual' ? ' selected' : '') + '>Mensual</option><option' + (L.tipo !== 'Mensual' ? ' selected' : '') + ' value="Rango de fechas">Rango de fechas</option></select>');
    if (L.tipo === 'Mensual') {
      h += fld('Mes', '<select data-id="l-mes">' + MESES.map((m, i) => '<option value="' + i + '"' + (i === +L.mes ? ' selected' : '') + '>' + m + '</option>').join('') + '</select>') +
        fld('Año', '<select data-id="l-anio">' + [2026, 2027, 2028, 2029, 2030].map((y) => '<option' + (y === +L.anio ? ' selected' : '') + '>' + y + '</option>').join('') + '</select>');
    } else {
      h += fld('Desde', '<input type="date" data-id="l-desde" value="' + esc(L.desde) + '">') + fld('Hasta', '<input type="date" data-id="l-hasta" value="' + esc(L.hasta) + '">');
    }
    h += '<div class="tes-inline" style="margin-left:auto"><button class="btn btn--sec" type="button" data-dl="xlsx">Descargar Excel</button><button class="btn btn--sec" type="button" data-dl="csv">Descargar CSV</button></div></div></section>';
    const ac = X.aviso === 'Sin observaciones' ? 'aviso--ok' : (/Revisá/.test(X.aviso) ? 'aviso--mal' : 'aviso--info');
    h += '<div class="tes-grid2"><section class="panel tes-pad"><dl class="tes-kv"><dt>Período listado</dt><dd>' + fmtD(X.desde) + ' al ' + fmtD(X.hasta) + '</dd><dt>Movimientos en el período</dt><dd>' + X.items.length + '</dd><dt>Sin cuenta asignada</dt><dd>' + X.sinC + '</dd><dt>Sin Efectivo / Banco</dt><dd>' + X.sinM + '</dd></dl><div class="aviso ' + ac + '" style="margin-top:12px"><b>Avisos:</b> ' + esc(X.aviso) + '</div></section>' +
      panel('Totales del período', tabla(th('') + th('Cobros', 1) + th('Pagos', 1) + th('Neto', 1),
        '<tr>' + td('Pesos (ARS)') + td(money(X.ars.cob), 1) + td(money(X.ars.pag), 1) + td(money(X.ars.neto), 1) + '</tr><tr>' + td('Dólares (USD)') + td(money(X.usd.cob), 1) + td(money(X.usd.pag), 1) + td(money(X.usd.neto), 1) + '</tr>')) + '</div>';
    const tit = 'Listado de movimientos para el estudio contable';
    if (!X.items.length) return fijo(h) + panel(tit, '<div class="vacio"><p>No hay movimientos en el período elegido.</p></div>');
    const body = X.items.map((m, i) => '<tr>' + td(i + 1, 1) + td(fmtD(m.f)) + td(esc(m.tc)) + td(esc(m.nro)) + td(esc(m.det)) + td(esc(m.soc)) + td(m.cta ? esc(m.cta) : '<span class="chip chip--pend">sin cuenta</span>') + td(m.mon) + td(fmt(m.cob), 1) + td(fmt(m.pag), 1) + td(m.medio ? esc(m.medio) : '<span class="chip chip--pend">sin medio</span>') + td(esc(m.ref)) + '</tr>').join('');
    return fijo(h) + panel(tit, tablaFija(th('N°', 1) + th('Fecha') + th('Tipo comprob.') + th('Comprob. N°') + th('Detalle') + th('Socio / Entidad') + th('Cuenta') + th('Moneda') + th('Cobros', 1) + th('Pagos', 1) + th('Efectivo / Banco') + th('Ref. documento'), body));
  }

  function vSocios(D) {
    const d = ui.draft.soc;
    let h = panel('Agregar socio, cliente o proveedor', '<div class="tes-add">' + fld('Socio / Entidad', dIn('soc', 'nombre', d.nombre, 'text'), 'tes-l') + fld('Tipo', dSel('soc', 'tipo', d.tipo || 'Socio', ['Socio', 'Cliente', 'Proveedor', 'Ambos'])) + fld('CUIT / Contacto', dIn('soc', 'cuit', d.cuit, 'text')) + '<button class="btn btn--principal" type="button" data-add="soc"' + (canEdit ? '' : ' disabled') + '>Agregar</button></div>');
    const nota = 'Esta lista alimenta las sugerencias de Pendientes e Ingresos y gastos. Las columnas de saldo se calculan desde Pendientes.';
    const tit = 'Socios y entidades · ' + D.socios.length + ' de ' + LIM.socios;
    if (!D.socios.length) return fijo(h) + panel(tit, '<div class="vacio"><p>Todavía no cargaste socios ni entidades.</p></div>', nota);
    const body = D.socios.map((s, i) => { const k = s._p;
      return '<tr><td class="num tes-calc">' + (i + 1) + '</td><td class="w-l">' + txtIn(k, 'nombre', s.nombre) + '</td><td class="w-s">' + selIn(k, 'tipo', s.tipo, ['Socio', 'Cliente', 'Proveedor', 'Ambos']) + '</td><td class="w-m">' + txtIn(k, 'cuit', s.cuit) + '</td><td class="num tes-calc">' + fmt(s.cA) + '</td><td class="num tes-calc">' + fmt(s.pA) + '</td><td class="num tes-calc">' + fmt(s.cU) + '</td><td class="num tes-calc">' + fmt(s.pU) + '</td><td style="white-space:nowrap"><button class="btn btn--chico btn--sec" type="button" data-comp="' + esc(s.nombre) + '"' + (canEdit ? '' : ' disabled') + '>Compensar</button> ' + delBtn(k) + '</td></tr>'; }).join('');
    return fijo(h) + panel(tit, tablaFija(th('N°', 1) + th('Socio / Entidad') + th('Tipo') + th('CUIT / Contacto') + th('Por cobrar ARS', 1) + th('Por pagar ARS', 1) + th('Por cobrar USD', 1) + th('Por pagar USD', 1) + th(''), body, 'tes-grid'), nota);
  }

  function vCuentas(D) {
    const d = ui.draft.cta;
    let h = panel('Agregar cuenta contable', '<div class="tes-add">' + fld('Cuenta', dIn('cta', 'nombre', d.nombre, 'text'), 'tes-l') + '<button class="btn btn--principal" type="button" data-add="cta"' + (canEdit ? '' : ' disabled') + '>Agregar</button></div>');
    const tit = 'Cuentas contables · ' + D.cuentas.length + ' de ' + LIM.cuentas;
    if (!D.cuentas.length) return fijo(h) + panel(tit, '<div class="vacio"><p>Todavía no hay cuentas contables.</p></div>');
    const body = D.cuentas.map((c, i) => '<tr><td class="num tes-calc" style="width:70px">' + (i + 1) + '</td><td>' + txtIn(c._p, 'nombre', c.nombre) + '</td><td style="width:90px">' + delBtn(c._p) + '</td></tr>').join('');
    return fijo(h) + panel(tit, tablaFija(th('Nro.', 1) + th('Cuenta') + th(''), body, 'tes-grid'));
  }

  function vInstr() {
    const sec = (t, items, ord) => '<section class="panel tes-pad"><h2 class="tes-h">' + t + '</h2><' + (ord ? 'ol' : 'ul') + ' class="tes-ins">' + items.map((x) => '<li>' + x + '</li>').join('') + '</' + (ord ? 'ol' : 'ul') + '></section>';
    return '<div class="tes-stack">' +
      sec('Idea general', [
        'Todo parte de dos tipos de registro: los <b>movimientos</b> (plata que ya entró o salió de la caja o de un banco, en <b>Ingresos y gastos</b>) y los <b>documentos pendientes</b> (algo que se debe cobrar o pagar más adelante, en <b>Pendientes</b>).',
        '<b>Por cobrar</b> = alguien le debe al Aeroclub. <b>Por pagar</b> = el Aeroclub le debe a alguien.',
        'Todo lo demás (saldos, estados, vencimientos, resumen, listado contable) se calcula solo a partir de lo que cargues. Los cambios se guardan automáticamente.',
        'Cada celda de las planillas se edita directamente: hacé clic, cambiá el valor y salí de la celda.'
      ], false) +
      sec('Registrar un cobro o un pago (contado)', [
        'Entrá a <b>Ingresos y gastos</b> y completá el panel fijo «Agregar movimiento»: fecha, tipo de comprobante, número, detalle, socio o entidad, cuenta contable.',
        'Un <b>cobro</b> se carga en la columna <b>Cobros</b>; un <b>pago</b> en <b>Pagos</b>.',
        'Elegí en <b>Efectivo / Banco</b> por dónde entró o salió la plata (es lo que alimenta «Saldos caja y bancos»).',
        'Dejá «Ref. doc. pendiente» vacío y apretá <b>Agregar</b>. El movimiento nuevo aparece arriba de todo.'
      ], true) +
      sec('Registrar algo a cobrar o a pagar más adelante', [
        'Entrá a <b>Pendientes</b> y completá «Agregar documento pendiente»: tipo (Por cobrar / Por pagar), fecha de emisión, vencimiento, persona o entidad, comprobante, detalle, cuenta, moneda e importe. Se le asigna un ID (P-001, P-002…).',
        'Cuando se cobre o se pague, cargá el movimiento en <b>Ingresos y gastos</b> y, en «Ref. doc.», elegí el ID del documento. Si se paga en cuotas, repetí el ID en cada movimiento.',
        '<b>Pendientes</b> calcula solo lo cobrado o pagado, el saldo, el estado (Pendiente, Parcial, Vencido, Cobrado/Pagado) y los días de atraso.'
      ], true) +
      sec('Compensar gastos que un socio pagó con su liquidación final', [
        'Sirve cuando un socio pagó gastos del Aeroclub, los rindió con tickets y se le descuentan de lo que debe en su liquidación.',
        'Entrá a <b>Socios y entidades</b> y apretá <b>Compensar</b> en la fila del socio.',
        'Cargá la fecha, el <b>Efectivo / Banco</b> con el que se liquida y el <b>importe de la liquidación final</b>. Si el socio ya tiene la liquidación cargada como «Por cobrar» en Pendientes, elegila en el desplegable; si no, el sistema la crea.',
        'Cargá <b>un renglón por ticket</b> (detalle, número, cuenta contable e importe). Podés agregar o quitar tickets.',
        'Revisá el cuadro «Qué se asienta al confirmar»: muestra el cobro de la liquidación, un pago por cada ticket y quién paga la diferencia (el socio si la liquidación es mayor que los gastos; el Aeroclub si es menor).',
        'Apretá <b>Confirmar compensación</b>. Quedan registrados los dos documentos en Pendientes (cobrado y pagado) y los movimientos en Ingresos y gastos, y el socio queda en cero.'
      ], true) +
      sec('Importar un extracto del banco', [
        'Apretá <b>Importar extracto</b>, elegí el <b>banco / cuenta</b> y subí el archivo del banco (Excel o CSV).',
        'Revisá las columnas que el sistema detectó (fecha, detalle, importes…) y corregilas si hace falta. Si el banco trae Débito y Crédito separados, elegí ambas columnas.',
        'En «Reglas» podés indicar que si el detalle contiene cierto texto (por ejemplo «GRAVAMEN LEY 25413») se asigne una cuenta contable; así las próximas importaciones lo completan solas.',
        'En la vista previa, los movimientos que ya estaban cargados (misma fecha, banco e importe) aparecen desmarcados para no duplicarlos. Marcá o desmarcá los que quieras importar.',
        'Al confirmar, los movimientos pasan a Ingresos y gastos. Después completá el socio y la cuenta de los que hayan quedado sin asignar.'
      ], true) +
      sec('Corregir o borrar', [
        'Para corregir cualquier dato, editá la celda directamente.',
        'Para borrar un renglón apretá <b>Borrar</b>: el botón pasa a <b>¿Seguro?</b>; apretalo de nuevo para confirmar. Si no confirmás, vuelve a «Borrar» a los pocos segundos.',
        'Si borrás un movimiento que estaba imputado a un documento, el documento recalcula solo su saldo y estado.',
        'Un socio o una cuenta fuera de las listas se marca en color ámbar, pero se acepta. Para altas nuevas usá los paneles de <b>Socios y entidades</b> y <b>Cuentas contables</b>.'
      ], false) +
      sec('Cada solapa', [
        '<b>Resumen:</b> situación a una fecha de corte (por defecto hoy) y por moneda: saldo pendiente, vencido, próximos 30 días, antigüedad, y movimientos del mes por cuenta.',
        '<b>Ingresos y gastos:</b> la planilla de movimientos, con el más reciente arriba. Se puede filtrar por mes y buscar por texto.',
        '<b>Pendientes:</b> los documentos a cobrar o pagar, con su estado.',
        '<b>Saldos caja y bancos:</b> saldo al cierre de cada mes por Efectivo / Banco. Solo el renglón «Saldos al inicio» se carga a mano; el resto se calcula con los movimientos.',
        '<b>Listado contable:</b> elegí «Mensual» o «Rango de fechas». Se arma el listado ordenado por fecha con totales en pesos y en dólares. Para el estudio contable usá «Descargar Excel» o «Descargar CSV». Antes de enviarlo mirá el cuadro de Avisos: indica movimientos sin cuenta o sin Efectivo / Banco.',
        '<b>Socios y entidades:</b> lista de personas y empresas, con CUIT o contacto y lo que tiene para cobrar y para pagar cada una. Desde acá se hace la compensación.',
        '<b>Cuentas contables:</b> el plan de cuentas que se usa para clasificar cada movimiento.'
      ], false) +
      sec('Dólares', [
        'Un movimiento es en dólares cuando su Efectivo / Banco es una cuenta USD (por ejemplo «Banco Nación USD»). Un documento en dólares se imputa con movimientos de cuentas USD.',
        'En el Resumen, «Moneda a analizar» alterna entre pesos y dólares. La tabla de movimientos del mes por cuenta es solo en pesos.'
      ], false) +
      sec('Planilla de Excel y respaldo', [
        '<b>Exportar a Excel</b> descarga una copia completa (movimientos, pendientes, saldos, socios y cuentas). Conviene hacerlo de forma periódica como respaldo.',
        '<b>Importar planilla .xlsx</b> <u>reemplaza todos los datos actuales</u> por los de la planilla. No lo uses para agregar movimientos sueltos; para eso usá «Importar extracto».',
        'Con el rol de solo consulta se puede ver todo pero no modificar nada.'
      ], false) +
      sec('Límites y recomendaciones', [
        'Capacidad: 500 documentos en Pendientes, 3.500 movimientos, 500 socios o entidades y 60 cuentas contables.',
        'Los saldos mensuales cubren de octubre de 2026 a octubre de 2028.',
        'Los datos incluyen CUIT y deudas de socios: tratalos como información sensible.',
        'Las pautas contables (cómo imputar compensaciones, anticipos, etc.) conviene confirmarlas con el contador del Aeroclub.'
      ], false) +
      '</div>';
  }

  /* ---- Importar extracto bancario ---- */
  const MEDIOS_BANCO = ['Banco Nación', 'Banco Santander', 'Banco Nación USD'];
  const sinAcentos = (s) => lc(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const reglas = () => ((docs['app/reglas'] || {}).items || []).filter((r) => r && r.k);
  function parseNum(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).trim().replace(/\s|\$|ARS|USD|U\$S/gi, ''), neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
    if (/^-/.test(s)) { neg = !neg || neg; s = s.slice(1); neg = true; }
    if (!s) return null;
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    else if (s.indexOf(',') >= 0 && s.indexOf('.') < 0) s = s.replace(',', '.');
    const n = Number(s);
    return isNaN(n) ? null : (neg ? -n : n);
  }
  function parseFecha(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') return (v > 20000 && v < 80000) ? serial2iso(v) : '';
    const s = String(v).trim(); let m;
    if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/))) return m[3] + '-' + pad(m[2], 2) + '-' + pad(m[1], 2);
    if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2})(?!\d)/))) return '20' + m[3] + '-' + pad(m[2], 2) + '-' + pad(m[1], 2);
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
    return '';
  }
  function parseCsv(txt) {
    const lineas = txt.split(/\r?\n/).filter((l) => l.trim() !== '');
    const cuenta = (c) => lineas.slice(0, 8).reduce((a, l) => a + l.split(c).length - 1, 0);
    const delim = [';', '\t', ',', '|'].map((c) => [c, cuenta(c)]).sort((a, b) => b[1] - a[1])[0][0];
    return lineas.map((l) => {
      const out = []; let cur = '', q = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
        else if (ch === '"') q = true; else if (ch === delim) { out.push(cur); cur = ''; } else cur += ch;
      }
      out.push(cur); return out.map((x) => x.trim());
    });
  }
  const IMP_CLAVES = [['f', 'Fecha', /fecha/i], ['det', 'Detalle / descripción', /descrip|concepto|detalle|leyenda|movimiento/i], ['deb', 'Débito (egresos)', /d[eé]bito|debe|egreso/i],
    ['cre', 'Crédito (ingresos)', /cr[eé]dito|haber|ingreso/i], ['imp', 'Importe único (con signo)', /^importe|^monto/i], ['nro', 'N° comprobante / referencia', /comprob|referencia|n[uú]mero|^nro|^n°|c[oó]d/i]];
  function detectarImp(matriz) {
    let best = 0, bs = -1;
    for (let i = 0; i < Math.min(40, matriz.length); i++) {
      const lab = matriz[i].map((x) => String(x == null ? '' : x));
      const sc = IMP_CLAVES.filter((c) => lab.some((l) => c[2].test(l))).length + (lab.some((l) => /fecha/i.test(l)) ? 2 : 0);
      if (sc > bs) { bs = sc; best = i; }
    }
    const lab = matriz[best].map((x) => String(x == null ? '' : x));
    const map = {};
    IMP_CLAVES.forEach((c) => { const j = lab.findIndex((l, ix) => c[2].test(l) && Object.values(map).indexOf(String(ix)) < 0); map[c[0]] = j >= 0 ? String(j) : ''; });
    if (map.deb !== '' || map.cre !== '') map.imp = '';
    return { hr: best, map };
  }
  function calcItemsImp() {
    const I = ui.imp; if (!I || !I.matriz) return;
    const col = (r, k) => (I.map[k] === '' || I.map[k] == null ? null : r[+I.map[k]]);
    const items = [];
    for (let i = I.hr + 1; i < I.matriz.length; i++) {
      const r = I.matriz[i], f = parseFecha(col(r, 'f')); if (!f) continue;
      let cob = 0, pag = 0;
      if (I.map.deb !== '' || I.map.cre !== '') { cob = Math.abs(parseNum(col(r, 'cre')) || 0); pag = Math.abs(parseNum(col(r, 'deb')) || 0); }
      else { const v = parseNum(col(r, 'imp')); if (v == null) continue; if (v >= 0) cob = v; else pag = -v; }
      if (!cob && !pag) continue;
      const prev = (I.items || []).find((x) => x.fila === i);
      items.push({ fila: i, f, det: String(col(r, 'det') == null ? '' : col(r, 'det')).trim(), nro: String(col(r, 'nro') == null ? '' : col(r, 'nro')).trim(), cob, pag, cta: prev && prev.manual ? prev.cta : '', manual: !!(prev && prev.manual), dup: false, sel: prev ? prev.sel : true, selTocado: !!(prev && prev.selTocado) });
    }
    aplicarReglasImp(items, true);
    I.items = items;
  }
  function aplicarReglasImp(items, marcarDup) {
    const R = reglas().map((r) => [sinAcentos(r.k), r.cta]);
    items.forEach((m) => { if (!m.manual) { const h = R.find((r) => sinAcentos(m.det).indexOf(r[0]) >= 0); m.cta = h ? h[1] : ''; } });
    if (!marcarDup) return;
    const usados = {}, medio = ui.imp.medio;
    const k = (f, med, c, p) => [f, lc(med), (c || 0).toFixed(2), (p || 0).toFixed(2)].join('|');
    const exist = {}; coll('movs').forEach((m) => { const kk = k(m.f, m.medio, +m.cob || 0, +m.pag || 0); exist[kk] = (exist[kk] || 0) + 1; });
    items.forEach((m) => {
      const kk = k(m.f, medio, m.cob, m.pag);
      if (medio && (exist[kk] || 0) > (usados[kk] || 0)) { usados[kk] = (usados[kk] || 0) + 1; m.dup = true; }
      else m.dup = false;
      if (m.dup && m.sel !== false && !m.selTocado) m.sel = false;
    });
  }
  function vImp() {
    const I = ui.imp, R = reglas();
    const cab = '<div class="tes-pad tes-ctl">' + fld('Archivo del banco (.xlsx, .xls o .csv)', '<input type="file" accept=".xlsx,.xls,.csv,.txt" data-impfile>') +
      fld('Banco / cuenta', '<select data-id="imp-medio"><option value=""></option>' + MEDIOS_BANCO.map((x) => '<option' + (x === I.medio ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>') +
      '<button class="btn btn--sec" type="button" data-impcancel>Cancelar</button></div>';
    let h = panel('Importar extracto bancario', cab, 'Elegí el banco, subí el extracto y revisá las columnas detectadas. Los movimientos que ya estén cargados (misma fecha, banco e importe) aparecen marcados y desmarcados.');
    if (!I.matriz) return h;
    const lab = I.matriz[I.hr].map((x, j) => (x == null || String(x).trim() === '' ? 'Columna ' + (j + 1) : String(x)));
    const sel = (c) => fld(c[1], '<select data-impcol="' + c[0] + '"><option value="">—</option>' + lab.map((l, j) => '<option value="' + j + '"' + (String(j) === I.map[c[0]] ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>');
    h += panel('Columnas del archivo · ' + esc(I.nombre), '<div class="tes-add">' + IMP_CLAVES.map(sel).join('') + '</div>',
      'Si el banco trae Débito y Crédito en columnas separadas, elegí ambas y dejá «Importe único» en —. Si trae un solo importe con signo, usá «Importe único». Fila de títulos detectada: ' + (I.hr + 1) + '.');
    const reg = R.map((r, i) => '<tr><td>' + esc(r.k) + '</td><td>' + esc(r.cta) + '</td><td><button class="btn btn--chico btn--fantasma tes-peligro" type="button" data-regdel="' + i + '">Quitar</button></td></tr>').join('');
    const d = ui.draft.reg;
    h += panel('Reglas para asignar la cuenta contable', '<div class="tes-add">' + fld('Si el detalle contiene…', dIn('reg', 'k', d.k, 'text')) + fld('Asignar cuenta', dIn('reg', 'cta', d.cta, 'text', 'cta')) +
      '<button class="btn btn--sec" type="button" data-add="reg">Agregar regla</button></div>' + (R.length ? tabla(th('Texto') + th('Cuenta') + th(''), reg) : ''),
      'Las reglas se guardan y se aplican solas en los próximos extractos. Ejemplo: «GRAVAMEN LEY 25413» → Impuestos y tasas.');
    const it = I.items || [];
    if (!it.length) return h + panel('Vista previa', '<div class="vacio"><p>No se encontraron movimientos con la configuración actual. Revisá las columnas elegidas.</p></div>');
    const nuevos = it.filter((m) => m.sel), dup = it.filter((m) => m.dup).length, sinC = nuevos.filter((m) => !m.cta).length;
    const sum = (a, f) => a.reduce((s, m) => s + m[f], 0);
    const body = it.map((m, i) => '<tr><td><input type="checkbox" data-impchk="' + i + '"' + (m.sel ? ' checked' : '') + ' style="width:auto;min-height:0"></td><td class="tes-calc">' + fmtD(m.f) + '</td><td>' + esc(m.det) + '</td><td>' + esc(m.nro) + '</td><td class="num">' + fmt(m.cob || '') + '</td><td class="num">' + fmt(m.pag || '') + '</td><td class="w-m"><input type="text" data-lista="cta" autocomplete="off" data-impcta="' + i + '" value="' + esc(m.cta) + '"></td><td>' + (m.dup ? '<span class="chip chip--pend">ya cargado</span>' : '<span class="chip chip--ok">nuevo</span>') + '</td></tr>').join('');
    const res = '<div class="tes-pad tes-ctl tes-sep"><dl class="tes-kv" style="min-width:260px"><dt>Movimientos leídos</dt><dd>' + it.length + '</dd><dt>Posibles duplicados</dt><dd>' + dup + '</dd><dt>A importar</dt><dd>' + nuevos.length + '</dd><dt>Cobros / Pagos a importar</dt><dd>' + fmt(sum(nuevos, 'cob')) + ' / ' + fmt(sum(nuevos, 'pag')) + '</dd><dt>Sin cuenta asignada</dt><dd>' + sinC + '</dd></dl>' +
      '<div class="tes-inline" style="margin-left:auto"><button class="btn btn--sec" type="button" data-impall="1">Marcar todos</button><button class="btn btn--sec" type="button" data-impall="0">Desmarcar todos</button>' +
      '<button class="btn btn--principal" type="button" data-impok' + (nuevos.length && I.medio ? '' : ' disabled') + '>Importar ' + nuevos.length + ' movimientos</button></div></div>' + (I.medio ? '' : '<div class="aviso aviso--info" style="margin:12px 16px">Elegí el banco para poder importar.</div>');
    return h + panel('Vista previa', res + '<div class="tabla-caja tes-scroll"><table class="tabla"><thead><tr><th></th><th>Fecha</th><th>Detalle</th><th>Comprob.</th><th class="num">Cobros</th><th class="num">Pagos</th><th>Cuenta</th><th>Estado</th></tr></thead><tbody>' + body + '</tbody></table></div>');
  }
  async function leerExtracto(file) {
    if (!file) return;
    try {
      const ab = await file.arrayBuffer(); let matriz;
      if (/\.(csv|txt)$/i.test(file.name)) {
        let txt = new TextDecoder('utf-8').decode(ab); if (txt.indexOf('\uFFFD') >= 0) txt = new TextDecoder('windows-1252').decode(ab);
        matriz = parseCsv(txt);
      } else {
        const XL = await cargarXlsx(), wb = XL.read(ab, { type: 'array' });
        const hojas = wb.SheetNames.map((n) => XL.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }));
        matriz = hojas.sort((a, b) => b.length - a.length)[0] || [];
      }
      if (!matriz.length) { toast('El archivo está vacío.'); return; }
      const det = detectarImp(matriz);
      ui.imp = { ...ui.imp, nombre: file.name, matriz, hr: det.hr, map: det.map, items: [] };
      calcItemsImp(); render();
    } catch (e) { toast('No se pudo leer el extracto: ' + ((e && e.message) || e)); }
  }
  function addRegla() {
    if (!guard()) return; const d = drafts('reg');
    if (!(d.k || '').trim() || !(d.cta || '').trim()) { toast('Completá el texto y la cuenta.'); return; }
    put('app/reglas', { items: reglas().concat([{ k: d.k.trim(), cta: d.cta.trim() }]) });
    ui.draft.reg = {}; aplicarReglasImp(ui.imp.items || [], false); render();
  }
  async function confirmarExtracto() {
    if (!guard()) return;
    const I = ui.imp, lista = (I.items || []).filter((m) => m.sel);
    if (!I.medio || !lista.length) return;
    if (coll('movs').length + lista.length > LIM.movs) { toast('Se superaría el máximo de ' + LIM.movs + ' movimientos.'); return; }
    let n = coll('movs').reduce((a, x) => Math.max(a, x.n || 0), 0);
    const tareas = lista.map((m) => { n++; const k = n; return () => put('movs/m' + pad(k, 4), { n: k, f: m.f, tc: 'Extracto bancario', nro: m.nro, det: m.det, soc: '', cta: m.cta, cob: m.cob || null, pag: m.pag || null, medio: I.medio, ref: '' }); });
    const est = $('.tes-estado'), previo = est.textContent; let hechos = 0;
    for (let i = 0; i < tareas.length; i += 8) { await Promise.all(tareas.slice(i, i + 8).map((f) => f())); hechos += Math.min(8, tareas.length - i); est.textContent = 'Importando ' + hechos + ' de ' + tareas.length + '…'; }
    est.textContent = previo; ui.imp = null; toast('Se importaron ' + lista.length + ' movimientos del extracto.'); render();
  }

  /* ---- Compensar gastos rendidos por un socio contra su liquidación ---- */
  const compNuevo = (soc) => ({ soc: soc || '', fecha: today(), medio: '', docId: '', liq: '', cta: '', tk: [{ det: '', nro: '', cta: '', imp: '' }] });
  function compCalc(D) {
    const c = ui.comp, err = [];
    const mon = esUsd(c.medio) ? 'USD' : 'ARS';
    const abiertos = D.P.filter((p) => p.tipo === 'Por cobrar' && p.saldo !== '' && p.saldo > 0 && eq(p.per, c.soc) && (!c.medio || p.mon === mon));
    const doc = c.docId ? abiertos.find((p) => p.id === c.docId) : null;
    const liq = numOrNull(c.liq);
    const tk = c.tk.map((t) => ({ ...t, v: numOrNull(t.imp) })).filter((t) => t.v && t.v > 0);
    const G = tk.reduce((a, t) => a + t.v, 0);
    if (!(c.soc || '').trim()) err.push('Elegí el socio o entidad.');
    if (!c.medio) err.push('Elegí el Efectivo / Banco con el que se liquida.');
    if (!liq || liq <= 0) err.push('Cargá el importe de la liquidación final.');
    if (doc && liq && liq > doc.saldo + 0.004) err.push('La liquidación supera el saldo del documento elegido (' + fmt(doc.saldo) + ').');
    if (!tk.length) err.push('Cargá al menos un ticket con importe.');
    const maxN = D.P.reduce((a, p) => Math.max(a, parseInt(String(p.id).slice(2), 10) || 0), 0);
    let sig = maxN, idCobrar = doc ? doc.id : '', idPagar = '';
    if (!doc) { sig++; idCobrar = 'P-' + pad(sig, 3); }
    sig++; idPagar = 'P-' + pad(sig, 3);
    const ctasT = Array.from(new Set(tk.map((t) => t.cta).filter(Boolean)));
    const pends = [];
    if (!doc) pends.push({ id: idCobrar, tipo: 'Por cobrar', fe: c.fecha, fv: c.fecha, per: c.soc, nro: '', det: 'Liquidación final', cta: c.cta || '', mon, imp: liq || 0 });
    pends.push({ id: idPagar, tipo: 'Por pagar', fe: c.fecha, fv: c.fecha, per: c.soc, nro: tk.map((t) => t.nro).filter(Boolean).join(', ').slice(0, 60), det: 'Reintegro de gastos rendidos (' + tk.length + (tk.length === 1 ? ' ticket)' : ' tickets)'), cta: ctasT.length === 1 && tk.every((t) => t.cta) ? ctasT[0] : '', mon, imp: G });
    const movs = [{ f: c.fecha, tc: 'Liquidación', nro: '', det: 'Liquidación final – compensación de gastos rendidos', soc: c.soc, cta: doc ? (doc.cta || '') : (c.cta || ''), cob: liq || 0, pag: null, medio: c.medio, ref: idCobrar }]
      .concat(tk.map((t) => ({ f: c.fecha, tc: 'Compensación', nro: t.nro || '', det: 'Gasto rendido: ' + (t.det || 'sin detalle') + (t.nro ? ' (ticket ' + t.nro + ')' : ''), soc: c.soc, cta: t.cta || '', cob: null, pag: t.v, medio: c.medio, ref: idPagar })));
    return { err, abiertos, doc, liq: liq || 0, G, neto: (liq || 0) - G, pends, movs, idCobrar, idPagar, mon, sinCta: tk.filter((t) => !t.cta).length };
  }
  function compPrevHtml(K) {
    const c = ui.comp;
    let h = '';
    if (K.err.length) h += '<div class="aviso aviso--info" style="margin:10px 12px">' + K.err.map(esc).join('<br>') + '</div>';
    h += '<div class="tes-pad tes-sep"><span style="font-size:11pt;font-weight:700">' + (K.neto >= 0 ? 'El socio paga la diferencia: ' : 'El Aeroclub le paga al socio la diferencia: ') + fmt(Math.abs(K.neto)) + '</span><br><span class="muted">Liquidación ' + fmt(K.liq) + ' − gastos rendidos ' + fmt(K.G) + ' = ' + fmt(K.neto) + '</span></div>';
    h += '<div class="tabla-caja"><table class="tabla"><thead><tr><th>Fecha</th><th>Tipo comprob.</th><th>Detalle</th><th>Cuenta</th><th class="num">Cobros</th><th class="num">Pagos</th><th>Efectivo / Banco</th><th>Ref. doc.</th></tr></thead><tbody>' +
      K.movs.map((m) => '<tr><td>' + fmtD(m.f) + '</td><td>' + esc(m.tc) + '</td><td>' + esc(m.det) + '</td><td>' + (m.cta ? esc(m.cta) : '<span class="chip chip--pend">sin cuenta</span>') + '</td><td class="num">' + (m.cob ? fmt(m.cob) : '') + '</td><td class="num">' + (m.pag ? fmt(m.pag) : '') + '</td><td>' + esc(m.medio) + '</td><td>' + esc(m.ref) + '</td></tr>').join('') + '</tbody></table></div>';
    const cobrado = K.doc ? K.doc.cobrado + K.liq : K.liq, impC = K.doc ? K.doc.imp : K.liq, saldoC = impC - cobrado;
    h += '<div class="tes-pad"><b>Después de confirmar:</b> ' + esc(K.idCobrar) + ' (Por cobrar) queda en ' + (saldoC <= 0.004 ? 'Cobrado' : 'Parcial, saldo ' + fmt(saldoC)) + '; ' + esc(K.idPagar) + ' (Por pagar) queda Pagado; ' +
      'el saldo de «' + esc(c.medio || '—') + '» ' + (K.neto >= 0 ? 'sube ' : 'baja ') + fmt(Math.abs(K.neto)) + '.' + (K.doc ? '' : ' Se crean los documentos ' + K.pends.map((p) => p.id).join(' y ') + '.') + (K.sinCta ? ' <span class="chip chip--pend">' + K.sinCta + ' ticket(s) sin cuenta</span>' : '') + '</div>';
    return h;
  }
  function vComp(D) {
    const c = ui.comp, K = compCalc(D);
    const opt = (xs, sel) => '<option value=""></option>' + xs.map((x) => '<option' + (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
    const docSel = '<select id="tes-cf-docId-' + uid + '" data-cf="docId"><option value="">Crear documento nuevo</option>' + K.abiertos.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === c.docId ? ' selected' : '') + '>' + esc(p.id) + ' · saldo ' + fmt(p.saldo) + ' · ' + esc(p.det || '') + '</option>').join('') + '</select>';
    const inp = (f, v, type, extra) => '<input id="tes-cf-' + f + '-' + uid + '" type="' + type + '" data-cf="' + f + '" value="' + esc(v) + '"' + (extra || '') + '>';
    let h = panel('Compensar gastos rendidos', '<div class="tes-add">' +
      fld('Socio / Entidad', inp('soc', c.soc, 'text', ' data-lista="soc" autocomplete="off"')) + fld('Fecha', inp('fecha', c.fecha, 'date')) +
      fld('Efectivo / Banco de la liquidación', '<select id="tes-cf-medio-' + uid + '" data-cf="medio">' + opt(MEDIOS_SEL, c.medio) + '</select>') +
      fld('Documento «Por cobrar» a compensar', docSel) + fld('Importe de la liquidación final', inp('liq', c.liq, 'number', ' step="0.01"')) +
      (K.doc ? '' : fld('Cuenta de la liquidación', inp('cta', c.cta, 'text', ' data-lista="cta" autocomplete="off"'))) + '</div>',
      'El socio pagó gastos del Aeroclub y los rindió con tickets: se descuentan de su liquidación final. No hace falta cargar nada antes en Pendientes: el sistema crea los documentos.');
    const rows = c.tk.map((t, i) => '<tr><td><input id="tes-ct-' + i + '-det-' + uid + '" type="text" data-ct="' + i + ':det" value="' + esc(t.det) + '" placeholder="Detalle del ticket"></td><td style="width:130px"><input type="text" data-ct="' + i + ':nro" value="' + esc(t.nro) + '"></td><td style="min-width:200px"><input type="text" data-ct="' + i + ':cta" data-lista="cta" autocomplete="off" value="' + esc(t.cta) + '"></td><td style="width:140px"><input type="number" step="0.01" data-ct="' + i + ':imp" value="' + esc(t.imp) + '" style="text-align:right"></td><td><button class="btn btn--chico btn--fantasma tes-peligro" type="button" data-tkdel="' + i + '">Quitar</button></td></tr>').join('');
    h += panel('Gastos rendidos por el socio', '<div class="tabla-caja"><table class="tabla"><thead><tr><th>Detalle</th><th>N° ticket</th><th>Cuenta contable</th><th class="num">Importe</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div><div class="tes-pad tes-ctl"><button class="btn btn--sec" type="button" data-tkadd>Agregar ticket</button><span class="muted">Total gastos rendidos: <b class="tes-comp-totg">' + fmt(K.G) + '</b></span></div>');
    h += panel('Qué se asienta al confirmar', '<div class="tes-comp-prev">' + compPrevHtml(K) + '</div><div class="tes-pad tes-ctl tes-sep" style="border-top:1px solid var(--t-linea2);border-bottom:0"><button class="btn btn--principal" type="button" data-compok' + (K.err.length || !canEdit ? ' disabled' : '') + '>Confirmar compensación</button><button class="btn btn--sec" type="button" data-compcancel>Cancelar</button></div>');
    return h;
  }
  function refreshComp() {
    const box = main.querySelector('.tes-comp-prev'); if (!box || !ui.comp) return;
    const K = compCalc(derive());
    box.innerHTML = compPrevHtml(K);
    const g = main.querySelector('.tes-comp-totg'); if (g) g.textContent = fmt(K.G);
    const b = main.querySelector('[data-compok]'); if (b) b.disabled = !!(K.err.length || !canEdit);
  }
  async function confirmarComp() {
    if (!guard() || !ui.comp) return;
    const D = derive(), K = compCalc(D);
    if (K.err.length) { toast(K.err[0]); return; }
    if (D.P.length + K.pends.length > LIM.pend) { toast('Se superaría el máximo de ' + LIM.pend + ' documentos pendientes.'); return; }
    if (D.M.length + K.movs.length > LIM.movs) { toast('Se superaría el máximo de ' + LIM.movs + ' movimientos.'); return; }
    let nMov = coll('movs').reduce((a, x) => Math.max(a, x.n || 0), 0);
    const tareas = K.pends.map((p) => () => put('pend/' + p.id, { n: parseInt(p.id.slice(2), 10), id: p.id, tipo: p.tipo, fe: p.fe, fv: p.fv, per: p.per, nro: p.nro, det: p.det, cta: p.cta, mon: p.mon, imp: p.imp }))
      .concat(K.movs.map((m) => { nMov++; const n = nMov; return () => put('movs/m' + pad(n, 4), { n, f: m.f, tc: m.tc, nro: m.nro, det: m.det, soc: m.soc, cta: m.cta, cob: m.cob, pag: m.pag, medio: m.medio, ref: m.ref }); }));
    const est = $('.tes-estado'), previo = est.textContent; let hechos = 0;
    for (let i = 0; i < tareas.length; i += 8) { await Promise.all(tareas.slice(i, i + 8).map((f) => f())); hechos += Math.min(8, tareas.length - i); est.textContent = 'Guardando ' + hechos + ' de ' + tareas.length + '…'; }
    est.textContent = previo;
    const soc = ui.comp.soc; ui.comp = null;
    toast('Compensación registrada para ' + soc + ': ' + K.movs.length + ' movimientos y ' + K.pends.length + ' documentos.'); render();
  }

  /* ---- Render ---- */
  function renderTabs() {
    $('.tes-tabs').innerHTML = SECCIONES.map((t) => '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (ui.tab === t[0]) + '">' + t[1] + '</button>').join('');
  }
  /* ---- Listas desplegables propias (se abren completas, con scroll y filtro al escribir) ---- */
  function opcionesLista(k) {
    if (k === 'soc') return coll('socios').sort(porNombre).map((x) => ({ v: x.nombre }));
    if (k === 'cta') return coll('cuentas').map((x) => ({ v: x.nombre })).sort((a, b) => a.v.localeCompare(b.v, 'es', { sensitivity: 'base' }));
    if (k === 'ref') return coll('pend').sort((a, b) => (a.id < b.id ? -1 : 1)).map((x) => ({ v: x.id, t: (x.per || '') + (x.det ? ' · ' + x.det : '') }));
    const tcs = {}; coll('movs').forEach((m) => { if (m.tc) tcs[m.tc] = 1; });
    return Object.keys(tcs).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })).map((x) => ({ v: x }));
  }
  const pop = { el: null, input: null, items: [], act: -1, quieto: false };
  function cerrarPop() { const p = $('.tes-pop'); if (p) p.hidden = true; pop.input = null; pop.items = []; pop.act = -1; }
  function pintarPop(filtrar) {
    const p = $('.tes-pop'), inp = pop.input; if (!inp) return;
    const q = filtrar ? sinAcentos(inp.value) : '';
    const todas = opcionesLista(inp.dataset.lista);
    pop.items = todas.filter((o) => !q || sinAcentos(o.v + ' ' + (o.t || '')).indexOf(q) >= 0);
    const actual = lc(inp.value);
    pop.act = Math.max(-1, pop.items.findIndex((o) => lc(o.v) === actual));
    p.innerHTML = pop.items.length ? pop.items.map((o, i) => '<div role="option" data-i="' + i + '" class="' + (i === pop.act ? 'act' : '') + '">' + esc(o.v) + (o.t ? ' <span class="muted">' + esc(o.t) + '</span>' : '') + '</div>').join('') : '<div class="tes-pop-vacio">Sin coincidencias</div>';
    const r = inp.getBoundingClientRect(), ancho = Math.max(r.width, 280), vh = window.innerHeight;
    const abajo = vh - r.bottom, arriba = r.top, alto = Math.min(300, Math.max(120, Math.max(abajo, arriba) - 12));
    p.style.width = Math.min(ancho, window.innerWidth - 16) + 'px'; p.style.maxHeight = alto + 'px';
    p.style.left = Math.max(8, Math.min(r.left, window.innerWidth - Math.min(ancho, window.innerWidth - 16) - 8)) + 'px';
    p.hidden = false;
    if (abajo >= Math.min(220, alto) || abajo >= arriba) { p.style.top = (r.bottom + 2) + 'px'; p.style.bottom = 'auto'; } else { p.style.bottom = (vh - r.top + 2) + 'px'; p.style.top = 'auto'; }
    const a = p.querySelector('.act'); if (a) a.scrollIntoView({ block: 'nearest' });
  }
  function abrirPop(inp, filtrar) { if (pop.quieto) return; pop.input = inp; pintarPop(filtrar); }
  function elegirPop(i) {
    const o = pop.items[i], inp = pop.input; if (!o || !inp) return;
    inp.value = o.v; cerrarPop();
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    pendiente = false; clearTimeout(rT); setTimeout(doRender, 0);
  }
  function moverPop(d) {
    if (!pop.items.length) return;
    pop.act = (pop.act + d + pop.items.length) % pop.items.length;
    const p = $('.tes-pop'); p.querySelectorAll('.act').forEach((e) => e.classList.remove('act'));
    const e = p.querySelector('[data-i="' + pop.act + '"]'); if (e) { e.classList.add('act'); e.scrollIntoView({ block: 'nearest' }); }
  }
  let delT = null, anchos = [];
  // En Ingresos y gastos y Pendientes se libera el ancho máximo del contenedor para evitar el scroll horizontal
  function ajustarAncho() {
    const ancho = ui.tab === 'movimientos' || ui.tab === 'pendientes';
    if (ancho && !anchos.length) {
      let e = root;
      for (let i = 0; e && e !== document.body && i < 8; i++, e = e.parentElement) {
        const mw = getComputedStyle(e).maxWidth;
        if (mw && mw !== 'none') { anchos.push([e, e.style.maxWidth]); e.style.maxWidth = 'none'; }
      }
    } else if (!ancho && anchos.length) { anchos.forEach(([e, v]) => { e.style.maxWidth = v; }); anchos = []; }
  }
  // Si el sitio tiene una barra superior fija, el encabezado de Caja se pega justo debajo de ella
  function ajustarTope() {
    let top = 0;
    document.querySelectorAll('header, nav, [class*=topbar], [class*=cabecera]').forEach((e) => {
      if (root.contains(e)) return;
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      if ((cs.position === 'fixed' || cs.position === 'sticky') && r.top <= 1 && r.height > 0 && r.width > window.innerWidth * 0.5) top = Math.max(top, Math.round(r.bottom));
    });
    const t = $('.tes'); if (t) t.style.setProperty('--tes-top', top + 'px');
  }
  // alturas del encabezado y del bloque fijo de cada solapa (para que la tabla ocupe el resto de la pantalla)
  function medirFijos() {
    const t = $('.tes'); if (!t) return;
    const c = $('.tes-cab'), f = main.querySelector('.tes-fijo');
    t.style.setProperty('--tes-cab-h', (c ? Math.round(c.getBoundingClientRect().height) : 0) + 'px');
    t.style.setProperty('--tes-fijo-h', (f ? Math.round(f.getBoundingClientRect().height) + 10 : 0) + 'px');
    // la tabla ocupa exactamente lo que queda de pantalla: así la página no se desplaza y los títulos de columna quedan siempre visibles
    main.querySelectorAll('.tes-fija').forEach((x) => {
      x.style.maxHeight = 'none';
      const arriba = x.getBoundingClientRect().top + window.scrollY;
      x.style.maxHeight = Math.max(200, window.innerHeight - arriba - 14) + 'px';
    });
  }
  window.addEventListener('resize', medirFijos);
  function doRender() {
    if (destruido) return;
    ajustarAncho(); ajustarTope();
    const a = document.activeElement; let key = null, sel = null;
    if (a && main.contains(a)) {
      key = a.id ? '#' + a.id : (a.dataset.doc ? '[data-doc="' + a.dataset.doc + '"][data-f="' + a.dataset.f + '"]' : (a.dataset.cfg ? '[data-cfg="' + a.dataset.cfg + '"]' : (a.dataset.id ? '[data-id="' + a.dataset.id + '"]' : null)));
      if (a.selectionStart != null && !['number', 'date', 'month', 'search'].includes(a.type)) { try { sel = [a.selectionStart, a.selectionEnd]; } catch (e) { /* nada */ } }
    }
    const sc = window.scrollY, fj = main.querySelector('.tes-fija'), fjs = fj ? [fj.scrollTop, fj.scrollLeft] : null;
    renderTabs();
    if (errorCarga) { main.innerHTML = '<div class="aviso aviso--mal">' + esc(errorCarga) + '</div>'; return; }
    if (!cargado) { main.innerHTML = '<div class="vacio"><p>Cargando datos…</p></div>'; return; }
    const D = derive(); cerrarPop();
    const v = { resumen: vResumen, movimientos: (ui.imp ? vImp : vMovs), pendientes: vPend, saldos: vSaldos, listado: vListado, socios: (ui.comp ? vComp : vSocios), cuentas: vCuentas, instrucciones: vInstr }[ui.tab] || vResumen;
    const banner = canEdit ? '' : '<div class="aviso aviso--info">Estás en modo de solo lectura: podés ver los datos pero no modificarlos.</div>';
    const vacio = (!D.M.length && !D.P.length && !D.socios.length && !D.cuentas.length && ui.tab !== 'instrucciones' && canEdit) ? '<div class="aviso aviso--info">Todavía no hay datos. Usá “Importar planilla .xlsx” para cargar tu planilla Caja y Pagos Aero, o empezá a cargar cuentas, socios y movimientos.</div>' : '';
    main.innerHTML = '<div class="tes-stack">' + banner + vacio + v(D) + '</div>';
    medirFijos();
    window.scrollTo(0, sc);
    if (fjs) { const f2 = main.querySelector('.tes-fija'); if (f2) { f2.scrollTop = fjs[0]; f2.scrollLeft = fjs[1]; } }
    if (key) { const el = main.querySelector(key); if (el) { try { pop.quieto = true; el.focus({ preventScroll: true }); pop.quieto = false; if (sel) el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* nada */ } } }
  }
  function render() {
    clearTimeout(rT);
    rT = setTimeout(() => {
      const a = document.activeElement;
      if (a && main.contains(a) && a.matches('input') && !a.dataset.draft && a.type !== 'search' && a.value !== a.defaultValue) { pendiente = true; return; }
      pendiente = false; doRender();
    }, 30);
  }

  /* ---- Acciones ---- */
  const guard = () => { if (!canEdit) { toast('Estás en modo de solo lectura.'); return false; } return true; };
  const drafts = (kind) => { const o = {}; $$('[data-draft="' + kind + '"]').forEach((e) => { o[e.dataset.f] = e.value; }); return o; };
  const nextN = (name) => coll(name).reduce((a, x) => Math.max(a, x.n || 0), 0) + 1;
  function setSeccion(t) { ui.tab = t; ui.confirm = null; ui.imp = null; ui.comp = null; if (opts.alCambiarSeccion) opts.alCambiarSeccion(t); render(); }

  function addMov() {
    if (!guard()) return; const d = drafts('mov');
    if (coll('movs').length >= LIM.movs) { toast('Se alcanzó el máximo de ' + LIM.movs + ' movimientos.'); return; }
    const cob = numOrNull(d.cob), pag = numOrNull(d.pag);
    if (!d.f) { toast('Falta la fecha.'); return; }
    if (!cob && !pag) { toast('Cargá un importe en Cobros o en Pagos.'); return; }
    const n = nextN('movs');
    put('movs/m' + pad(n, 4), { n, f: d.f, tc: d.tc || '', nro: d.nro || '', det: d.det || '', soc: d.soc || '', cta: d.cta || '', cob, pag, medio: d.medio || '', ref: d.ref || '' });
    ui.draft.mov = { medio: d.medio, f: d.f }; toast('Movimiento agregado.'); render();
  }
  function addPend() {
    if (!guard()) return; const d = drafts('pend');
    if (coll('pend').length >= LIM.pend) { toast('Se alcanzó el máximo de ' + LIM.pend + ' documentos.'); return; }
    const imp = numOrNull(d.imp); if (imp == null) { toast('Falta el importe.'); return; }
    if (!d.tipo) { toast('Elegí el tipo.'); return; }
    const n = coll('pend').reduce((a, p) => Math.max(a, parseInt(String(p.id).slice(2), 10) || 0), 0) + 1, id = 'P-' + pad(n, 3);
    put('pend/' + id, { n, id, tipo: d.tipo, fe: d.fe || '', fv: d.fv || '', per: d.per || '', nro: d.nro || '', det: d.det || '', cta: d.cta || '', mon: d.mon || 'ARS', imp });
    ui.draft.pend = {}; toast('Documento ' + id + ' agregado.'); render();
  }
  function addSoc() {
    if (!guard()) return; const d = drafts('soc');
    if (coll('socios').length >= LIM.socios) { toast('Se alcanzó el máximo de ' + LIM.socios + '.'); return; }
    if (!(d.nombre || '').trim()) { toast('Falta el nombre.'); return; }
    const n = nextN('socios'); put('socios/s' + pad(n, 3), { n, nombre: d.nombre.trim(), tipo: d.tipo || 'Socio', cuit: d.cuit || 'N/A' });
    ui.draft.soc = {}; toast('Agregado.'); render();
  }
  function addCta() {
    if (!guard()) return; const d = drafts('cta');
    if (coll('cuentas').length >= LIM.cuentas) { toast('Se alcanzó el máximo de ' + LIM.cuentas + ' cuentas.'); return; }
    if (!(d.nombre || '').trim()) { toast('Falta el nombre de la cuenta.'); return; }
    const n = nextN('cuentas'); put('cuentas/c' + pad(n, 3), { n, nombre: d.nombre.trim() });
    ui.draft.cta = {}; toast('Cuenta agregada.'); render();
  }

  /* ---- Archivos ---- */
  function cargarXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = XLSX_URL; s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('No se pudo cargar el lector de Excel (falta la librería o no hay conexión a internet).')); document.head.appendChild(s); });
  }
  async function guardarArchivo(nombre, datos) {
    try {
      if (window.claude && window.claude.use) {
        const dl = await window.claude.use('downloads');
        if (dl) { await dl.save({ filename: nombre, data: datos }); toast('Archivo guardado.'); return; }
      }
      const blob = datos instanceof Blob ? datos : new Blob([datos], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { if (!e || e.code !== 'declined') toast('No se pudo descargar: ' + ((e && (e.message || e.code)) || 'error')); }
  }
  async function dlListado(tipo) {
    const X = derive().L, base = 'Listado_' + X.desde + '_a_' + X.hasta;
    const rows = [['N°', 'Fecha', 'Tipo comprob.', 'Comprob. N°', 'Detalle', 'Socio / Entidad', 'Cuenta', 'Moneda', 'Cobros', 'Pagos', 'Efectivo / Banco', 'Ref. documento']];
    X.items.forEach((m, i) => rows.push([i + 1, fmtD(m.f), m.tc || '', m.nro || '', m.det || '', m.soc || '', m.cta || '', m.mon, m.cob || 0, m.pag || 0, m.medio || '', m.ref || '']));
    if (tipo === 'csv') {
      const csv = rows.map((r) => r.map((c) => { c = String(c); return /[",;\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(';')).join('\n');
      return guardarArchivo(base + '.csv', '﻿' + csv);
    }
    try {
      const XL = await cargarXlsx(), wb = XL.utils.book_new();
      const top = [['Listado de movimientos para el estudio contable'], ['Período', fmtD(X.desde) + ' al ' + fmtD(X.hasta)], [], ['Totales', '', '', 'Cobros', 'Pagos', 'Neto'], ['Pesos (ARS)', '', '', X.ars.cob, X.ars.pag, X.ars.neto], ['Dólares (USD)', '', '', X.usd.cob, X.usd.pag, X.usd.neto], []];
      XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(top.concat(rows)), 'Listado');
      return guardarArchivo(base + '.xlsx', XL.write(wb, { type: 'array', bookType: 'xlsx' }));
    } catch (e) { toast(e.message); }
  }
  async function exportAll() {
    try {
      const XL = await cargarXlsx(), d = derive(), wb = XL.utils.book_new(), c = cfg();
      const a = [['Fecha', 'Tipo Comprob.', 'Comprob. N°', 'Detalle', 'Socio / Entidad', 'Cuenta', 'Cobros', 'Pagos', 'Saldo', 'Efectivo / Banco', 'Mes', 'Año', 'Ref. Doc. Pendiente (ID)']];
      d.M.forEach((m) => a.push([fmtD(m.f), m.tc || '', m.nro || '', m.det || '', m.soc || '', m.cta || '', m.cob || '', m.pag || '', m.saldo, m.medio || '', m.mes, m.anio, m.ref || '']));
      XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(a), 'Planilla Ing_Gastos');
      const p = [['ID', 'Tipo', 'Fecha emisión', 'Vencimiento', 'Persona / Entidad', 'Comprob. N°', 'Detalle', 'Cuenta', 'Moneda', 'Importe', 'Cobrado / Pagado', 'Saldo', 'Estado', 'Días de atraso']];
      d.P.forEach((x) => p.push([x.id, x.tipo, fmtD(x.fe), fmtD(x.fv), x.per || '', x.nro || '', x.det || '', x.cta || '', x.mon || '', x.imp == null ? '' : x.imp, x.cobrado, x.saldo, x.estado, x.dias]));
      XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(p), 'Pendientes');
      const s = [['Período'].concat(MEDIO_HDR), ['Saldos al inicio'].concat([0, 1, 2, 3, 4].map((i) => (c['s' + i] == null ? '' : c['s' + i])))];
      d.saldos.forEach((r) => s.push([MESES[r.m - 1] + ' ' + r.y].concat(r.v)));
      XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(s), 'Saldos Caja y Bancos');
      const so = [['Nro.', 'Socio / Entidad', 'Tipo', 'CUIT / Contacto', 'Por cobrar ARS', 'Por pagar ARS', 'Por cobrar USD', 'Por pagar USD']];
      d.socios.forEach((x, i) => so.push([i + 1, x.nombre, x.tipo, x.cuit || '', x.cA, x.pA, x.cU, x.pU]));
      XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(so), 'Socio - Entidad');
      const cc = [['Nro.', 'Cuenta']]; d.cuentas.forEach((x, i) => cc.push([i + 1, x.nombre]));
      XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(cc), 'C.C.');
      guardarArchivo('Caja_y_Pagos_Aero_' + today() + '.xlsx', XL.write(wb, { type: 'array', bookType: 'xlsx' }));
    } catch (e) { toast(e.message); }
  }
  async function importFile(file) {
    if (!file || !guard()) return;
    try {
      const XL = await cargarXlsx();
      const wb = XL.read(await file.arrayBuffer(), { type: 'array' });
      const rows = (n) => { const ws = wb.Sheets[n]; return ws ? XL.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }) : null; };
      const mv = rows('Planilla Ing_Gastos'), pd = rows('Pendientes'), sc = rows('Socio - Entidad'), cc = rows('C.C.'), sd = rows('Saldos Caja y Bancos');
      if (!mv || !pd || !sc || !cc || !sd) { toast('El archivo no parece una planilla Caja y Pagos Aero.'); return; }
      const S = (v) => (v == null ? '' : String(v)), out = [];
      let n = 0;
      for (let i = 2; i < mv.length && n < LIM.movs; i++) { const r = mv[i]; if (!r) continue; const cob = numOrNull(r[7]), pag = numOrNull(r[8]), f = serial2iso(r[1]); if (!f && !cob && !pag) continue; n++;
        out.push(['movs/m' + pad(n, 4), { n, f, tc: S(r[2]), nro: S(r[3]), det: S(r[4]), soc: S(r[5]), cta: S(r[6]), cob, pag, medio: S(r[10]), ref: S(r[14]) }]); }
      let k = 0; for (let i = 4; i < pd.length && k < LIM.pend; i++) { const q = pd[i]; if (!q || q[10] == null || q[1] == null) continue; k++;
        out.push(['pend/' + q[1], { n: k, id: S(q[1]), tipo: S(q[2]), fe: serial2iso(q[3]), fv: serial2iso(q[4]), per: S(q[5]), nro: S(q[6]), det: S(q[7]), cta: S(q[8]), mon: S(q[9]), imp: numOrNull(q[10]) }]); }
      let j = 0; for (let i = 2; i < sc.length && j < LIM.socios; i++) { const w = sc[i]; if (!w || !w[2]) continue; j++; out.push(['socios/s' + pad(j, 3), { n: j, nombre: S(w[2]), tipo: S(w[3]), cuit: S(w[4]) }]); }
      let z = 0; for (let i = 2; i < cc.length && z < LIM.cuentas; i++) { const y = cc[i]; if (!y || !y[2]) continue; z++; out.push(['cuentas/c' + pad(z, 3), { n: z, nombre: S(y[2]) }]); }
      const st = sd[2] || []; out.push(['app/cfg', { s0: numOrNull(st[2]), s1: numOrNull(st[3]), s2: numOrNull(st[4]), s3: numOrNull(st[5]), s4: numOrNull(st[6]) }]);
      await reemplazarTodo(out);
    } catch (e) { toast('No se pudo leer el archivo: ' + (e.message || e)); }
  }
  async function reemplazarTodo(lista) {
    const viejos = Object.keys(docs).filter((k) => /^(movs|pend|socios|cuentas)\//.test(k));
    const tareas = viejos.map((k) => () => del(k)).concat(lista.map((x) => () => put(x[0], x[1])));
    const est = $('.tes-estado'), previo = est.textContent; let hechos = 0;
    for (let i = 0; i < tareas.length; i += 8) {
      await Promise.all(tareas.slice(i, i + 8).map((f) => f()));
      hechos += Math.min(8, tareas.length - i); est.textContent = 'Importando ' + hechos + ' de ' + tareas.length + '…';
    }
    est.textContent = previo; toast('Planilla importada: ' + lista.length + ' registros.'); render();
  }

  /* ---- Eventos (todos delegados en el contenedor del módulo) ---- */
  function onInput(e) {
    const t = e.target;
    if (ui.comp && t.dataset && (t.dataset.cf || t.dataset.ct) && t.tagName === 'INPUT') {
      if (t.dataset.cf) ui.comp[t.dataset.cf] = t.value;
      else { const [i, f] = t.dataset.ct.split(':'); ui.comp.tk[+i][f] = t.value; }
      refreshComp(); return;
    }
    if (t.dataset && t.dataset.draft) ui.draft[t.dataset.draft][t.dataset.f] = t.value;
    else if (t.dataset && t.dataset.id === 'fTxt') { ui.fTxt = t.value; clearTimeout(onInput.t); onInput.t = setTimeout(doRender, 250); }
  }
  function onChange(e) {
    const t = e.target;
    if (t.matches('[data-imp]')) { importFile(t.files[0]); t.value = ''; return; }
    if (t.matches('[data-impfile]')) { leerExtracto(t.files[0]); return; }
    if (ui.comp && t.dataset && (t.dataset.cf || t.dataset.ct)) {
      if (t.tagName === 'SELECT') {
        ui.comp[t.dataset.cf] = t.value;
        if (t.dataset.cf === 'docId') { const D = derive(), d = D.P.find((p) => p.id === t.value); ui.comp.liq = d ? d.saldo : ''; }
        if (t.dataset.cf === 'medio') ui.comp.docId = '';
        render();
      } else if (t.dataset.cf === 'soc') { ui.comp.docId = ''; render(); }
      return;
    }
    if (ui.imp) {
      if (t.dataset.impcol) { ui.imp.map[t.dataset.impcol] = t.value; if ((t.dataset.impcol === 'deb' || t.dataset.impcol === 'cre') && t.value !== '') ui.imp.map.imp = ''; if (t.dataset.impcol === 'imp' && t.value !== '') { ui.imp.map.deb = ''; ui.imp.map.cre = ''; } calcItemsImp(); render(); return; }
      if (t.dataset.id === 'imp-medio') { ui.imp.medio = t.value; (ui.imp.items || []).forEach((m) => { m.selTocado = false; m.sel = true; }); aplicarReglasImp(ui.imp.items || [], true); render(); return; }
      if (t.dataset.impchk != null) { const m = ui.imp.items[+t.dataset.impchk]; m.sel = t.checked; m.selTocado = true; render(); return; }
      if (t.dataset.impcta != null) { const m = ui.imp.items[+t.dataset.impcta]; m.cta = t.value; m.manual = true; render(); return; }
    }
    if (t.dataset.doc) {
      if (!guard()) { doRender(); return; }
      const o = { ...(docs[t.dataset.doc] || {}) }; o[t.dataset.f] = t.dataset.t === 'num' ? numOrNull(t.value) : t.value;
      put(t.dataset.doc, o); render(); return;
    }
    if (t.dataset.cfg) { if (!guard()) { doRender(); return; } const c = { ...cfg() }; c[t.dataset.cfg] = numOrNull(t.value); put('app/cfg', c); render(); return; }
    switch (t.dataset.id) {
      case 'corte': ui.corte = t.value; render(); break;
      case 'mesAn': ui.mesAn = t.value; render(); break;
      case 'fMes': ui.fMes = t.value; ui.showAll = false; render(); break;
      case 'l-tipo': ui.lst.tipo = t.value; render(); break;
      case 'l-mes': ui.lst.mes = +t.value; render(); break;
      case 'l-anio': ui.lst.anio = +t.value; render(); break;
      case 'l-desde': ui.lst.desde = t.value; render(); break;
      case 'l-hasta': ui.lst.hasta = t.value; render(); break;
      default:
    }
  }
  function onClick(e) {
    const t = e.target.closest('button');
    if (!t || !root.contains(t)) return;
    if (t.dataset.tab) return setSeccion(t.dataset.tab);
    if (t.dataset.moneda) { ui.moneda = t.dataset.moneda; return render(); }
    if (t.hasAttribute('data-hoy')) { ui.corte = ''; return render(); }
    if (t.hasAttribute('data-showall')) { ui.showAll = true; return render(); }
    if (t.dataset.del) {
      if (!guard()) return; const p = t.dataset.del;
      const pintar = (b, on) => { if (b && b.isConnected) b.textContent = on ? '¿Seguro?' : 'Borrar'; };
      clearTimeout(delT);
      if (ui.confirm === p) { ui.confirm = null; del(p).then(render); render(); }
      else {
        // se actualiza solo el botón, sin redibujar la pantalla: así no se pierde la posición ni el foco
        const prev = main.querySelector('[data-del][data-armado]'); if (prev) { prev.removeAttribute('data-armado'); pintar(prev, false); }
        ui.confirm = p; t.setAttribute('data-armado', '1'); pintar(t, true);
        delT = setTimeout(() => { if (ui.confirm === p) { ui.confirm = null; t.removeAttribute('data-armado'); pintar(t, false); } }, 8000);
      }
      return;
    }
    if (t.dataset.add === 'mov') return addMov();
    if (t.dataset.add === 'pend') return addPend();
    if (t.dataset.add === 'soc') return addSoc();
    if (t.dataset.add === 'cta') return addCta();
    if (t.dataset.add === 'reg') return addRegla();
    if (t.dataset.comp != null) { if (!guard()) return; ui.tab = 'socios'; ui.comp = compNuevo(t.dataset.comp); if (opts.alCambiarSeccion) opts.alCambiarSeccion('socios'); return render(); }
    if (t.hasAttribute('data-compcancel')) { ui.comp = null; return render(); }
    if (t.hasAttribute('data-compok')) return confirmarComp();
    if (t.hasAttribute('data-tkadd')) { ui.comp.tk.push({ det: '', nro: '', cta: '', imp: '' }); return render(); }
    if (t.dataset.tkdel != null) { ui.comp.tk.splice(+t.dataset.tkdel, 1); if (!ui.comp.tk.length) ui.comp.tk.push({ det: '', nro: '', cta: '', imp: '' }); return render(); }
    if (t.hasAttribute('data-impext')) { if (!guard()) return; ui.tab = 'movimientos'; ui.imp = { medio: '', matriz: null, items: [] }; if (opts.alCambiarSeccion) opts.alCambiarSeccion('movimientos'); return render(); }
    if (t.hasAttribute('data-impcancel')) { ui.imp = null; return render(); }
    if (t.hasAttribute('data-impok')) return confirmarExtracto();
    if (t.dataset.impall != null) { (ui.imp.items || []).forEach((m) => { m.sel = t.dataset.impall === '1'; m.selTocado = true; }); return render(); }
    if (t.dataset.regdel != null) { if (!guard()) return; const L = reglas(); L.splice(+t.dataset.regdel, 1); put('app/reglas', { items: L }); aplicarReglasImp(ui.imp.items || [], false); return render(); }
    if (t.dataset.dl) return dlListado(t.dataset.dl);
    if (t.hasAttribute('data-exp')) return exportAll();
  }
  function onFocusOut() { if (pendiente) setTimeout(render, 40); }
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  root.addEventListener('focusout', onFocusOut);
  const onFocusIn = (e) => { const t = e.target; if (t.matches && t.matches('input[data-lista]') && !t.readOnly) abrirPop(t, false); };
  const onClickLista = (e) => { const t = e.target; if (t.matches && t.matches('input[data-lista]') && pop.input !== t && !pop.quieto) abrirPop(t, false); };
  const onInputLista = (e) => { const t = e.target; if (t.matches && t.matches('input[data-lista]')) { if (pop.input !== t) pop.input = t; pintarPop(true); } };
  const onKeyLista = (e) => {
    const t = e.target; if (!(t.matches && t.matches('input[data-lista]'))) return;
    const abierto = !!pop.input && !$('.tes-pop').hidden;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!abierto) abrirPop(t, false); else moverPop(e.key === 'ArrowDown' ? 1 : -1); }
    else if (e.key === 'Enter' && abierto && pop.act >= 0) { e.preventDefault(); elegirPop(pop.act); }
    else if (e.key === 'Escape' && abierto) { e.preventDefault(); e.stopPropagation(); cerrarPop(); }
    else if (e.key === 'Tab') cerrarPop();
  };
  const onDownPop = (e) => { const it = e.target.closest && e.target.closest('.tes-pop [data-i]'); if (it) { e.preventDefault(); elegirPop(+it.dataset.i); } };
  const onScrollFuera = (e) => { const t = e.target; if (t && t.closest && t.closest('.tes-pop')) return; cerrarPop(); };
  const onFueraPop = (e) => { if (pop.input && e.target !== pop.input && !(e.target.closest && e.target.closest('.tes-pop'))) cerrarPop(); };
  root.addEventListener('focusin', onFocusIn); root.addEventListener('click', onClickLista); root.addEventListener('input', onInputLista);
  root.addEventListener('keydown', onKeyLista); root.addEventListener('mousedown', onDownPop);
  document.addEventListener('mousedown', onFueraPop); window.addEventListener('resize', cerrarPop); window.addEventListener('scroll', onScrollFuera, true);

  /* ---- Arranque ---- */
  doRender();
  const listo = Promise.resolve(adapter.cargar((d) => { docs = { ...d }; render(); }))
    .then((d) => { docs = { ...d }; cargado = true; render(); })
    .catch((e) => { errorCarga = (e && e.message) || 'No se pudieron cargar los datos de tesorería.'; render(); });

  return {
    listo,
    destruir() {
      destruido = true; anchos.forEach(([e, v]) => { e.style.maxWidth = v; }); anchos = []; clearTimeout(rT);
      root.removeEventListener('input', onInput); root.removeEventListener('change', onChange);
      root.removeEventListener('click', onClick); root.removeEventListener('focusout', onFocusOut);
      root.removeEventListener('focusin', onFocusIn); root.removeEventListener('click', onClickLista); root.removeEventListener('input', onInputLista); root.removeEventListener('keydown', onKeyLista); root.removeEventListener('mousedown', onDownPop);
      document.removeEventListener('mousedown', onFueraPop); window.removeEventListener('resize', cerrarPop); window.removeEventListener('resize', medirFijos); window.removeEventListener('scroll', onScrollFuera, true);
      root.innerHTML = '';
    }
  };
}
