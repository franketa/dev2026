import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { plata, fecha, numero } from "@/lib/format";
import { Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

import { revalidatePath } from "next/cache";
import { Boton, Campo, PanelTitulo } from "@/components/ui";

export default async function Configuracion() {
  await requiereSesion();
  const [e] = await sql`SELECT * FROM empresa WHERE id = 1`;
  const [cot] = await sql`SELECT * FROM cotizaciones ORDER BY fecha DESC LIMIT 1`;

  async function guardar(fd: FormData) {
    "use server";
    await requiereSesion();
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
  }

  async function guardarCotizacion(fd: FormData) {
    "use server";
    await requiereSesion();
    const v = Number(fd.get("valor") || 0);
    if (!v) return;
    await sql`INSERT INTO cotizaciones (fecha, valor) VALUES (current_date, ${v})
              ON CONFLICT (fecha) DO UPDATE SET valor = EXCLUDED.valor`;
    revalidatePath("/configuracion");
  }

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
      </div>
    </>
  );
}
