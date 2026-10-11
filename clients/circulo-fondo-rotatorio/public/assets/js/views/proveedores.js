// Base única de proveedores del Círculo: buscar y dar de alta (con CUIT validado y sin duplicados).

import { get, post, put, html, pintar, icono, modal, error, toast, conBoton, datosForm, fmtCuit, cuitValido, soloDigitos, vacio, sel, cat } from '../lib.js';

// Alta desde cualquier pantalla. Devuelve el proveedor (nuevo o el que ya existía con ese CUIT) o null.
export function altaProveedor(texto = '') {
  return new Promise(async (ok) => {
    const c = await cat();
    const digitos = soloDigitos(texto);
    const m = modal({
      titulo: 'Proveedor nuevo', subtitulo: 'Se carga una sola vez y lo usan todas las sedes.', alCerrar: (v) => ok(v || null),
      contenido: html`<form class="form" novalidate>
        <div class="campo"><label for="pn-cuit">CUIT</label>
          <input class="input" id="pn-cuit" name="cuit" inputmode="numeric" maxlength="13" placeholder="30-12345678-9" value="${digitos.length >= 8 ? digitos : ''}" required autofocus>
          <span class="campo__ayuda" id="pn-cuit-ayuda">Los 11 números, con o sin guiones.</span></div>
        <div class="campo"><label for="pn-razon">Razón social</label>
          <input class="input" id="pn-razon" name="razon_social" maxlength="120" value="${digitos.length >= 8 ? '' : texto}" required></div>
        <div class="campo"><label for="pn-iva">Condición frente al IVA</label>
          <select class="select" id="pn-iva" name="condicion_iva"><option value="">No sé</option>${Object.entries(c.condiciones_iva).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></div>
        <div id="pn-similares"></div>
        <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">Guardar proveedor</button></div>
      </form>`
    });
    const f = m.el.querySelector('form');
    const ayuda = m.el.querySelector('#pn-cuit-ayuda');
    f.cuit.addEventListener('input', () => {
      const d = soloDigitos(f.cuit.value);
      const valido = d.length === 11 && cuitValido(d);
      f.cuit.setAttribute('aria-invalid', d.length === 11 && !valido ? 'true' : 'false');
      ayuda.textContent = d.length < 11 ? `Van ${d.length} de 11 números` : valido ? `✓ ${fmtCuit(d)}` : 'El dígito verificador no da: revisá el CUIT.';
    });
    let confirmar = false;
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      conBoton(f.querySelector('[type=submit]'), async () => {
        try {
          const r = await post('/api/proveedores', { ...datosForm(f), confirmar_similar: confirmar });
          toast(r.existente ? `Ya estaba cargado: ${r.proveedor.razon_social}` : 'Proveedor dado de alta', 'ok');
          m.cerrar(r.proveedor);
        } catch (ex) {
          if (ex.codigo === 'SIMILARES') {
            confirmar = true;
            const caja = m.el.querySelector('#pn-similares');
            pintar(caja, html`<div class="aviso">${icono('alerta')}<div class="pila" style="gap:8px;width:100%"><strong>${ex.message}</strong>
              ${ex.datos.similares.map(p => html`<button class="btn btn--sec btn--chico" type="button" data-usar="${p.id}" style="justify-content:space-between;width:100%">${p.razon_social}<small>${fmtCuit(p.cuit)}</small></button>`)}
              <small>Si es otro proveedor, tocá "Guardar proveedor" de nuevo.</small></div></div>`);
            caja.querySelectorAll('[data-usar]').forEach(b => b.addEventListener('click', () => m.cerrar(ex.datos.similares.find(p => p.id === Number(b.dataset.usar)))));
          } else error(ex);
        }
      });
    });
  });
}

