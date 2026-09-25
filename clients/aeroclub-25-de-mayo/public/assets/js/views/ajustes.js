import { get, put, html, raw, pintar, icono, toast, error, conBoton, datosForm } from '../lib.js';

export default async function ajustes(ctx) {
  const { config: c } = await get('/api/admin/config');
  const horasOpc = Array.from({ length: 24 }, (_, h) => h);

  pintar(ctx.el, html`
  <div class="vista" style="max-width:760px">
    <div class="vista__cab"><div><h1>Configuración</h1><p>Datos que aparecen en los cupones y reglas del cierre mensual.</p></div></div>
    <form class="pila" id="form-config" novalidate>
      <section class="panel form">
        <div class="panel__cab" style="margin:0"><h2>Datos para pagar</h2><p>Se imprimen en cada cupón.</p></div>
        <div class="fila-campos">
          <div class="campo"><label for="c-alias">Alias</label><input class="input" id="c-alias" name="pago_alias" value="${c.pago_alias}" placeholder="aeroclub.25demayo"></div>
          <div class="campo"><label for="c-cbu">CBU o CVU</label><input class="input" id="c-cbu" name="pago_cbu" inputmode="numeric" value="${c.pago_cbu}" placeholder="22 dígitos"></div>
        </div>
        <div class="fila-campos">
          <div class="campo"><label for="c-tit">Titular de la cuenta</label><input class="input" id="c-tit" name="pago_titular" value="${c.pago_titular}"></div>
          <div class="campo"><label for="c-cuit">CUIT</label><input class="input" id="c-cuit" name="pago_cuit" value="${c.pago_cuit}" placeholder="30-00000000-0"></div>
        </div>
        <div class="campo"><label for="c-banco">Banco</label><input class="input" id="c-banco" name="pago_banco" value="${c.pago_banco}"></div>
        <div class="campo"><label for="c-inst">Instrucciones</label><textarea class="textarea" id="c-inst" name="pago_instrucciones" maxlength="600">${c.pago_instrucciones}</textarea></div>
      </section>

      <section class="panel form">
        <div class="panel__cab" style="margin:0"><h2>Cierre del mes</h2><p>El mes se cierra por calendario: del 1 al último día.</p></div>
        <label class="check"><input type="checkbox" name="cierre_automatico" ${c.cierre_automatico === '1' ? raw('checked') : ''}><span>Cerrar automáticamente<br><small class="muted">Si está apagado, tesorería cierra cada mes a mano desde Cierres y cupones.</small></span></label>
        <div class="fila-campos">
          <div class="campo"><label for="c-dia">Se ejecuta el día</label><input class="input" id="c-dia" name="cierre_dia" type="number" min="1" max="28" value="${c.cierre_dia}"><p class="campo__ayuda">Del mes siguiente. Dejar un día de margen ayuda a los que cargan tarde.</p></div>
          <div class="campo"><label for="c-hora">A las</label><select class="select" id="c-hora" name="cierre_hora">${horasOpc.map(h => html`<option value="${h}" ${String(h) === c.cierre_hora ? raw('selected') : ''}>${String(h).padStart(2, '0')}:00</option>`)}</select></div>
          <div class="campo"><label for="c-venc">Vencimiento del cupón</label><input class="input" id="c-venc" name="vencimiento_dia" type="number" min="1" max="28" value="${c.vencimiento_dia}"><p class="campo__ayuda">Día del mes siguiente al cierre.</p></div>
        </div>
      </section>

      <section class="panel form">
        <div class="panel__cab" style="margin:0"><h2>Mensaje de WhatsApp</h2><p>Lo que se escribe solo al tocar "WhatsApp" en un cupón. Podés editarlo antes de mandarlo.</p></div>
        <div class="campo"><label for="c-wa">Mensaje</label><textarea class="textarea" id="c-wa" name="whatsapp_mensaje" rows="5" maxlength="600">${c.whatsapp_mensaje}</textarea>
          <p class="campo__ayuda">Se reemplazan: {nombre}, {periodo}, {club}, {horas}, {total}, {alias}, {vencimiento} y {link}.</p></div>
        <div class="campo"><label for="c-url">Dirección del sistema</label><input class="input" id="c-url" name="url_publica" value="${c.url_publica}" placeholder="https://vuelos.aeroclub25demayo.com.ar"><p class="campo__ayuda">Para armar los links de los cupones. Si queda vacía, se usa la dirección actual.</p></div>
      </section>

      <section class="panel form">
        <div class="panel__cab" style="margin:0"><h2>Club</h2></div>
        <div class="fila-campos">
          <div class="campo"><label for="c-club">Nombre</label><input class="input" id="c-club" name="club_nombre" value="${c.club_nombre}"></div>
          <div class="campo"><label for="c-loc">Localidad</label><input class="input" id="c-loc" name="club_localidad" value="${c.club_localidad}"></div>
        </div>
      </section>

      <div><button class="btn btn--principal btn--grande" type="submit">${icono('check')} Guardar configuración</button></div>
    </form>
  </div>`);

  const form = ctx.el.querySelector('#form-config');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = datosForm(form);
    d.cierre_automatico = d.cierre_automatico ? '1' : '0';
    conBoton(form.querySelector('[type=submit]'), async () => {
      try { await put('/api/admin/config', d); toast('Configuración guardada', 'ok'); } catch (err) { error(err); }
    });
  });
}
