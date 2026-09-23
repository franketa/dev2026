import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { plata, fecha, numero } from "@/lib/format";
import { Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia } from "@/components/ui";
import Exportar from "@/components/exportar";

export const dynamic = "force-dynamic";

export default async function Cobranzas() {
  await requiereSesion();
  const filas = await sql`
    SELECT co.*, c.nombre, c.apellido, (co.monto - co.cobrado) AS saldo,
           (co.vencimiento < current_date AND co.estado <> 'cobrado') AS vencida
    FROM cobranzas co LEFT JOIN clientes c ON c.id = co.cliente_id
    ORDER BY co.estado = 'cobrado', co.vencimiento`;

  const pend = filas.filter((f: any) => f.estado !== "cobrado");
  const vencidas = pend.filter((f: any) => f.vencida);

  // Los saldos no se suman entre monedas. Un saldo pactado en dólares se
  // reclama en dólares; convertirlo a pesos para el total da un número que
  // no es el que se firmó y que cambia solo cuando se mueve el dólar.
  const sumar = (l: any[], m: string) =>
    l.filter((f) => (f.moneda || "ARS") === m).reduce((a, f) => a + Number(f.saldo), 0);

  const pendARS = sumar(pend, "ARS");
  const pendUSD = sumar(pend, "USD");
  const cobradoUSD = filas
    .filter((f: any) => (f.moneda || "ARS") === "USD")
    .reduce((a: number, f: any) => a + Number(f.cobrado), 0);
  const hayUSD = filas.some((f: any) => (f.moneda || "ARS") === "USD");

  return (
    <>
      <Encabezado titulo="Cobranzas" detalle="Lo que falta cobrar y lo que ya se venció."
        acciones={<Exportar que="cobranzas" />} />

      <GrillaKPI cols={hayUSD ? 4 : 3}>
        <KPI label="Saldo pendiente en pesos" valor={plata(pendARS)}
             detalle={`${numero(pend.filter((f: any) => (f.moneda || "ARS") === "ARS").length)} cuentas`} />
        {hayUSD && (
          <KPI label="Saldo pendiente en dólares" valor={plata(pendUSD, "USD")} tono="celeste"
               detalle={`${numero(pend.filter((f: any) => f.moneda === "USD").length)} cuentas`} />
        )}
        <KPI label="Vencidas" valor={numero(vencidas.length)} tono={vencidas.length ? "rojo" : "verde"}
             detalle={vencidas.length ? "hay que reclamar" : "nada vencido"} />
        {hayUSD
          ? <KPI label="Cobrado en dólares" valor={plata(cobradoUSD, "USD")} tono="verde" />
          : <KPI label="Pendientes" valor={numero(pend.length)} tono="amarillo" />}
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
          {filas.map((f: any) => {
            const moneda = (f.moneda || "ARS") as "ARS" | "USD";
            return (
              <tr key={f.id} className="hover:bg-[#151d29]">
                <TD className="font-medium">{[f.apellido, f.nombre].filter(Boolean).join(", ") || "—"}</TD>
                <TD className="text-[#9aa7b8]">
                  {f.concepto}
                  {moneda === "USD" && (
                    <span className="ml-2 text-[11px] text-[#38bdf8]">en dólares</span>
                  )}
                </TD>
                <TD>{f.vencida
                  ? <Chip tono="rojo">{fecha(f.vencimiento)}</Chip>
                  : <span className="text-[#9aa7b8]">{fecha(f.vencimiento)}</span>}</TD>
                <TD alinear="right">{plata(f.monto, moneda)}</TD>
                <TD alinear="right" className="text-[#9aa7b8]">{plata(f.cobrado, moneda)}</TD>
                <TD alinear="right" className="font-medium">{plata(f.saldo, moneda)}</TD>
                <TD><Chip tono={f.estado === "cobrado" ? "verde" : f.vencida ? "rojo" : "amarillo"}>
                  {f.estado}</Chip></TD>
              </tr>
            );
          })}
        </tbody>
      </Tabla>

      {hayUSD && (
        <p className="mt-4 text-[11.5px] text-[#64748b] leading-relaxed max-w-2xl">
          Los saldos en dólares no se suman a los de pesos. Un saldo pactado en dólares se
          reclama en dólares: convertirlo daría un número que no es el que se firmó y que
          cambiaría solo cada vez que se mueve la cotización.
        </p>
      )}
    </>
  );
}
