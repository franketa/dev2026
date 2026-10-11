// Administración: sedes, usuarios, rubros, parámetros con vigencia, alícuotas, datos del Círculo, permisos y flags.

import {
  get, post, put, html, raw, pintar, icono, pesos, fecha, fechaHora, error, toast, conBoton, modal, datosForm, parsePesos, mascaraPesos,
  pesosInput, hoyAR, chip, sel, chk, cat, alicuota, fmtCuit
} from '../lib.js';

// Formulario en un modal; `enviar(datos)` hace el pedido. Devuelve el resultado o null.
function formModal({ titulo, subtitulo, campos, boton = 'Guardar', enviar }) {
  return new Promise((ok) => {
    const m = modal({
      titulo, subtitulo, alCerrar: (v) => ok(v ?? null),
      contenido: html`<form class="form" novalidate>${campos}
        <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">${boton}</button></div></form>`
    });
    const f = m.el.querySelector('form');
    f.querySelectorAll('[data-pesos]').forEach(mascaraPesos);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      conBoton(f.querySelector('[type=submit]'), async () => {
        try { const r = await enviar(datosForm(f), f); m.cerrar(r ?? true); } catch (ex) { error(ex); }
      });
    });
  });
}
const campo = (label, input, ayuda = '') => html`<div class="campo"><label>${label}</label>${input}${ayuda ? html`<span class="campo__ayuda">${ayuda}</span>` : ''}</div>`;

