import { get, html, pintar, icono, pesos, horas, fecha } from '../lib.js';
import { modalPago } from './cuenta.js';

export default async function cuentas(ctx) {
  const { cuentas: lista } = await get('/api/admin/cuentas');
  const conDeuda = lista.filter(c => c.saldo > 0);
  const totalDeuda = conDeuda.reduce((s, c) => s + c.saldo, 0);
  const aFacturar = lista.reduce((s, c) => s + c.a_facturar, 0);
  const filtro = ctx.query.ver || 'todos';

  pintar(ctx.el, html`
  <div class="vista">
    <div class="vista__cab"><div><h1>Cuentas</h1><p>Saldo de cada socio. Tocá una fila para ver sus movimientos.</p></div></div>
    <div class="cifras">
      <div class="cifra"><span>Deuda total</span><strong>${pesos(totalDeuda)}</strong><small>${conDeuda.length} ${conDeuda.length === 1 ? 'socio' : 'socios'} con saldo pendiente</small></div>
      <div class="cifra"><span>A facturar en el próximo cierre</span><strong>${pesos(aFacturar)}</strong></div>
    </div>
    <section class="panel">
      <div class="panel__cab">
        <div class="buscador" style="flex:1;min-width:220px">${icono('buscar')}<input class="input" type="search" id="buscar" placeholder="Buscar socio" aria-label="Buscar socio"></div>
        <div class="pestanas" role="tablist" style="border:0">
          <button type="button" role="tab" data-ver="todos" aria-selected="${filtro === 'todos'}">Todos</button>
          <button type="button" role="tab" data-ver="deudores" aria-selected="${filtro === 'deudores'}">Con deuda</button>
        </div>
      </div>
      <div class="tabla-caja"><table class="tabla">
        <thead><tr><th>Socio</th><th class="num">Saldo</th><th class="num">A facturar</th><th>Último pago</th><th></th></tr></thead>
        <tbody>${lista.filter(c => filtro === 'todos' || c.saldo > 0).map(c => html`
          <tr data-href="#/admin/cuentas/${c.id}" data-nombre="${`${c.nombre} ${c.apellido} ${c.email}`.toLowerCase()}">
            <td><strong>${c.apellido}, ${c.nombre}</strong>${c.activo ? '' : html` <span class="chip chip--neutro">Baja</span>`}<div class="muted chico">${c.rol === 'admin' ? 'Tesorería' : c.es_instructor ? 'Instructor' : 'Piloto'}</div></td>
            <td class="num"><span class="monto ${c.saldo < 0 ? 'monto--neg' : ''}">${pesos(c.saldo)}</span></td>
            <td class="num">${c.a_facturar ? html`${pesos(c.a_facturar)}<div class="muted chico">${horas(c.decimas_abiertas)}</div>` : html`<span class="muted">—</span>`}</td>
            <td>${c.ultimo_pago ? fecha(c.ultimo_pago) : html`<span class="muted">—</span>`}</td>
            <td><div class="tabla__acciones"><button class="btn btn--sec btn--chico" type="button" data-pago="${c.id}">${icono('pago')} Pago</button></div></td>
          </tr>`)}</tbody>
      </table></div>
    </section>
  </div>`);

  const filas = [...ctx.el.querySelectorAll('tbody tr')];
  ctx.el.querySelector('#buscar').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    filas.forEach(f => { f.hidden = q && !f.dataset.nombre.includes(q); });
  });
  ctx.el.addEventListener('click', (e) => {
    const ver = e.target.closest('[data-ver]');
    if (ver) return ctx.ir(`#/admin/cuentas?ver=${ver.dataset.ver}`);
    const pago = e.target.closest('[data-pago]');
    if (pago) {
      const c = lista.find(x => x.id === Number(pago.dataset.pago));
      return modalPago(c, c.saldo, ctx.recargar);
    }
    const fila = e.target.closest('tr[data-href]');
    if (fila) ctx.ir(fila.dataset.href);
  });
}
