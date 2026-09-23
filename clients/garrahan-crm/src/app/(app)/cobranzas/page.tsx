import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { plata, fecha, numero } from "@/lib/format";
import { Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";


export default async function Cobranzas() {
  await requiereSesion();
  const filas = await sql`
    SELECT co.*, c.nombre, c.apellido, (co.monto - co.cobrado) AS saldo,
           (co.vencimiento < current_date AND co.estado <> 'cobrado') AS vencida
    FROM cobranzas co LEFT JOIN clientes c ON c.id = co.cliente_id
    ORDER BY co.estado = 'cobrado', co.vencimiento`;
  const pend = filas.filter((f: any) => f.estado !== "cobrado");
  const totalPend = pend.reduce((a: number, f: any) => a + Number(f.saldo), 0);
  const vencidas = pend.filter((f: any) => f.vencida);

  return (
    <>
      <Encabezado titulo="Cobranzas" detalle="Lo que falta cobrar y lo que ya se venció." />
      <GrillaKPI cols={3}>
        <KPI label="Total a cobrar" valor={plata(totalPend)} />
        <KPI label="Vencidas" valor={numero(vencidas.length)} tono={vencidas.length ? "rojo" : "verde"}
             detalle={vencidas.length ? plata(vencidas.reduce((a: number, f: any) => a + Number(f.saldo), 0)) : "nada vencido"} />
        <KPI label="Pendientes" valor={numero(pend.length)} tono="amarillo" />
      </GrillaKPI>
      <div className="mt-6" />
      <Tabla>
        <thead><tr>
          <TH>Cliente</TH><TH>Concepto</TH><TH>Vencimiento</TH>
          <TH alinear="right">Monto</TH><TH alinear="right">Cobrado</TH>
          <TH alinear="right">Saldo</TH><TH>Estado</TH>
        </tr></thead>
        <tbody>
          {filas.length === 0 && <FilaVacia cols={7} mensaje="No hay cobranzas registradas." />}
          {filas.map((f: any) => (
            <tr key={f.id} className="hover:bg-[#151d29]">
              <TD className="font-medium">{[f.apellido, f.nombre].filter(Boolean).join(", ") || "\u2014"}</TD>
              <TD className="text-[#9aa7b8]">{f.concepto}</TD>
              <TD>{f.vencida
                ? <Chip tono="rojo">{fecha(f.vencimiento)}</Chip>
                : <span className="text-[#9aa7b8]">{fecha(f.vencimiento)}</span>}</TD>
              <TD alinear="right">{plata(f.monto)}</TD>
              <TD alinear="right" className="text-[#9aa7b8]">{plata(f.cobrado)}</TD>
              <TD alinear="right" className="font-medium">{plata(f.saldo)}</TD>
              <TD><Chip tono={f.estado === "cobrado" ? "verde" : f.vencida ? "rojo" : "amarillo"}>
                {f.estado}</Chip></TD>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
