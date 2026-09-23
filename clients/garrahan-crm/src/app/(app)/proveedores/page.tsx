import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { plata, fecha, numero } from "@/lib/format";
import { Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";


export default async function Proveedores() {
  await requiereSesion();
  const filas = await sql`
    SELECT p.*,
      (SELECT COALESCE(SUM(monto),0) FROM vehiculo_costos c WHERE c.proveedor_id = p.id) AS facturado,
      (SELECT count(*) FROM vehiculo_costos c WHERE c.proveedor_id = p.id)::int AS trabajos
    FROM proveedores p WHERE p.activo ORDER BY p.nombre`;
  const total = filas.reduce((a: number, p: any) => a + Number(p.facturado), 0);

  return (
    <>
      <Encabezado titulo="Proveedores" detalle="Chapistas, gomerías, gestoría y todo lo que le factura a la agencia." />
      <GrillaKPI cols={2}>
        <KPI label="Proveedores activos" valor={numero(filas.length)} />
        <KPI label="Facturado histórico" valor={plata(total)} />
      </GrillaKPI>
      <div className="mt-6" />
      <Tabla>
        <thead><tr>
          <TH>Proveedor</TH><TH>Rubro</TH><TH>CUIT</TH><TH>Teléfono</TH>
          <TH alinear="right">Trabajos</TH><TH alinear="right">Facturado</TH>
        </tr></thead>
        <tbody>
          {filas.length === 0 && <FilaVacia cols={6} mensaje="No hay proveedores cargados." />}
          {filas.map((p: any) => (
            <tr key={p.id} className="hover:bg-[#151d29]">
              <TD className="font-medium">{p.nombre}</TD>
              <TD className="text-[#9aa7b8]">{p.rubro || "\u2014"}</TD>
              <TD className="text-[#9aa7b8]">{p.cuit || "\u2014"}</TD>
              <TD className="text-[#9aa7b8]">{p.telefono || "\u2014"}</TD>
              <TD alinear="right">{p.trabajos || "\u2014"}</TD>
              <TD alinear="right">{Number(p.facturado) > 0 ? plata(p.facturado) : "\u2014"}</TD>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
