import { get, html, pintar, icono, pesos, fecha, fechaHora, error, conBoton } from '../lib.js';

const ACCIONES = {
  'usuario.alta': 'Alta de socio', 'usuario.edicion': 'Edición de socio', 'usuario.reset_password': 'Contraseña regenerada', 'usuario.password': 'Cambio de contraseña',
  'usuario.perfil': 'Actualizó su perfil', 'avion.alta': 'Alta de avión', 'avion.edicion': 'Edición de avión', 'tarifa.alta': 'Nueva tarifa',
  'pago.alta': 'Pago registrado', 'ajuste.alta': 'Ajuste manual', 'saldo_inicial.alta': 'Saldo inicial',
  'movimiento.anulacion': 'Movimiento anulado', 'movimiento.edicion': 'Movimiento corregido', 'movimiento.borrado': 'Movimiento borrado', 'cierre.manual': 'Cierre manual', 'cierre.automatico': 'Cierre automático', 'config.edicion': 'Configuración', 'respaldo.descarga': 'Copia de seguridad'
};

export default async function registro(ctx) {
  const pestana = ctx.query.ver === 'auditoria' ? 'auditoria' : 'libro';
  const datos = pestana === 'libro' ? await get('/api/admin/libro') : await get('/api/admin/auditoria');

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab"><div><h1>Registro</h1><p>Todo lo que pasa en el sistema queda acá: quién lo hizo, cuándo y por qué.</p></div></div>

    <section class="panel">
      <div class="panel__cab"><div><h2>Integridad del libro</h2><p>Cada movimiento de plata está encadenado con el anterior. Las correcciones hechas desde el sistema quedan en "Acciones de usuarios"; si alguien modificara la base por fuera, la verificación lo detecta.</p></div>
        <div class="vista__acciones"><button class="btn btn--sec" type="button" data-verificar>${icono('cadena')} Verificar ahora</button>
        <a class="btn btn--fantasma" href="/api/admin/respaldo">${icono('descargar')} Copia de seguridad</a></div></div>
      <div id="verificacion"></div>
    </section>

    <div class="pestanas" role="tablist">
      <button type="button" role="tab" data-ver="libro" aria-selected="${pestana === 'libro'}">Libro de movimientos</button>
      <button type="button" role="tab" data-ver="auditoria" aria-selected="${pestana === 'auditoria'}">Acciones de usuarios</button>
    </div>

    <section class="panel" id="lista">
      ${pestana === 'libro' ? filasLibro(datos.movimientos) : filasAuditoria(datos.eventos)}
    </section>
    <button class="btn btn--sec" type="button" data-mas ${(pestana === 'libro' ? datos.movimientos : datos.eventos).length < 100 ? html`hidden` : ''}>Ver más antiguos</button>
  </div>`);

  let ultimo = (pestana === 'libro' ? datos.movimientos : datos.eventos).at(-1)?.id;

  ctx.el.addEventListener('click', async (e) => {
    const ver = e.target.closest('[data-ver]');
    if (ver) return ctx.ir(`#/admin/registro?ver=${ver.dataset.ver}`);
    const vb = e.target.closest('[data-verificar]');
    if (vb) {
      await conBoton(vb, async () => {
        try {
          const r = await get('/api/admin/integridad');
          pintar(ctx.el.querySelector('#verificacion'), r.ok
            ? html`<p class="aviso aviso--ok">${icono('check')}<span><b>Libro íntegro.</b> Se verificaron ${r.movimientos} movimientos. Último sello: <span class="hash">${r.ultimo_hash?.slice(0, 32) || '—'}</span></span></p>`
            : html`<p class="aviso aviso--mal">${icono('alerta')}<span><b>Se detectó una alteración.</b> ${r.error} Avisá a soporte técnico y no hagas más cambios hasta revisarlo.</span></p>`);
        } catch (err) { error(err); }
      });
    }
    const mas = e.target.closest('[data-mas]');
    if (mas && ultimo) {
      await conBoton(mas, async () => {
        const r = pestana === 'libro' ? await get(`/api/admin/libro?antes=${ultimo}`) : await get(`/api/admin/auditoria?antes=${ultimo}`);
        const items = pestana === 'libro' ? r.movimientos : r.eventos;
        const cont = ctx.el.querySelector('#lista tbody');
        cont.insertAdjacentHTML('beforeend', String(pestana === 'libro' ? filasLibro(items, true) : filasAuditoria(items, true)));
        ultimo = items.at(-1)?.id;
        mas.hidden = items.length < 100;
      });
    }
  });
}

function filasLibro(movs, soloFilas = false) {
  const filas = movs.map(m => html`<tr>
    <td class="num">#${m.id}</td>
    <td>${fecha(m.fecha)}<div class="muted chico">${fechaHora(m.creado_en)}</div></td>
    <td><strong>${m.socio}</strong><div class="chico">${m.concepto}</div></td>
    <td class="num monto ${m.importe < 0 ? 'monto--neg' : ''}">${pesos(m.importe, { signo: true })}</td>
    <td class="chico">${m.autor || 'Sistema'}</td>
    <td><span class="hash" title="${m.hash}">${m.hash.slice(0, 12)}</span></td></tr>`);
  if (soloFilas) return html`${filas}`;
  if (!movs.length) return html`<p class="muted">Todavía no hay movimientos.</p>`;
  return html`<div class="tabla-caja"><table class="tabla"><thead><tr><th class="num">N.º</th><th>Fecha</th><th>Movimiento</th><th class="num">Importe</th><th>Cargado por</th><th>Sello</th></tr></thead><tbody>${filas}</tbody></table></div>`;
}

function filasAuditoria(eventos, soloFilas = false) {
  const filas = eventos.map(ev => html`<tr>
    <td>${fechaHora(ev.creado_en)}</td>
    <td><strong>${ACCIONES[ev.accion] || ev.accion}</strong><div class="chico" style="word-break:break-word">${ev.detalle || ''}</div></td>
    <td class="chico">${ev.usuario || 'Sistema'}</td></tr>`);
  if (soloFilas) return html`${filas}`;
  if (!eventos.length) return html`<p class="muted">Todavía no hay acciones registradas.</p>`;
  return html`<div class="tabla-caja"><table class="tabla"><thead><tr><th>Cuándo</th><th>Qué</th><th>Quién</th></tr></thead><tbody>${filas}</tbody></table></div>`;
}
