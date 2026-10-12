import { get, put, html, raw, pintar, icono, toast, error, conBoton, datosForm } from '../lib.js';

// Imagen del QR para pagar → data URL (máximo 1 MB, como pide el servidor).
function leerQr(archivo) {
  return new Promise((ok, mal) => {
    if (!/^image\/(png|jpeg)$/.test(archivo.type)) return mal(new Error('Elegí una imagen PNG o JPG'));
    if (archivo.size > 1024 * 1024) return mal(new Error('La imagen es muy pesada (máximo 1 MB)'));
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => mal(new Error('No se pudo leer la imagen'));
    r.readAsDataURL(archivo);
  });
}

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
        <div class="campo">
          <span class="campo__label">QR para pagar <span class="muted">(opcional)</span></span>
          <div class="pagar__qr" data-qr-vista style="justify-items:start">${c.pago_qr ? html`<img src="${c.pago_qr}" alt="QR cargado">` : html`<span class="muted chico">Sin QR cargado.</span>`}</div>
          <div class="tabla__acciones" data-escritura>
            <label class="btn btn--sec btn--chico"><input type="file" accept="image/png,image/jpeg" class="sr" data-qr-archivo>${icono('foto')} ${c.pago_qr ? 'Cambiar QR' : 'Subir QR'}</label>
            ${c.pago_qr ? html`<button class="btn btn--fantasma btn--chico" type="button" data-qr-quitar style="color:var(--peligro)">${icono('x')} Quitar</button>` : ''}
          </div>
          <p class="campo__ayuda">El de Mercado Pago o el del banco. Los socios lo ven junto a los datos para transferir.</p>
        </div>
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
        <div class="campo"><label for="c-mail">Email de tesorería</label><input class="input" id="c-mail" name="email_tesoreria" type="email" value="${c.email_tesoreria || ''}" placeholder="tesoreria@aeroclub25demayo.com.ar">
          <p class="campo__ayuda">A donde llegan los pedidos de cambio de datos de los pilotos. Si queda vacío, se usa el email del primer usuario de tesorería.</p></div>
      </section>

      <div data-escritura><button class="btn btn--principal btn--grande" type="submit">${icono('check')} Guardar configuración</button></div>
    </form>
  </div>`);

  const form = ctx.el.querySelector('#form-config');
  // undefined: no se tocó el QR; '' lo saca; un data URL lo reemplaza.
  let qr;
  const $vista = ctx.el.querySelector('[data-qr-vista]');
  ctx.el.querySelector('[data-qr-archivo]').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    try {
      qr = await leerQr(archivo);
      pintar($vista, html`<img src="${qr}" alt="QR nuevo"><small>Se guarda con "Guardar configuración"</small>`);
    } catch (err) { e.target.value = ''; error(err); }
  });
  ctx.el.querySelector('[data-qr-quitar]')?.addEventListener('click', () => {
    qr = '';
    pintar($vista, html`<span class="muted chico">El QR se quita con "Guardar configuración".</span>`);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = datosForm(form);
    if (qr !== undefined) d.pago_qr = qr;
    d.cierre_automatico = d.cierre_automatico ? '1' : '0';
    conBoton(form.querySelector('[type=submit]'), async () => {
      try { await put('/api/admin/config', d); toast('Configuración guardada', 'ok'); } catch (err) { error(err); }
    });
  });
}