export default async function proveedores(ctx) {
  const { proveedores: lista } = await get('/api/proveedores?todos=1');
  const c = await cat();
  const puedeAlta = ctx.puede('proveedores.alta');

  pintar(ctx.el, html`<div class="vista">
    <div class="vista__cab"><div><h1>Proveedores</h1><p>Base única del Círculo, compartida por todas las sedes. ${lista.length} cargados.</p></div>
      ${puedeAlta ? html`<div class="vista__acciones"><button class="btn btn--principal" type="button" data-alta>${icono('mas')} Proveedor nuevo</button></div>` : ''}</div>
    <div class="filtros"><input class="input" type="search" id="filtro" placeholder="Buscar por CUIT o nombre" aria-label="Buscar proveedor"></div>
    <div class="lista" id="lista"></div>
  </div>`);

  const pintarLista = (q = '') => {
    const t = q.trim().toLowerCase();
    const d = soloDigitos(q);
    const filas = lista.filter(p => !t || p.razon_social.toLowerCase().includes(t) || (d && p.cuit.includes(d)));
    pintar(ctx.el.querySelector('#lista'), filas.length ? filas.map(p => html`
      <div class="item ${p.activo ? '' : 'item--anulado'}">
        <span class="item__icono">${icono('proveedor')}</span>
        <div class="item__texto"><strong>${p.razon_social}</strong><small>CUIT ${fmtCuit(p.cuit)}${p.condicion_iva ? ` · ${c.condiciones_iva[p.condicion_iva]}` : ''} · ${p.gastos} gasto${p.gastos === 1 ? '' : 's'}${p.creado_sede_nombre ? ` · alta: ${p.creado_sede_nombre}` : ''}</small></div>
        ${puedeAlta ? html`<button class="btn btn--fantasma btn--chico" type="button" data-editar="${p.id}" aria-label="Editar">${icono('editar')}</button>` : ''}
      </div>`) : vacio('No hay proveedores con ese dato.', 'buscar'));
    ctx.el.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => editar(lista.find(p => p.id === Number(b.dataset.editar)))));
  };
  ctx.el.querySelector('#filtro').addEventListener('input', (e) => pintarLista(e.target.value));
  ctx.el.querySelector('[data-alta]')?.addEventListener('click', async () => { if (await altaProveedor()) ctx.recargar(); });
  pintarLista();

  function editar(p) {
    const m = modal({
      titulo: p.razon_social, subtitulo: `CUIT ${fmtCuit(p.cuit)} (el CUIT no se cambia)`,
      contenido: html`<form class="form" novalidate>
        <div class="campo"><label>Razón social</label><input class="input" name="razon_social" value="${p.razon_social}" required></div>
        <div class="campo"><label>Condición frente al IVA</label><select class="select" name="condicion_iva"><option value="">No sé</option>${Object.entries(c.condiciones_iva).map(([k, v]) => html`<option value="${k}" ${sel(p.condicion_iva === k)}>${v}</option>`)}</select></div>
        <div class="campo"><label>Domicilio</label><input class="input" name="domicilio" value="${p.domicilio || ''}"></div>
        <div class="fila-campos fila-campos--2">
          <div class="campo"><label>Email</label><input class="input" name="email" type="email" value="${p.email || ''}"></div>
          <div class="campo"><label>Teléfono</label><input class="input" name="telefono" value="${p.telefono || ''}"></div>
        </div>
        <div class="campo"><label>CBU</label><input class="input" name="cbu" inputmode="numeric" maxlength="22" value="${p.cbu || ''}"></div>
        <label class="check"><input type="checkbox" name="activo" ${p.activo ? 'checked' : ''}>Activo (se puede elegir al cargar gastos)</label>
        <div class="campo"><label>Motivo del cambio</label><input class="input" name="motivo" placeholder="Queda en la auditoría"></div>
        <div class="modal__acciones"><button class="btn btn--sec" type="button" data-cerrar>Cancelar</button><button class="btn btn--principal" type="submit">Guardar</button></div>
      </form>`
    });
    const f = m.el.querySelector('form');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      conBoton(f.querySelector('[type=submit]'), async () => {
        try { await put(`/api/proveedores/${p.id}`, datosForm(f)); m.cerrar(); toast('Proveedor actualizado', 'ok'); ctx.recargar(); } catch (ex) { error(ex); }
      });
    });
  }
}