// ── Sedes ───────────────────────────────────────────────────────────────────
export async function adminSedes(ctx) {
  const { sedes } = await get('/api/admin/sedes');
  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>Sedes</h1><p>Cada sede es un centro de costo. Vicente López es la sede modelo.</p></div>
      <div class="vista__acciones"><button class="btn btn--principal" type="button" data-nueva>${icono('mas')} Sede nueva</button></div></div>
    <div class="lista">${sedes.map(s => html`<div class="item ${s.activa ? '' : 'item--anulado'}"><span class="item__icono">${icono('edificio')}</span>
      <div class="item__texto"><strong>${s.nombre} ${s.es_central ? chip('info', 'Central') : ''}</strong><small>${s.codigo}${s.descripcion ? ` · ${s.descripcion}` : ''}${s.activa ? '' : ' · dada de baja'}</small></div>
      <button class="btn btn--fantasma btn--chico" type="button" data-editar="${s.id}" aria-label="Editar">${icono('editar')}</button></div>`)}</div>
  </div>`);
  const editar = async (s = {}) => {
    const r = await formModal({
      titulo: s.id ? s.nombre : 'Sede nueva',
      campos: html`${campo('Nombre', html`<input class="input" name="nombre" value="${s.nombre || ''}" required>`)}
        ${campo('Código corto', html`<input class="input" name="codigo" value="${s.codigo || ''}" maxlength="10" required>`, 'Se usa en los nombres de archivo (ej.: VL).')}
        ${campo('Descripción', html`<input class="input" name="descripcion" value="${s.descripcion || ''}">`)}
        ${campo('Orden', html`<input class="input" name="orden" type="number" value="${s.orden ?? 0}">`)}
        ${s.es_central ? '' : html`<label class="check"><input type="checkbox" name="activa" ${chk(s.activa !== 0)}>Activa</label>`}`,
      enviar: (d) => (s.id ? put(`/api/admin/sedes/${s.id}`, { ...d, activa: s.es_central ? true : d.activa }) : post('/api/admin/sedes', d))
    });
    if (r) { toast('Sede guardada', 'ok'); await cat(true); ctx.recargar(); }
  };
  ctx.el.querySelector('[data-nueva]').addEventListener('click', () => editar());
  ctx.el.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => editar(sedes.find(s => s.id === Number(b.dataset.editar)))));
}

// ── Usuarios ────────────────────────────────────────────────────────────────
export async function adminUsuarios(ctx) {
  const { usuarios, roles } = await get('/api/admin/usuarios');
  const { sedes } = await get('/api/admin/sedes');
  const grupos = sedes.map(s => ({ sede: s, usuarios: usuarios.filter(u => u.sede_id === s.id) }));
  const sinSede = usuarios.filter(u => !u.sede_id);
  const fila = (u) => html`<div class="item ${u.activo ? '' : 'item--anulado'}"><span class="avatar" style="width:34px;height:34px;font-size:.78rem">${(u.nombre[0] + (u.apellido[0] || '')).toUpperCase()}</span>
    <div class="item__texto"><strong>${u.nombre} ${u.apellido}</strong><small>${roles[u.rol].nombre} · ${u.email}${u.ultimo_acceso ? ` · último ingreso ${fechaHora(u.ultimo_acceso)}` : ' · nunca entró'}${u.activo ? '' : ' · dado de baja'}</small></div>
    <button class="btn btn--fantasma btn--chico" type="button" data-editar="${u.id}" aria-label="Editar">${icono('editar')}</button></div>`;
  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>Usuarios</h1><p>Cada usuario pertenece a una sede y sólo ve esa sede. Los de la Central ven todo.</p></div>
      <div class="vista__acciones"><button class="btn btn--principal" type="button" data-nuevo>${icono('mas')} Usuario nuevo</button></div></div>
    ${sinSede.length ? html`<section class="pila"><h3>Sistema</h3><div class="lista">${sinSede.map(fila)}</div></section>` : ''}
    ${grupos.map(g => html`<section class="pila"><h3>${g.sede.nombre}</h3>${g.usuarios.length ? html`<div class="lista">${g.usuarios.map(fila)}</div>` : html`<p class="muted chico">Sin usuarios.</p>`}</section>`)}
  </div>`);
  const editar = async (u = {}) => {
    const r = await formModal({
      titulo: u.id ? `${u.nombre} ${u.apellido}` : 'Usuario nuevo', subtitulo: u.id ? '' : 'Entra con una contraseña temporal y la cambia la primera vez.',
      campos: html`<div class="fila-campos fila-campos--2">${campo('Nombre', html`<input class="input" name="nombre" value="${u.nombre || ''}" required>`)}${campo('Apellido', html`<input class="input" name="apellido" value="${u.apellido || ''}">`)}</div>
        ${campo('Email', html`<input class="input" name="email" type="email" value="${u.email || ''}" required>`)}
        ${campo('Rol', html`<select class="select" name="rol">${Object.entries(roles).map(([k, v]) => html`<option value="${k}" ${sel(k === (u.rol || 'carga'))}>${v.nombre}</option>`)}</select>`)}
        ${campo('Sede', html`<select class="select" name="sede_id"><option value="">—</option>${sedes.filter(s => !s.es_central).map(s => html`<option value="${s.id}" ${sel(s.id === u.sede_id)}>${s.nombre}</option>`)}</select>`, 'Para los roles de sede. Los de la Central y el superadmin no la usan.')}
        ${campo('Teléfono', html`<input class="input" name="telefono" value="${u.telefono || ''}">`)}
        ${u.id ? html`<label class="check"><input type="checkbox" name="activo" ${chk(u.activo !== 0)}>Activo</label>${campo('Motivo del cambio', html`<input class="input" name="motivo">`)}` : ''}`,
      enviar: (d) => (u.id ? put(`/api/admin/usuarios/${u.id}`, d) : post('/api/admin/usuarios', d))
    });
    if (!r) return;
    if (r.password_temporal) mostrarTemporal(r.password_temporal);
    else toast('Usuario guardado', 'ok');
    ctx.recargar();
  };
  const mostrarTemporal = (p) => modal({ titulo: 'Contraseña temporal', contenido: html`<div class="pila"><p>Pasásela al usuario por un medio seguro. Al entrar se le pide cambiarla.</p><p class="hash" style="font-size:1.2rem;text-align:center">${p}</p><div class="modal__acciones"><button class="btn btn--principal" data-cerrar type="button">Listo</button></div></div>` });
  ctx.el.querySelector('[data-nuevo]').addEventListener('click', () => editar());
  ctx.el.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => {
    const u = usuarios.find(x => x.id === Number(b.dataset.editar));
    editar(u);
    // Botón extra para blanquear la contraseña dentro del modal.
    const acciones = [...document.querySelectorAll('.modal')].pop()?.querySelector('.modal__acciones');
    if (acciones) {
      acciones.insertAdjacentHTML('afterbegin', `<button class="btn btn--fantasma" type="button" data-reset style="margin-right:auto">Blanquear contraseña</button>`);
      acciones.querySelector('[data-reset]').addEventListener('click', async (e) => conBoton(e.currentTarget, async () => {
        try { const { password_temporal } = await post(`/api/admin/usuarios/${u.id}/reset`); mostrarTemporal(password_temporal); } catch (ex) { error(ex); }
      }));
    }
  }));
}

