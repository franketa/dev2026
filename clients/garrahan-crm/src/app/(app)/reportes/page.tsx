import Link from "next/link";
import { sql } from "@/lib/db";
import { requiereSesion, veCostos } from "@/lib/auth";
import { plata, plataCorta, numero, porcentaje } from "@/lib/format";
import { CATEGORIAS, CATEGORIAS_INVENTARIO } from "@/lib/constantes";
import {
  Encabezado, KPI, GrillaKPI, Panel, PanelTitulo, Tabla, TH, TD, FilaVacia, Boton, Monto,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default async function Reportes({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requiereSesion();
  if (!veCostos(u)) {
    return <Panel><p className="text-[13px] text-[#9aa7b8] py-8 text-center">
      Tu perfil no tiene acceso a los reportes.</p></Panel>;
  }
  const p = await searchParams;
  const hoy = new Date();
  const mes = Number(p.mes || hoy.getMonth() + 1);
  const anio = Number(p.anio || hoy.getFullYear());
  const tab = p.tab || "resultado";

  const [ventasMes, gastos, comisiones, evolucion, presupuesto] = await Promise.all([
    // El ingreso del periodo es el MARGEN de lo vendido, no el precio.
    sql`SELECT count(*)::int AS unidades,
               COALESCE(SUM(v.precio - v.descuento),0) AS facturado,
               COALESCE(SUM(v.precio - v.descuento - x.costo_total),0) AS margen,
               COALESCE(SUM(v.comision),0) AS comisiones
        FROM ventas v JOIN v_vehiculos x ON x.id = v.vehiculo_id
        WHERE v.estado = 'completada'
          AND extract(month FROM v.fecha) = ${mes} AND extract(year FROM v.fecha) = ${anio}`,
    // Gastos de estructura: todo menos compra y preparacion de unidades.
    sql`SELECT categoria, COALESCE(SUM(equivalente_ars),0) AS total
        FROM caja_movimientos
        WHERE tipo = 'egreso'
          AND extract(month FROM fecha) = ${mes} AND extract(year FROM fecha) = ${anio}
          AND (categoria IS NULL OR categoria NOT IN ('compra_unidad','prep_unidad'))
        GROUP BY categoria ORDER BY total DESC`,
    sql`SELECT COALESCE(us.nombre,'Sin asignar') AS vendedor, count(*)::int AS unidades,
               COALESCE(SUM(v.precio - v.descuento),0) AS facturado,
               COALESCE(SUM(v.comision),0) AS comision,
               COALESCE(SUM(v.precio - v.descuento - x.costo_total),0) AS margen
        FROM ventas v JOIN v_vehiculos x ON x.id = v.vehiculo_id
        LEFT JOIN usuarios us ON us.id = v.vendedor_id
        WHERE v.estado = 'completada'
          AND extract(year FROM v.fecha) = ${anio}
        GROUP BY us.nombre ORDER BY margen DESC`,
    sql`SELECT extract(month FROM v.fecha)::int AS mes,
               count(*)::int AS unidades,
               COALESCE(SUM(v.precio - v.descuento - x.costo_total),0) AS margen
        FROM ventas v JOIN v_vehiculos x ON x.id = v.vehiculo_id
        WHERE v.estado = 'completada' AND extract(year FROM v.fecha) = ${anio}
        GROUP BY 1 ORDER BY 1`,
    sql`SELECT categoria, tipo, monto FROM presupuestos WHERE anio = ${anio} AND mes = ${mes}`,
  ]);

  const vm = ventasMes[0] || {};
  const totalGastos = gastos.reduce((a: number, g: any) => a + Number(g.total), 0);
  const ingresos = Number(vm.margen);
  const egresos = totalGastos + Number(vm.comisiones);
  const resultado = ingresos - egresos;
  const maxEvo = Math.max(1, ...evolucion.map((e: any) => Math.abs(Number(e.margen))));

  const etiquetaCat = (c: string) => CATEGORIAS.find((x) => x.valor === c)?.label || c || "Sin categoría";
  const link = (o: any) => {
    const s = new URLSearchParams({ tab, mes: String(mes), anio: String(anio), ...o });
    return `/reportes?${s.toString()}`;
  };

  return (
    <>
      <Encabezado titulo="Reportes" detalle="Cómo se compone el resultado del negocio." />

      {/* ------------------------------------------------------------- tabs */}
      <div className="flex flex-wrap gap-1 mb-4 border-b border-[#1f2937]">
        {[["resultado", "Resultado"], ["comisiones", "Comisiones"], ["evolucion", "Evolución"]].map(([v, l]) => (
          <Link key={v} href={link({ tab: v })}
            className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors
              ${tab === v ? "border-[#2f6bff] text-[#e8edf5]" : "border-transparent text-[#9aa7b8] hover:text-[#cbd5e1]"}`}>
            {l}
          </Link>
        ))}
      </div>

      {/* ---------------------------------------------------------- período */}
      <form action="/reportes" className="flex flex-wrap gap-2 mb-5">
        <input type="hidden" name="tab" value={tab} />
        <select name="mes" defaultValue={mes} className="campo w-auto">
          {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select name="anio" defaultValue={anio} className="campo w-auto">
          {[anio + 1, anio, anio - 1, anio - 2].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <Boton tipo="submit" variante="suave">Ver período</Boton>
      </form>

      {/* -------------------------------------------------------- resultado */}
      {tab === "resultado" && (
        <>
          <GrillaKPI>
            <KPI label="Margen de lo vendido" valor={plataCorta(ingresos)} tono="verde"
                 detalle={`${numero(vm.unidades)} unidades`} />
            <KPI label="Gastos de estructura" valor={plataCorta(egresos)} tono="rojo" />
            <KPI label="Resultado neto" valor={<Monto valor={resultado} signo />} />
            <KPI label="Facturado" valor={plataCorta(vm.facturado)} detalle="precio de venta total" />
          </GrillaKPI>

          <div className="grid lg:grid-cols-2 gap-4 mt-4">
            <Panel>
              <PanelTitulo titulo="Cómo se compone"
                detalle={`${MESES[mes - 1]} ${anio}`} />
              <div className="space-y-0.5 text-[13px]">
                <div className="flex justify-between py-2">
                  <span className="text-[#cbd5e1]">Margen de unidades vendidas</span>
                  <span className="tabular text-[#22c55e]">{plata(vm.margen)}</span>
                </div>
                <div className="flex justify-between py-2 border-t border-[#1f2937] font-semibold">
                  <span>Ingresos</span>
                  <span className="tabular text-[#22c55e]">{plata(ingresos)}</span>
                </div>

                <div className="flex justify-between py-2 pt-4">
                  <span className="text-[#cbd5e1]">Comisiones a vendedores</span>
                  <span className="tabular text-[#f87171]">− {plata(vm.comisiones)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-[#cbd5e1]">Gastos de estructura</span>
                  <span className="tabular text-[#f87171]">− {plata(totalGastos)}</span>
                </div>
                <div className="flex justify-between py-2 border-t border-[#1f2937] font-semibold">
                  <span>Egresos</span>
                  <span className="tabular text-[#f87171]">− {plata(egresos)}</span>
                </div>

                <div className="flex justify-between py-3 mt-2 border-t-2 border-[#1f2937] text-[15px] font-semibold">
                  <span>Resultado neto</span>
                  <Monto valor={resultado} signo />
                </div>
              </div>

              <p className="mt-4 pt-3 border-t border-[#1f2937] text-[11.5px] text-[#64748b] leading-relaxed">
                La compra de unidades no figura acá: no es un gasto del mes sino el costo de la
                unidad, y pega en el resultado recién cuando se vende. Para ver la plata que
                entró y salió, mirá la caja.
              </p>
            </Panel>

            <Panel>
              <PanelTitulo titulo="Gastos por categoría" detalle="Sin contar compra ni preparación de unidades" />
              {gastos.length === 0 ? (
                <p className="text-[13px] text-[#64748b] py-8 text-center">Sin gastos cargados en el período.</p>
              ) : (
                <div className="space-y-2.5">
                  {gastos.map((g: any) => {
                    const pres = presupuesto.find((x: any) => x.categoria === g.categoria);
                    const desvio = pres ? Number(g.total) - Number(pres.monto) : null;
                    return (
                      <div key={g.categoria || "sin"} className="flex items-baseline justify-between gap-3">
                        <span className="text-[12.5px] text-[#cbd5e1]">{etiquetaCat(g.categoria)}</span>
                        <span className="flex items-baseline gap-2 shrink-0">
                          {desvio !== null && (
                            <span className={`text-[11px] ${desvio > 0 ? "text-[#f87171]" : "text-[#22c55e]"}`}>
                              {desvio > 0 ? "+" : ""}{plataCorta(desvio)}
                            </span>
                          )}
                          <span className="text-[12.5px] tabular text-[#9aa7b8]">{plata(g.total)}</span>
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex justify-between pt-3 mt-1 border-t border-[#1f2937] font-semibold text-[13px]">
                    <span>Total</span>
                    <span className="tabular">{plata(totalGastos)}</span>
                  </div>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}

      {/* -------------------------------------------------------- comisiones */}
      {tab === "comisiones" && (
        <Tabla>
          <thead>
            <tr>
              <TH>Vendedor</TH><TH alinear="right">Unidades</TH><TH alinear="right">Facturado</TH>
              <TH alinear="right">Margen generado</TH><TH alinear="right">Comisión</TH>
            </tr>
          </thead>
          <tbody>
            {comisiones.length === 0 && <FilaVacia cols={5} mensaje={`Sin ventas cerradas en ${anio}.`} />}
            {comisiones.map((c: any) => (
              <tr key={c.vendedor} className="hover:bg-[#151d29]">
                <TD className="font-medium">{c.vendedor}</TD>
                <TD alinear="right">{numero(c.unidades)}</TD>
                <TD alinear="right" className="text-[#9aa7b8]">{plata(c.facturado)}</TD>
                <TD alinear="right" className="text-[#22c55e]">{plata(c.margen)}</TD>
                <TD alinear="right">{plata(c.comision)}</TD>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}

      {/* --------------------------------------------------------- evolución */}
      {tab === "evolucion" && (
        <Panel>
          <PanelTitulo titulo={`Margen por mes — ${anio}`} detalle="Solo unidades vendidas" />
          {evolucion.length === 0 ? (
            <p className="text-[13px] text-[#64748b] py-10 text-center">Sin ventas en el año.</p>
          ) : (
            <div className="flex items-end gap-2 h-[220px] pt-4">
              {evolucion.map((e: any) => (
                <div key={e.mes} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-[11px] tabular text-[#9aa7b8]">{plataCorta(e.margen)}</span>
                  <div className={`w-full rounded-t-md min-h-[3px]
                    ${Number(e.margen) >= 0 ? "bg-[#22c55e]" : "bg-[#ef4444]"}`}
                    style={{ height: `${(Math.abs(Number(e.margen)) / maxEvo) * 100}%` }} />
                  <span className="text-[10.5px] text-[#64748b]">{MESES[e.mes - 1]?.slice(0, 3)}</span>
                  <span className="text-[10.5px] text-[#475569]">{e.unidades}u</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
