import { avisoOk, avisoError } from "@/lib/aviso";
import { sql } from "@/lib/db";
import { requierePermiso } from "@/lib/auth";
import { plata, fecha, numero } from "@/lib/format";
import { Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

import { revalidatePath } from "next/cache";
import { Boton, Campo, PanelTitulo } from "@/components/ui";
import { avisar, telegramConfigurado } from "@/lib/telegram";
import { mandarResumen } from "@/lib/avisos";

export default async function Configuracion() {
  await requierePermiso("configuracion");
  const [e] = await sql`SELECT * FROM empresa WHERE id = 1`;
  const [cot] = await sql`SELECT * FROM cotizaciones ORDER BY fecha DESC LIMIT 1`;

  async function guardar(fd: FormData) {
    "use server";
    await requierePermiso("configuracion");
    await sql`
      INSERT INTO empresa (id, razon_social, cuit, domicilio, localidad, provincia, telefono, email)
      VALUES (1, ${String(fd.get("razon_social"))}, ${String(fd.get("cuit"))},
              ${String(fd.get("domicilio"))}, ${String(fd.get("localidad"))},
              ${String(fd.get("provincia"))}, ${String(fd.get("telefono"))}, ${String(fd.get("email"))})
      ON CONFLICT (id) DO UPDATE SET
        razon_social = EXCLUDED.razon_social, cuit = EXCLUDED.cuit,
        domicilio = EXCLUDED.domicilio, localidad = EXCLUDED.localidad,
        provincia = EXCLUDED.provincia, telefono = EXCLUDED.telefono, email = EXCLUDED.email`;
    revalidatePath("/configuracion");
    await avisoOk("Datos de la empresa guardados");
  }

  async function guardarCotizacion(fd: FormData) {
    "use server";
    await requierePermiso("configuracion");
    const v = Number(fd.get("valor") || 0);
    if (!v) return avisoError("Poné el valor del dólar.");
    await sql`INSERT INTO cotizaciones (fecha, valor) VALUES (current_date, ${v})
              ON CONFLICT (fecha) DO UPDATE SET valor = EXCLUDED.valor`;
    revalidatePath("/configuracion");
    await avisoOk("Cotización actualizada");
  }

  async function guardarTelegram(fd: FormData) {
    "use server";
    await requierePermiso("configuracion");
    const chat = String(fd.get("telegram_chat") || "").trim() || null;
    await sql`UPDATE empresa SET telegram_chat = ${chat} WHERE id = 1`;
    revalidatePath("/configuracion");
    await avisoOk(chat ? "Chat de Telegram guardado. Probalo con el mensaje de prueba." : "Chat de Telegram borrado");
  }

  async function probarTelegram() {
    "use server";
    const usr = await requierePermiso("configuracion");
    const ok = await avisar(`✅ Prueba de avisos del sistema de Garrahan. Mandada por ${usr.nombre}.`);
    if (ok) await avisoOk("Listo: el mensaje de prueba salió. Revisá el chat.");
    else await avisoError("No salió. Revisá que el bot esté en el chat y que el ID sea el correcto.");
  }

  async function resumenAhora() {
    "use server";
    await requierePermiso("configuracion");
    const ok = await mandarResumen();
    if (ok) await avisoOk("Resumen mandado");
    else await avisoError("No había nada para avisar hoy, o no se pudo mandar.");
  }

  const tokenOk = telegramConfigurado();
  const chatActual = e?.telegram_chat || process.env.TELEGRAM_CHAT_ID || "";

  return (
    <>
      <Encabezado titulo="Configuración" detalle="Los datos que salen impresos en los documentos." />
      <div className="grid lg:grid-cols-3 gap-4">
        <Panel className="lg:col-span-2">
          <PanelTitulo titulo="Datos de la empresa"
            detalle="La razón social y el CUIT se imprimen en cada boleto de compraventa. Se cargan una vez." />
          <form action={guardar} className="grid sm:grid-cols-2 gap-3">
            <Campo label="Razón social" ancho="sm:col-span-2">
              <input name="razon_social" className="campo" defaultValue={e?.razon_social || ""} />
            </Campo>
            <Campo label="CUIT"><input name="cuit" className="campo" defaultValue={e?.cuit || ""} /></Campo>
            <Campo label="Teléfono"><input name="telefono" className="campo" defaultValue={e?.telefono || ""} /></Campo>
            <Campo label="Domicilio" ancho="sm:col-span-2">
              <input name="domicilio" className="campo" defaultValue={e?.domicilio || ""} />
            </Campo>
            <Campo label="Localidad"><input name="localidad" className="campo" defaultValue={e?.localidad || ""} /></Campo>
            <Campo label="Provincia"><input name="provincia" className="campo" defaultValue={e?.provincia || ""} /></Campo>
            <Campo label="Email" ancho="sm:col-span-2">
              <input name="email" type="email" className="campo" defaultValue={e?.email || ""} />
            </Campo>
            <div className="sm:col-span-2"><Boton tipo="submit">Guardar</Boton></div>
          </form>
        </Panel>

        <Panel>
          <PanelTitulo titulo="Cotización del dólar"
            detalle="Se usa para convertir los movimientos en dólares." />
          <p className="text-[13px] mb-3">
            Última cargada: <b className="tabular">{cot ? plata(cot.valor) : "ninguna"}</b>
            {cot && <span className="text-[var(--c-tinta-tenue)]"> · {fecha(cot.fecha)}</span>}
          </p>
          <form action={guardarCotizacion} className="space-y-3">
            <Campo label="Valor de hoy">
              <input name="valor" type="number" step="0.01" className="campo"
                     defaultValue={cot?.valor || ""} />
            </Campo>
            <Boton tipo="submit" variante="suave">Actualizar</Boton>
          </form>
        </Panel>

        <Panel className="lg:col-span-3">
          <PanelTitulo titulo="Avisos por Telegram"
            detalle="Lead nuevo y cotización de usado, seña registrada, venta cerrada y cobros, en el momento. Cada mañana a las 9: señas por vencer, cuotas vencidas, autos con más de 60 días, postventa y leads sin contactar." />
          {!tokenOk ? (
            <p className="text-[13px] text-[var(--c-tinta-media)]">
              Falta conectar el bot: se configura una sola vez en el servidor (variable <code>TELEGRAM_BOT_TOKEN</code>).
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-6 items-start">
              <form action={guardarTelegram} className="space-y-3">
                <Campo label="Chat o grupo que recibe los avisos">
                  <input name="telegram_chat" className="campo" defaultValue={chatActual}
                    placeholder="-1001234567890" />
                </Campo>
                <p className="text-[11.5px] text-[var(--c-tinta-tenue)] leading-relaxed">
                  Lo ideal es un grupo con el equipo y el bot adentro. El ID de un grupo empieza con un guion.
                </p>
                <Boton tipo="submit">Guardar</Boton>
              </form>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <form action={probarTelegram}><Boton tipo="submit" variante="suave">Mandar un mensaje de prueba</Boton></form>
                  <form action={resumenAhora}><Boton tipo="submit" variante="suave">Mandar el resumen de hoy</Boton></form>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