// ── Rubros ──────────────────────────────────────────────────────────────────
export async function adminRubros(ctx) {
  const { rubros } = await get('/api/admin/rubros');
  const principales = rubros.filter(r => !r.padre_id);
  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>Rubros</h1><p>Rubro → subrubro. Los marcados como <b>fijos</b> (servicios) no necesitan solicitud aunque superen los topes.</p></div>
      <div class="vista__acciones"><button class="btn btn--principal" type="button" data-nuevo>${icono('mas')} Rubro nuevo</button></div></div>
    <div class="tabla-caja"><table class="tabla"><thead><tr><th>Rubro</th><th>Tipo</th><th></th></tr></thead><tbody>
      ${principales.map(p => html`<tr class="tabla__grupo"><td>${p.nombre}</td><td>${p.es_fijo ? chip('info', 'Fijo') : ''}${p.es_nd ? chip('pend', 'N/D') : ''}${p.activo ? '' : chip('neutro', 'Inactivo')}</td>
        <td class="num"><button class="btn btn--fantasma btn--chico" type="button" data-editar="${p.id}">${icono('editar')}</button></td></tr>
        ${rubros.filter(r => r.padre_id === p.id).map(r => html`<tr><td style="padding-left:28px">${r.nombre}</td><td>${r.fijo ? chip('info', r.es_fijo ? 'Fijo' : 'Fijo (heredado)') : ''}${r.activo ? '' : chip('neutro', 'Inactivo')}</td>
          <td class="num"><button class="btn btn--fantasma btn--chico" type="button" data-editar="${r.id}">${icono('editar')}</button></td></tr>`)}`)}
    </tbody></table></div>
  </div>`);
  const editar = async (r = {}) => {
    const ok = await formModal({
      titulo: r.id ? r.nombre : 'Rubro nuevo',
      campos: html`${campo('Nombre', html`<input class="input" name="nombre" value="${r.nombre || ''}" required>`)}
        ${r.es_nd ? '' : campo('Depende de', html`<select class="select" name="padre_id"><option value="">— Es un rubro principal —</option>${principales.filter(p => p.id !== r.id && !p.es_nd).map(p => html`<option value="${p.id}" ${sel(p.id === r.padre_id)}>${p.nombre}</option>`)}</select>`)}
        ${r.es_nd ? '' : html`<label class="check"><input type="checkbox" name="es_fijo" ${chk(r.es_fijo)}><span><b>Gasto fijo</b> (servicio recurrente: no necesita solicitud)</span></label>`}
        ${campo('Orden', html`<input class="input" name="orden" type="number" value="${r.orden ?? 0}">`)}
        ${r.es_nd ? '' : html`<label class="check"><input type="checkbox" name="activo" ${chk(r.activo !== 0)}>Activo</label>`}`,
      enviar: (d) => (r.id ? put(`/api/admin/rubros/${r.id}`, { ...d, activo: r.es_nd ? true : d.activo }) : post('/api/admin/rubros', d))
    });
    if (ok) { toast('Rubro guardado', 'ok'); await cat(true); ctx.recargar(); }
  };
  ctx.el.querySelector('[data-nuevo]').addEventListener('click', () => editar());
  ctx.el.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => editar(rubros.find(r => r.id === Number(b.dataset.editar)))));
}

// ── Parámetros, alícuotas y datos del Círculo ───────────────────────────────
export async function adminParametros(ctx) {
  const d = await get('/api/admin/parametros');
  const valor = (clave, v) => (d.definiciones[clave].unidad === 'pesos' ? pesos(v) : `${v} %`);
  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>Parámetros</h1><p>Los topes cambian con la inflación: cada valor nuevo rige desde una fecha y el anterior queda en la historia.</p></div></div>

    <section class="pila"><h2>Topes y umbrales</h2>
      <div class="cifras">${Object.entries(d.definiciones).map(([k, def]) => html`<div class="cifra"><span>${def.nombre}</span><strong>${valor(k, d.vigentes[k])}</strong>
        <small><button class="btn btn--fantasma btn--chico" type="button" data-param="${k}" style="padding:0;min-height:0">Cargar valor nuevo</button></small></div>`)}</div>
      <details><summary class="chico muted" style="cursor:pointer">Historia de valores</summary>
        <div class="tabla-caja" style="margin-top:8px"><table class="tabla"><thead><tr><th>Parámetro</th><th class="num">Valor</th><th>Rige desde</th><th>Nota</th><th>Cargó</th></tr></thead><tbody>
          ${d.parametros.map(p => html`<tr><td>${d.definiciones[p.clave].nombre}</td><td class="num">${valor(p.clave, p.valor)}</td><td>${fecha(p.vigente_desde)}</td><td>${p.nota || ''}</td><td>${p.creado_por_nombre || 'Inicial'}</td></tr>`)}
        </tbody></table></div></details>
    </section>

    <section class="pila"><div class="panel__cab" style="margin:0"><h2>Alícuotas de retención</h2><button class="btn btn--principal btn--chico" type="button" data-alic>${icono('mas')} Alícuota nueva</button></div>
      <div class="aviso">${icono('alerta')}<span><b>A validar con el contador.</b> El sistema calcula base × alícuota y nada más. No inventamos regímenes ni mínimos: los carga el Círculo.</span></div>
      ${d.alicuotas.length ? html`<div class="tabla-caja"><table class="tabla"><thead><tr><th>Impuesto</th><th>Régimen</th><th>Jurisdicción</th><th class="num">Alícuota</th><th>Rige desde</th><th></th></tr></thead><tbody>
        ${d.alicuotas.map(a => html`<tr ${a.activa ? '' : raw('style="opacity:.5"')}><td>${d.impuestos[a.impuesto]}</td><td>${a.regimen}${a.nota ? html`<br><small class="muted">${a.nota}</small>` : ''}</td><td>${a.jurisdiccion || '—'}</td>
          <td class="num">${alicuota(a.alicuota)}</td><td>${fecha(a.vigente_desde)}</td>
          <td><button class="btn btn--fantasma btn--chico" type="button" data-activa="${a.id}" data-v="${a.activa ? 0 : 1}">${a.activa ? 'Dar de baja' : 'Reactivar'}</button></td></tr>`)}
      </tbody></table></div>` : html`<p class="muted">Todavía no hay alícuotas cargadas: las retenciones no se pueden calcular.</p>`}
    </section>

    <section class="panel"><form class="form" id="circulo" novalidate>
      <h2>Datos del Círculo</h2>
      <p class="chico muted">Salen en los comprobantes de retención. El CUIT se usa para avisar cuando una factura viene a nombre de otro.</p>
      ${campo('Razón social', html`<input class="input" name="circulo_razon_social" value="${d.config.circulo_razon_social || ''}">`)}
      ${campo('CUIT', html`<input class="input" name="circulo_cuit" inputmode="numeric" value="${d.config.circulo_cuit ? fmtCuit(d.config.circulo_cuit) : ''}" placeholder="A confirmar">`)}
      ${campo('Domicilio', html`<input class="input" name="circulo_domicilio" value="${d.config.circulo_domicilio || ''}">`)}
      <button class="btn btn--principal" type="submit" style="align-self:flex-start">Guardar datos</button>
    </form></section>
  </div>`);

  ctx.el.querySelectorAll('[data-param]').forEach(b => b.addEventListener('click', async () => {
    const k = b.dataset.param; const def = d.definiciones[k];
    const ok = await formModal({
      titulo: def.nombre, subtitulo: `Vigente hoy: ${valor(k, d.vigentes[k])}`,
      campos: html`${campo('Valor nuevo', def.unidad === 'pesos' ? html`<div class="input-pref"><span>$</span><input class="input input--monto" name="valor" data-pesos inputmode="decimal" value="${pesosInput(d.vigentes[k])}" required></div>` : html`<input class="input" name="valor" type="number" min="0" max="100" value="${d.vigentes[k]}" required>`)}
        ${campo('Rige desde', html`<input class="input" type="date" name="vigente_desde" value="${hoyAR()}" required>`, 'Los gastos con fecha de pago anterior siguen usando el valor viejo.')}
        ${campo('Nota', html`<input class="input" name="nota" placeholder="Ej.: actualización por inflación, resolución N.º…">`)}`,
      enviar: (x) => post('/api/admin/parametros', { clave: k, valor: def.unidad === 'pesos' ? parsePesos(x.valor) : Number(x.valor), vigente_desde: x.vigente_desde, nota: x.nota })
    });
    if (ok) { toast('Valor cargado', 'ok'); await cat(true); ctx.recargar(); }
  }));
  ctx.el.querySelector('[data-alic]').addEventListener('click', async () => {
    const ok = await formModal({
      titulo: 'Alícuota nueva', subtitulo: 'Una alícuota cargada no se edita: si cambia, se da de baja y se carga otra con su fecha.',
      campos: html`${campo('Impuesto', html`<select class="select" name="impuesto">${Object.entries(d.impuestos).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select>`)}
        ${campo('Régimen', html`<input class="input" name="regimen" required placeholder="Nombre del régimen, como lo indique el contador">`)}
        ${campo('Jurisdicción', html`<input class="input" name="jurisdiccion" placeholder="Sólo para Ingresos Brutos">`)}
        ${campo('Alícuota (%)', html`<input class="input" name="alicuota" inputmode="decimal" required placeholder="Ej.: 2,5">`)}
        ${campo('Rige desde', html`<input class="input" type="date" name="vigente_desde" value="${hoyAR()}" required>`)}
        ${campo('Nota', html`<input class="input" name="nota">`)}`,
      enviar: (x) => post('/api/admin/alicuotas', { ...x, alicuota: Math.round(Number(String(x.alicuota).replace(',', '.')) * 1000) })
    });
    if (ok) { toast('Alícuota cargada', 'ok'); await cat(true); ctx.recargar(); }
  });
  ctx.el.querySelectorAll('[data-activa]').forEach(b => b.addEventListener('click', async () => {
    try { await put(`/api/admin/alicuotas/${b.dataset.activa}`, { activa: b.dataset.v === '1' }); await cat(true); ctx.recargar(); } catch (e) { error(e); }
  }));
  const fc = ctx.el.querySelector('#circulo');
  fc.addEventListener('submit', (e) => {
    e.preventDefault();
    conBoton(fc.querySelector('[type=submit]'), async () => {
      try { await put('/api/admin/config', datosForm(fc)); toast('Datos guardados', 'ok'); await cat(true); } catch (ex) { error(ex); }
    });
  });
}

