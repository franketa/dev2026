import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { plata, fecha, numero } from "@/lib/format";
import { Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Panel } from "@/components/ui";
import Exportar from "@/components/exportar";
import ImprimirListado from "@/components/imprimir-listado";

export const dynamic = "force-dynamic";


export default async function Clientes() {
  await requiereSesion();
  const filas = await sql`
    SELECT c.*,
      (SELECT count(*) FROM ventas v WHERE v.cliente_id = c.id)::int AS compras,
      (SELECT count(*) FROM leads l WHERE l.cliente_id = c.id)::int AS consultas
    FROM clientes c ORDER BY c.apellido NULLS LAST, c.nombre LIMIT 300`;

  return (
    <>
      <Encabezado titulo="Clientes" detalle="Quién compró, quién consultó y cómo ubicarlo."
        acciones={<><ImprimirListado /><Exportar que="clientes" /></>} />
      <GrillaKPI cols={3}>
        <KPI label="Clientes" valor={numero(filas.length)} />
        <KPI label="Con compras" valor={numero(filas.filter((c: any) => c.compras > 0).length)} tono="verde" />
        <KPI label="Solo consultas" valor={numero(filas.filter((c: any) => c.compras === 0).length)} tono="azul" />
      </GrillaKPI>
      <div className="mt-6" />
      <Tabla>
        <thead><tr>
          <TH>Cliente</TH><TH>DNI / CUIT</TH><TH>Teléfono</TH><TH>Email</TH>
          <TH>Localidad</TH><TH alinear="right">Compras</TH><TH alinear="right">Consultas</TH>
        </tr></thead>
        <tbody>
          {filas.length === 0 && <FilaVacia cols={7} mensaje="Todavía no hay clientes cargados." />}
          {filas.map((c: any) => (
            <tr key={c.id} className="hover:bg-[var(--c-hover)]">
              <TD className="font-medium">{[c.apellido, c.nombre].filter(Boolean).join(", ")}</TD>
              <TD className="text-[var(--c-tinta-media)]">{c.dni_cuit || "\u2014"}</TD>
              <TD className="text-[var(--c-tinta-media)]">{c.telefono || "\u2014"}</TD>
              <TD className="text-[var(--c-tinta-media)]">{c.email || "\u2014"}</TD>
              <TD className="text-[var(--c-tinta-media)]">{c.localidad || "\u2014"}</TD>
              <TD alinear="right">{c.compras > 0 ? <Chip tono="verde">{c.compras}</Chip> : "\u2014"}</TD>
              <TD alinear="right" className="text-[var(--c-tinta-media)]">{c.consultas || "\u2014"}</TD>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
