import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { plata, fecha, numero } from "@/lib/format";
import { Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";


export default async function Sucursales() {
  await requiereSesion();
  const filas = await sql`
    SELECT s.*,
      (SELECT count(*) FROM vehiculos v WHERE v.sucursal_id = s.id
        AND v.estado NOT IN ('vendido','baja'))::int AS unidades,
      (SELECT COALESCE(SUM(x.costo_total),0) FROM v_vehiculos x WHERE x.sucursal_id = s.id
        AND x.estado NOT IN ('vendido','baja')) AS capital
    FROM sucursales s ORDER BY s.nombre`;

  return (
    <>
      <Encabezado titulo="Sucursales" detalle="Los predios de la agencia y qué hay en cada uno." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filas.length === 0 && (
          <Panel className="sm:col-span-2 lg:col-span-3">
            <p className="text-[13px] text-[#64748b] py-6 text-center">No hay sucursales cargadas.</p>
          </Panel>
        )}
        {filas.map((s: any) => (
          <Panel key={s.id}>
            <h3 className="text-[14.5px] font-semibold">{s.nombre}</h3>
            {s.direccion && <p className="text-[12px] text-[#64748b] mt-0.5">{s.direccion}</p>}
            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="etiqueta">Unidades</div>
                <div className="text-[22px] font-semibold tabular mt-1">{s.unidades}</div>
              </div>
              <div className="text-right">
                <div className="etiqueta">Capital</div>
                <div className="text-[15px] font-semibold tabular mt-1 text-[#9aa7b8]">{plata(s.capital)}</div>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