// ── Permisos y funciones opcionales ─────────────────────────────────────────
export async function adminPermisos(ctx) {
  const m = await get('/api/admin/permisos');
  const c = await cat(true);
  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>Permisos</h1><p>Qué puede hacer cada rol. Los cambios rigen en el momento y quedan en la auditoría.</p></div></div>
    <div class="tabla-caja"><table class="tabla matriz"><thead><tr><th>Permiso</th>${m.roles.map(r => html`<th>${r.nombre}</th>`)}</tr></thead><tbody>
      ${m.permisos.map(p => html`<tr><td>${p.nombre}<br><small class="muted mono">${p.id}</small></td>
        ${m.roles.map(r => html`<td><input type="checkbox" aria-label="${r.nombre}: ${p.nombre}" data-rol="${r.id}" data-permiso="${p.id}" ${chk(r.permisos.includes(p.id))}></td>`)}</tr>`)}
    </tbody></table></div>
    <section class="panel pila"><h2>Funciones opcionales</h2>
      <label class="check"><input type="checkbox" data-flag="flag_adjuntos" ${chk(c.flags.adjuntos)}><span><b>Fotos de comprobantes y presupuestos</b><br><small class="muted">Opcionales al cargar. Se guardan en el servidor (o en MinIO si está configurado).</small></span></label>
      <label class="check"><input type="checkbox" data-flag="flag_cierre_anticipado" ${chk(c.flags.cierre_anticipado)}><span><b>Permitir cerrar la rendición antes de fin de mes</b><br><small class="muted">Útil para pruebas y demos. En operación normal, apagado.</small></span></label>
    </section>
  </div>`);
  ctx.el.querySelectorAll('[data-permiso]').forEach(ch => ch.addEventListener('change', async () => {
    try { await post('/api/admin/permisos', { rol: ch.dataset.rol, permiso: ch.dataset.permiso, habilitado: ch.checked }); toast('Permiso actualizado', 'ok'); } catch (e) { ch.checked = !ch.checked; error(e); }
  }));
  ctx.el.querySelectorAll('[data-flag]').forEach(ch => ch.addEventListener('change', async () => {
    try { await put('/api/admin/config', { [ch.dataset.flag]: ch.checked }); await cat(true); toast('Guardado', 'ok'); } catch (e) { ch.checked = !ch.checked; error(e); }
  }));
}
