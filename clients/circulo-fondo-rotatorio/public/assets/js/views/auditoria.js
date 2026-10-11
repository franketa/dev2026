// Auditoría: el registro de todo lo que se hizo, la verificación de las cadenas de hash,
// los intentos de cargar comprobantes repetidos y las copias de seguridad.

import { get, post, html, pintar, icono, fechaHora, error, toast, conBoton, chip, qs, vacio, cat, sel, pesos } from '../lib.js';

const ENTIDADES = { gasto: '#/gastos/', solicitud: '#/solicitudes/' };

function cambios(r) {
  const a = r.antes ? JSON.parse(r.antes) : null;
  const d = r.despues ? JSON.parse(r.despues) : null;
  if (!a && !d) return '';
  const claves = [...new Set([...Object.keys(a || {}), ...Object.keys(d || {})])].filter(k => !['retenciones_detalle'].includes(k));
  const fmt = (k, v) => (v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : /importe|bruto|neto|monto|valor|total|saldo/.test(k) && Number.isInteger(v) ? pesos(v) : String(v));
  const filas = claves.filter(k => !a || JSON.stringify(a[k]) !== JSON.stringify(d?.[k])).slice(0, 12);
  if (!filas.length) return '';
  return html`<details><summary class="chico muted" style="cursor:pointer">Ver ${a ? 'antes / después' : 'datos'}</summary>
    <table class="tabla" style="font-size:.82rem;margin-top:6px"><tbody>${filas.map(k => html`<tr><td class="muted">${k}</td>${a ? html`<td>${fmt(k, a[k])}</td>` : ''}<td><strong>${fmt(k, d?.[k])}</strong></td></tr>`)}</tbody></table></details>`;
}

