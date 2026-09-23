import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { plata, fecha, numero } from "@/lib/format";
import { Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";


export default async function Deudas() {
  await requiereSesion();
  const filas = await sql`
    SELECT *, (monto - pagado) AS saldo,
           (vencimiento < current_date AND estado <> 'pagado') AS vencida
    FROM deudas ORDER BY estado = 'pagado', vencimiento NULLS LAST`;
  const pend = filas.filter((f: any) => f.estado !== "pagado");
  const total = pend.reduce((a: number, f: any) => a + Number(f.saldo), 0);

  return (
    <>
      <Encabezado titulo="Deudas a pagar" detalle="Alquiler, impuestos, proveedores y consignaciones." />
      <GrillaKPI cols={3}>
        <KPI label="Total a pagar" valor={plata(total)} />
        <KPI label="Compromisos abiertos" valor={numero(pend.length)} tono="amarillo" />
        <KPI label="Vencidos" valor={numero(pend.filter((f: any) => f.vencida).length)}
             tono={pend.some((f: any) => f.vencida) ? "rojo" : "verde"} />
      </GrillaKPI>
      <div className="mt-6" />
      <Tabla>
        <thead><tr>
          <TH>Acreedor</TH><TH>Concepto</TH><TH>Tipo</TH><TH>Vencimiento</TH>
          <TH alinear="right">Monto</TH><TH alinear="right">Saldo</TH><TH>Estado</TH>
        </tr></thead>
        <tbody>
          {filas.length === 0 && <FilaVacia cols={7} mensaje="No hay deudas registradas." />}
          {filas.map((f: any) => (
            <tr key={f.id} className="hover:bg-[var(--c-hover)]">
              <TD className="font-medium">{f.acreedor}</TD>
              <TD className="text-[var(--c-tinta-media)]">{f.concepto || "\u2014"}</TD>
              <TD className="text-[var(--c-tinta-media)]">{f.tipo}</TD>
              <TD>{f.vencida
                ? <Chip tono="rojo">{fecha(f.vencimiento)}</Chip>
                : <span className="text-[var(--c-tinta-media)]">{fecha(f.vencimiento)}</span>}</TD>
              <TD alinear="right">{plata(f.monto)}</TD>
              <TD alinear="right" className="font-medium">{plata(f.saldo)}</TD>
              <TD><Chip tono={f.estado === "pagado" ? "verde" : f.vencida ? "rojo" : "amarillo"}>
                {f.estado}</Chip></TD>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
