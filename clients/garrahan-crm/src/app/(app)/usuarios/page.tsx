import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { plata, fecha, numero } from "@/lib/format";
import { Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

import { ROLES } from "@/lib/auth";

export default async function Usuarios() {
  await requiereSesion();
  const filas = await sql`
    SELECT u.*, s.nombre AS sucursal,
      (SELECT count(*) FROM ventas v WHERE v.vendedor_id = u.id AND v.estado='completada')::int AS ventas
    FROM usuarios u LEFT JOIN sucursales s ON s.id = u.sucursal_id
    ORDER BY u.activo DESC, u.nombre`;

  return (
    <>
      <Encabezado titulo="Usuarios" detalle="Quién entra al sistema y qué puede ver." />
      <Panel className="mb-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ROLES.map((r) => (
            <div key={r.valor} className="rounded-lg border border-[#1f2937] bg-[#0f1520] px-3.5 py-3">
              <div className="text-[13px] font-semibold">{r.label}</div>
              <div className="text-[11.5px] text-[#64748b] mt-1 leading-relaxed">{r.detalle}</div>
            </div>
          ))}
        </div>
      </Panel>
      <Tabla>
        <thead><tr>
          <TH>Nombre</TH><TH>Email</TH><TH>Rol</TH><TH>Sucursal</TH>
          <TH alinear="right">Ventas</TH><TH alinear="right">Meta</TH><TH>Estado</TH>
        </tr></thead>
        <tbody>
          {filas.map((u: any) => (
            <tr key={u.id} className="hover:bg-[#151d29]">
              <TD className="font-medium">{u.nombre}</TD>
              <TD className="text-[#9aa7b8]">{u.email}</TD>
              <TD><Chip tono={u.rol === "dueno" ? "violeta" : u.rol === "vendedor" ? "azul" : "gris"}>
                {ROLES.find((r) => r.valor === u.rol)?.label || u.rol}</Chip></TD>
              <TD className="text-[#9aa7b8]">{u.sucursal || "\u2014"}</TD>
              <TD alinear="right">{u.ventas || "\u2014"}</TD>
              <TD alinear="right" className="text-[#9aa7b8]">{u.meta_unidades || "\u2014"}</TD>
              <TD><Chip tono={u.activo ? "verde" : "gris"}>{u.activo ? "Activo" : "Inactivo"}</Chip></TD>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