export default async function auditoria(ctx) {
  const tab = ctx.query.tab || 'registro';
  const veTodas = ctx.puede('sedes.ver_todas');
  const c = await cat();
  const TABS = [['registro', 'Registro'], ['duplicados', 'Comprobantes repetidos'], ...(veTodas ? [['integridad', 'Integridad y respaldos']] : [])];
  let cuerpo = '';
  if (tab === 'registro') {
    const { registros, acciones } = await get(`/api/auditoria?${qs({ sede_id: ctx.query.sede, accion: ctx.query.accion, antes_de: ctx.query.antes_de })}`);
    cuerpo = html`
      <form class="filtros" id="f">
        ${veTodas ? html`<select class="select" name="sede" aria-label="Sede"><option value="">Todas las sedes</option>${c.sedes.map(s => html`<option value="${s.id}" ${sel(String(s.id) === ctx.query.sede)}>${s.nombre}</option>`)}</select>` : ''}
        <select class="select" name="accion" aria-label="Acción"><option value="">Todas las acciones</option>
          ${[['gasto', 'Gastos'], ['solicitud', 'Solicitudes'], ['fondo', 'Fondos'], ['rendicion', 'Rendiciones'], ['proveedor', 'Proveedores'], ['retencion', 'Retenciones'], ['usuario', 'Usuarios'], ['sesion', 'Ingresos al sistema'], ['parametro', 'Parámetros'], ['permisos', 'Permisos']]
            .map(([v, t]) => html`<option value="${v}" ${sel(v === ctx.query.accion)}>${t}</option>`)}</select>
      </form>
      ${registros.length ? html`<div class="lista">${registros.map(r => html`<div class="item" style="align-items:flex-start">
        <span class="item__icono">${icono(r.accion.startsWith('gasto.duplicado') ? 'alerta' : r.accion.startsWith('rendicion') ? 'rendicion' : r.accion.startsWith('sesion') ? 'usuario' : 'escudo')}</span>
        <div class="item__texto" style="white-space:normal"><strong style="white-space:normal">${acciones[r.accion] || r.accion}${r.entidad_id && ENTIDADES[r.entidad] ? html` <a href="${ENTIDADES[r.entidad]}${r.entidad_id}">#${r.entidad_id}</a>` : r.entidad_id ? ` #${r.entidad_id}` : ''}</strong>
          <small style="white-space:normal">${r.usuario || 'Sistema'}${r.sede_nombre ? ` · ${r.sede_nombre}` : ''} · ${fechaHora(r.creado_en)}${r.ip ? ` · IP ${r.ip}` : ''}</small>
          ${r.motivo ? html`<small style="white-space:normal">Motivo: <em>${r.motivo}</em></small>` : ''}
          ${cambios(r)}</div>
        <small class="muted mono" title="Hash del registro">#${r.id}</small></div>`)}</div>
        ${registros.length === 100 ? html`<a class="btn btn--sec" href="#/auditoria?${qs({ sede: ctx.query.sede, accion: ctx.query.accion, antes_de: registros[registros.length - 1].id })}">Más viejos</a>` : ''}` : vacio('Sin registros con ese filtro.', 'escudo')}`;
  } else if (tab === 'duplicados') {
    const { intentos } = await get(`/api/gastos/intentos-duplicado?${qs({ sede_id: ctx.query.sede })}`);
    cuerpo = intentos.length ? html`<div class="tabla-caja"><table class="tabla"><thead><tr><th>Cuándo</th><th>Quién</th><th>Sede</th><th>Qué chocó</th><th>Ya cargado como</th></tr></thead><tbody>
      ${intentos.map(i => { const d = JSON.parse(i.datos || '{}'); return html`<tr><td>${fechaHora(i.creado_en)}</td><td>${i.usuario}<br><small class="muted">IP ${i.ip || '—'}</small></td><td>${i.sede_nombre || '—'}</td>
        <td>${i.clave === 'cae' ? html`CAE <span class="mono">${i.valor}</span>` : i.valor}<br><small class="muted">${d.proveedor || ''} · ${d.bruto ? pesos(d.bruto) : ''}</small></td>
        <td><a href="#/gastos/${i.gasto_existente_id}">Gasto #${i.gasto_existente_id}</a></td></tr>`; })}
      </tbody></table></div>` : html`<div class="aviso aviso--ok">${icono('check')}<span>No hubo intentos de cargar comprobantes repetidos.</span></div>`;
  } else {
    const v = await get('/api/auditoria/verificar');
    const { respaldos } = await get('/api/respaldos');
    const fila = (t, r) => html`<div class="item"><span class="item__icono">${icono('cadena')}</span><div class="item__texto" style="white-space:normal"><strong>${t}</strong>
      <small style="white-space:normal">${r.ok ? `${r.registros} registros encadenados. Último hash: ${r.ultimo_hash.slice(0, 24)}…` : r.error}</small></div>${r.ok ? chip('ok', 'Íntegra') : chip('mal', 'ALTERADA')}</div>`;
    cuerpo = html`<div class="lista">${fila('Registro de auditoría', v.auditoria)}${fila('Libro de movimientos (saldos)', v.libro)}</div>
      <p class="chico muted">Cada registro guarda la huella (hash) del anterior. Si alguien modifica o borra una fila directo en la base de datos, la cadena se corta y se ve acá.</p>
      <section class="panel"><div class="panel__cab"><h3>${icono('descargar')} Copias de seguridad</h3>${ctx.puede('admin.parametros') ? html`<button class="btn btn--sec btn--chico" type="button" data-respaldo>Hacer una copia ahora</button>` : ''}</div>
        <p class="chico muted" style="margin-bottom:10px">Se hace una copia completa de la base todos los días y quedan las últimas 30 en el servidor. Conviene bajar una por semana y guardarla afuera.</p>
        ${respaldos.length ? html`<div class="lista">${respaldos.map(r => html`<div class="item"><div class="item__texto"><strong>${r.nombre}</strong><small>${fechaHora(r.creado_en)} · ${(r.bytes / 1048576).toFixed(1)} MB</small></div>
          ${ctx.puede('admin.parametros') ? html`<a class="btn btn--sec btn--chico" href="/api/respaldos/${r.nombre}">${icono('descargar')} Bajar</a>` : ''}</div>`)}</div>` : html`<p class="muted">Todavía no hay copias.</p>`}
      </section>`;
  }

  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>Auditoría</h1><p>Todo queda registrado: quién, cuándo, desde dónde, qué había antes y qué quedó. Nada se borra.</p></div></div>
    <nav class="pestanas">${TABS.map(([v, t]) => html`<a href="#/auditoria?tab=${v}" ${v === tab ? html`aria-current="page"` : ''}>${t}</a>`)}</nav>
    ${cuerpo}
  </div>`);
  const f = ctx.el.querySelector('#f');
  f?.addEventListener('change', () => ctx.ir(`#/auditoria?${qs({ sede: f.sede?.value, accion: f.accion.value })}`));
  ctx.el.querySelector('[data-respaldo]')?.addEventListener('click', (e) => conBoton(e.currentTarget, async () => {
    try { await post('/api/respaldos'); toast('Copia de seguridad hecha', 'ok'); ctx.recargar(); } catch (ex) { error(ex); }
  }));
}
