import Link from "next/link";
import { Plus } from "lucide-react";
import { sql } from "@/lib/db";
import { requiereSesion, veCostos } from "@/lib/auth";
import { plata, fecha, numero, dominio } from "@/lib/format";
import { ESTADOS_TALLER } from "@/lib/constantes";
import { Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Boton, Progreso } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Taller({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requiereSesion();
  const costos = veCostos(u);
  const p = await searchParams;
  const estado = p.estado || "";

  const where = estado ? sql`WHERE o.estado = ${estado}` : sql`WHERE o.estado <> 'completado'`;

  const [ordenes, resumen] = await Promise.all([
    sql`SELECT o.*, v.dominio, v.marca, v.modelo, v.anio, s.nombre AS sucursal,
               (SELECT count(*) FROM orden_items i WHERE i.orden_id = o.id)::int AS total,
               (SELECT count(*) FROM orden_items i WHERE i.orden_id = o.id AND i.hecho)::int AS hechos,
               (SELECT tarea FROM orden_items i WHERE i.orden_id = o.id AND NOT i.hecho
                ORDER BY i.posicion LIMIT 1) AS proxima,
               (SELECT COALESCE(SUM(costo),0) FROM orden_items i WHERE i.orden_id = o.id) AS costo,
               (current_date - o.fecha_ingreso) AS dias
        FROM ordenes_taller o
        JOIN vehiculos v ON v.id = o.vehiculo_id
        LEFT JOIN sucursales s ON s.id = v.sucursal_id
        ${where}
        ORDER BY o.fecha_ingreso ASC`,
    sql`SELECT
          count(*) FILTER (WHERE estado = 'en_revision')::int  AS en_revision,
          count(*) FILTER (WHERE estado = 'en_taller')::int    AS en_taller,
          count(*) FILTER (WHERE estado = 'en_detailing')::int AS en_detailing,
          count(*) FILTER (WHERE estado = 'completado')::int   AS completado
        FROM ordenes_taller`,
  ]);

  const r = resumen[0] || {};

  return (
    <>
      <Encabezado titulo="Taller" detalle="Preparación de las unidades antes de salir a la venta."
        acciones={<Boton href="/taller/nueva"><Plus size={15} /> Nueva orden</Boton>} />

      <GrillaKPI>
        <KPI label="En revisión" valor={numero(r.en_revision)} tono="violeta" href="/taller?estado=en_revision" />
        <KPI label="En taller" valor={numero(r.en_taller)} tono="naranja" href="/taller?estado=en_taller" />
        <KPI label="En detailing" valor={numero(r.en_detailing)} tono="celeste" href="/taller?estado=en_detailing" />
        <KPI label="Completadas" valor={numero(r.completado)} tono="verde" href="/taller?estado=completado" />
      </GrillaKPI>

      <div className="flex flex-wrap gap-1.5 mt-6 mb-3">
        <Link href="/taller" className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium
          ${!estado ? "bg-[#1b2433] text-[#e8edf5]" : "text-[#9aa7b8] hover:bg-[#151d29]"}`}>En curso</Link>
        {Object.entries(ESTADOS_TALLER).map(([k, x]) => (
          <Link key={k} href={`/taller?estado=${k}`} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium
            ${estado === k ? "bg-[#1b2433] text-[#e8edf5]" : "text-[#9aa7b8] hover:bg-[#151d29]"}`}>{x.label}</Link>
        ))}
      </div>

      <Tabla>
        <thead>
          <tr>
            <TH>Vehículo</TH><TH>Estado</TH><TH>Progreso</TH>
            {costos && <TH alinear="right">Costo</TH>}
            <TH alinear="center">Días</TH><TH>Ubicación</TH><TH>Ingreso</TH><TH></TH>
          </tr>
        </thead>
        <tbody>
          {ordenes.length === 0 && (
            <FilaVacia cols={costos ? 8 : 7}
              mensaje="No hay unidades en preparación. Mandá una desde la ficha del vehículo." />
          )}
          {ordenes.map((o: any) => {
            const e = ESTADOS_TALLER[o.estado] || { label: o.estado, tono: "gris" as const };
            return (
              <tr key={o.id} className="hover:bg-[#151d29]">
                <TD>
                  <Link href={`/taller/${o.id}`} className="hover:text-[#2f6bff]">
                    <div className="font-medium">{o.marca} {o.modelo} {o.anio}</div>
                    <div className="text-[11.5px] text-[#64748b]">{dominio(o.dominio)}</div>
                  </Link>
                </TD>
                <TD><Chip tono={e.tono}>{e.label}</Chip></TD>
                <TD>
                  <Progreso hechos={o.hechos} total={o.total}
                    etiqueta={o.proxima ? `Próx: ${o.proxima}` : "Todo listo"} />
                </TD>
                {costos && <TD alinear="right">{Number(o.costo) > 0 ? plata(o.costo) : "—"}</TD>}
                <TD alinear="center">
                  <span className={Number(o.dias) > 15 ? "text-[#f87171] tabular" : "text-[#9aa7b8] tabular"}>
                    {o.dias}d
                  </span>
                </TD>
                <TD className="text-[#9aa7b8]">{o.sucursal || "—"}</TD>
                <TD className="text-[#9aa7b8]">{fecha(o.fecha_ingreso)}</TD>
                <TD alinear="right">
                  <Link href={`/taller/${o.id}`} className="text-[12.5px] text-[#2f6bff] hover:underline">Ver →</Link>
                </TD>
              </tr>
            );
          })}
        </tbody>
      </Tabla>
    </>
  );
}
