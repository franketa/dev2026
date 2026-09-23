import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { plata, fecha, numero } from "@/lib/format";
import { Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";


export default async function Catalogo() {
  await requiereSesion();
  const marcas = await sql`
    SELECT m.id, m.nombre,
      (SELECT count(*) FROM catalogo_modelos mo WHERE mo.marca_id = m.id)::int AS modelos,
      (SELECT count(*) FROM vehiculos v WHERE lower(v.marca) = lower(m.nombre))::int AS unidades
    FROM catalogo_marcas m ORDER BY m.nombre`;

  return (
    <>
      <Encabezado titulo="Catálogo de vehículos"
        detalle="Marcas y modelos normalizados, para que no se escriban de diez formas distintas." />
      <Tabla>
        <thead><tr><TH>Marca</TH><TH alinear="right">Modelos</TH><TH alinear="right">Unidades cargadas</TH></tr></thead>
        <tbody>
          {marcas.length === 0 && <FilaVacia cols={3} mensaje="El catálogo está vacío." />}
          {marcas.map((m: any) => (
            <tr key={m.id} className="hover:bg-[#151d29]">
              <TD className="font-medium">{m.nombre}</TD>
              <TD alinear="right" className="text-[#9aa7b8]">{m.modelos}</TD>
              <TD alinear="right">{m.unidades || "\u2014"}</TD>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
