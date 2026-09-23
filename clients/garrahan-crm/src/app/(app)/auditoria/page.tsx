import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { plata, fecha, numero } from "@/lib/format";
import { Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";


export default async function Auditoria() {
  await requiereSesion();
  const filas = await sql`
    SELECT a.*, u.nombre AS usuario FROM auditoria a
    LEFT JOIN usuarios u ON u.id = a.usuario_id
    ORDER BY a.fecha DESC LIMIT 200`;

  return (
    <>
      <Encabezado titulo="Auditoría" detalle="Quién cambió qué y cuándo." />
      <Tabla>
        <thead><tr><TH>Fecha</TH><TH>Usuario</TH><TH>Entidad</TH><TH>Acción</TH><TH>Detalle</TH></tr></thead>
        <tbody>
          {filas.length === 0 && <FilaVacia cols={5} mensaje="Todavía no hay movimientos registrados." />}
          {filas.map((a: any) => (
            <tr key={a.id} className="hover:bg-[#151d29]">
              <TD className="text-[#9aa7b8]">
                {new Date(a.fecha).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
              </TD>
              <TD className="font-medium">{a.usuario || "Sistema"}</TD>
              <TD className="text-[#9aa7b8]">{a.entidad} #{a.entidad_id}</TD>
              <TD><Chip tono="azul">{a.accion}</Chip></TD>
              <TD className="text-[#9aa7b8]">{a.detalle || "\u2014"}</TD>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
