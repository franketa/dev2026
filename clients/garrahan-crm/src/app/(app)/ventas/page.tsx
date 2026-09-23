import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { sql } from "@/lib/db";
import { requiereSesion, veCostos } from "@/lib/auth";
import { plata, plataCorta, fecha, numero, dominio, porcentaje } from "@/lib/format";
import { ESTADOS_VENTA, MEDIOS_PAGO, ESTADOS_TRAMITE } from "@/lib/constantes";
import { Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Boton } from "@/components/ui";
import Exportar from "@/components/exportar";

export const dynamic = "force-dynamic";

export default async function Ventas({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requiereSesion();
  const costos = veCostos(u);
  const p = await searchParams;
  const estado = p.estado || "";

  const where = estado ? sql`WHERE v.estado = ${estado}` : sql``;

  const [filas, resumen] = await Promise.all([
    sql`SELECT v.*, ve.dominio, ve.marca, ve.modelo, ve.anio,
               c.nombre AS cliente_nombre, c.apellido AS cliente_apellido,
               us.nombre AS vendedor, i.nombre AS inversor,
               (SELECT string_agg(DISTINCT medio, ',') FROM venta_pagos vp WHERE vp.venta_id = v.id) AS medios,
               (SELECT COALESCE(SUM(monto),0) FROM venta_pagos vp WHERE vp.venta_id = v.id) AS cobrado,
               (SELECT costo_total FROM v_vehiculos x WHERE x.id = v.vehiculo_id) AS costo
        FROM ventas v
        JOIN vehiculos ve ON ve.id = v.vehiculo_id
        LEFT JOIN clientes c ON c.id = v.cliente_id
        LEFT JOIN usuarios us ON us.id = v.vendedor_id
        LEFT JOIN inversores i ON i.id = v.inversor_id
        ${where}
        ORDER BY v.fecha DESC, v.id DESC LIMIT 200`,
    sql`SELECT
          count(*) FILTER (WHERE estado = 'completada')::int AS completadas,
          count(*) FILTER (WHERE estado IN ('reserva','en_proceso'))::int AS abiertas,
          COALESCE(SUM(precio - descuento) FILTER (WHERE estado = 'completada'
            AND fecha >= date_trunc('month', current_date)),0) AS mes,
          count(*) FILTER (WHERE estado = 'completada'
            AND fecha >= date_trunc('month', current_date))::int AS mes_n
        FROM ventas`,
  ]);

  const r = resumen[0] || {};

  return (
    <>
      <Encabezado titulo="Ventas" detalle="Operaciones, señas y documentación."
        acciones={<><Exportar que="ventas" /><Boton href="/ventas/nueva"><Plus size={15} /> Nueva venta</Boton></>} />

      <GrillaKPI>
        <KPI label="Ventas del mes" valor={numero(r.mes_n)} detalle={costos ? plataCorta(r.mes) : undefined} />
        <KPI label="Operaciones abiertas" valor={numero(r.abiertas)} tono="amarillo" detalle="reserva o en proceso" />
        <KPI label="Completadas" valor={numero(r.completadas)} tono="verde" detalle="histórico" />
        <KPI label="Importe del mes" valor={costos ? plataCorta(r.mes) : "—"} />
      </GrillaKPI>

      <div className="flex flex-wrap gap-1.5 mt-6 mb-3">
        <Link href="/ventas" className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium
          ${!estado ? "bg-[#1b2433] text-[#e8edf5]" : "text-[#9aa7b8] hover:bg-[#151d29]"}`}>Todas</Link>
        {Object.entries(ESTADOS_VENTA).map(([k, x]) => (
          <Link key={k} href={`/ventas?estado=${k}`} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium
            ${estado === k ? "bg-[#1b2433] text-[#e8edf5]" : "text-[#9aa7b8] hover:bg-[#151d29]"}`}>{x.label}</Link>
        ))}
      </div>

      <Tabla>
        <thead>
          <tr>
            <TH>#</TH><TH>Vehículo</TH><TH>Cliente</TH><TH>Vendedor</TH>
            <TH>Estado</TH><TH alinear="right">Precio</TH>
            {costos && <TH alinear="right">Margen</TH>}
            <TH>Forma de pago</TH><TH>Trámite</TH><TH>Fecha</TH><TH></TH>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && <FilaVacia cols={costos ? 11 : 10} mensaje="Todavía no hay ventas registradas." />}
          {filas.map((v: any) => {
            const e = ESTADOS_VENTA[v.estado] || { label: v.estado, tono: "gris" as const };
            const final = Number(v.precio) - Number(v.descuento);
            const margen = final - Number(v.costo || 0);
            const medios = (v.medios || "").split(",").filter(Boolean)
              .map((m: string) => MEDIOS_PAGO[m] || m).join(" + ");
            return (
              <tr key={v.id} className="hover:bg-[#151d29]">
                <TD><Link href={`/ventas/${v.id}`} className="text-[#60a5fa] hover:underline">#{v.id}</Link></TD>
                <TD>
                  <Link href={`/vehiculos/${v.vehiculo_id}`} className="hover:text-[#2f6bff]">
                    <div className="font-medium">{v.marca} {v.modelo} {v.anio}</div>
                    <div className="text-[11.5px] text-[#64748b]">{dominio(v.dominio)}</div>
                  </Link>
                </TD>
                <TD>{[v.cliente_apellido, v.cliente_nombre].filter(Boolean).join(", ") || "—"}</TD>
                <TD className="text-[#9aa7b8]">{v.vendedor || "—"}</TD>
                <TD><Chip tono={e.tono}>{e.label}</Chip></TD>
                <TD alinear="right" className="font-medium">{plata(final)}</TD>
                {costos && (
                  <TD alinear="right">
                    <span className={margen >= 0 ? "text-[#22c55e]" : "text-[#f87171]"}>{plata(margen)}</span>
                  </TD>
                )}
                <TD className="text-[#9aa7b8] text-[12.5px]">{medios || "—"}</TD>
                <TD className="text-[#9aa7b8] text-[12.5px]">{ESTADOS_TRAMITE[v.estado_tramite] || "—"}</TD>
                <TD className="text-[#9aa7b8]">{fecha(v.fecha)}</TD>
                <TD alinear="right">
                  <Link href={`/documentos/boleto/${v.id}`} target="_blank"
                    className="inline-flex items-center gap-1.5 text-[12px] text-[#9aa7b8] hover:text-[#2f6bff]">
                    <FileText size={13} /> Boleto
                  </Link>
                </TD>
              </tr>
            );
          })}
        </tbody>
      </Tabla>
    </>
  );
}
