import Link from "next/link";
import { sql } from "@/lib/db";
import { requiereSesion, veCostos } from "@/lib/auth";
import { plata, plataCorta, numero, porcentaje } from "@/lib/format";
import { CATEGORIAS } from "@/lib/constantes";
import { sucursalActiva } from "@/lib/sucursal";
import {
  Encabezado, KPI, GrillaKPI, Panel, PanelTitulo, Tabla, TH, TD, FilaVacia, Boton, Monto, Chip,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const TABS = [
  ["resultado", "Resultado"],
  ["comisiones", "Comisiones"],
  ["inversores", "Inversores del mes"],
  ["agencia", "Ingresos de la agencia"],
  ["evolucion", "Evolución"],
] as const;

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
  const meses = Number(p.meses || 6);

  // La sucursal del menú alcanza al reporte, salvo que se pida otra acá.
  const global = await sucursalActiva();
  const suc = p.sucursal ? Number(p.sucursal) : global;
  const porSuc = suc ? sql`AND v.sucursal_id = ${suc}` : sql``;
  // Los gastos de estructura no se filtran por sucursal: las cuentas de caja
  // son de la agencia (Efectivo, Cuenta Lolo, Mercado Pago), no de cada local.

  const [ventasMes, gastos, comisiones, evolucion, presupuesto, sucursales, inversoresMes] =
    await Promise.all([
      // Una unidad propia deja margen. Una en consignación deja comisión,
      // porque el auto nunca fue de la agencia. Sumarlas juntas miente.
      sql`SELECT
            count(*)::int AS unidades,
            count(*) FILTER (WHERE x.propiedad = 'propia')::int       AS u_propias,
            count(*) FILTER (WHERE x.propiedad = 'inversor')::int     AS u_inversor,
            count(*) FILTER (WHERE x.propiedad = 'consignacion')::int AS u_consig,
            COALESCE(SUM(v.precio - v.descuento),0) AS facturado,
            COALESCE(SUM(v.precio - v.descuento - x.costo_total)
                     FILTER (WHERE x.propiedad = 'propia'),0)         AS margen_propio,
            COALESCE(SUM(v.precio - v.descuento - x.costo_total)
                     FILTER (WHERE x.propiedad = 'inversor'),0)       AS margen_inversor,
            COALESCE(SUM(v.precio - v.descuento - x.costo_total)
                     FILTER (WHERE x.propiedad = 'consignacion'),0)   AS comision_agencia,
            COALESCE(SUM(v.comision),0) AS comisiones
          FROM ventas v JOIN v_vehiculos x ON x.id = v.vehiculo_id
          WHERE v.estado = 'completada'
            AND extract(month FROM v.fecha) = ${mes}
            AND extract(year FROM v.fecha) = ${anio} ${porSuc}`,

      // Gastos de estructura: todo menos compra y preparación de unidades.
      sql`SELECT m.categoria, COALESCE(SUM(m.equivalente_ars),0) AS total
          FROM caja_movimientos m
          WHERE m.tipo = 'egreso'
            AND extract(month FROM m.fecha) = ${mes}
            AND extract(year FROM m.fecha) = ${anio}
            AND (m.categoria IS NULL OR m.categoria NOT IN ('compra_unidad','prep_unidad'))
          GROUP BY m.categoria ORDER BY total DESC`,

      sql`SELECT COALESCE(us.nombre,'Sin asignar') AS vendedor, count(*)::int AS unidades,
                 COALESCE(SUM(v.precio - v.descuento),0) AS facturado,
                 COALESCE(SUM(v.comision),0) AS comision,
                 COALESCE(SUM(v.precio - v.descuento - x.costo_total),0) AS margen
          FROM ventas v JOIN v_vehiculos x ON x.id = v.vehiculo_id
          LEFT JOIN usuarios us ON us.id = v.vendedor_id
          WHERE v.estado = 'completada' AND extract(year FROM v.fecha) = ${anio} ${porSuc}
          GROUP BY us.nombre ORDER BY margen DESC`,

      sql`SELECT to_char(v.fecha, 'YYYY-MM') AS periodo,
                 count(*)::int AS unidades,
                 COALESCE(SUM(v.precio - v.descuento - x.costo_total),0) AS margen
          FROM ventas v JOIN v_vehiculos x ON x.id = v.vehiculo_id
          WHERE v.estado = 'completada'
            AND v.fecha >= (date_trunc('month', current_date) - (${meses - 1} || ' months')::interval)
            ${porSuc}
          GROUP BY 1 ORDER BY 1`,

      sql`SELECT categoria, tipo, monto FROM presupuestos WHERE anio = ${anio} AND mes = ${mes}`,

      sql`SELECT id, nombre FROM sucursales WHERE activa ORDER BY nombre`,

      // Rendición del mes por inversor: qué se vendió de cada uno y qué dejó.
      sql`SELECT i.id, i.nombre,
                 count(v.id)::int AS unidades,
                 COALESCE(SUM(v.precio - v.descuento),0) AS facturado,
                 COALESCE(SUM(x.costo_total),0) AS costo,
                 COALESCE(SUM(v.precio - v.descuento - x.costo_total),0) AS resultado,
                 (SELECT count(*) FROM v_vehiculos w
                  WHERE w.inversor_id = i.id AND w.estado NOT IN ('vendido','baja'))::int AS en_stock,
                 (SELECT COALESCE(SUM(w.capital),0) FROM v_vehiculos w
                  WHERE w.inversor_id = i.id AND w.estado NOT IN ('vendido','baja')) AS capital_parado
          FROM inversores i
          LEFT JOIN v_vehiculos x ON x.inversor_id = i.id
          LEFT JOIN ventas v ON v.vehiculo_id = x.id AND v.estado = 'completada'
               AND extract(month FROM v.fecha) = ${mes}
               AND extract(year FROM v.fecha) = ${anio}
          WHERE i.activo
          GROUP BY i.id, i.nombre ORDER BY resultado DESC`,
    ]);

  const vm: any = ventasMes[0] || {};
  const totalGastos = gastos.reduce((a: number, g: any) => a + Number(g.total), 0);
  const garantias = Number(gastos.find((g: any) => g.categoria === "garantia_postventa")?.total || 0);
  const otrosGastos = totalGastos - garantias;

  const margenPropio = Number(vm.margen_propio || 0);
  const margenInversor = Number(vm.margen_inversor || 0);
  const comisionAgencia = Number(vm.comision_agencia || 0);
  const ingresos = margenPropio + margenInversor + comisionAgencia;
  const egresos = totalGastos + Number(vm.comisiones || 0);
  const resultado = ingresos - egresos;

  const maxEvo = Math.max(1, ...evolucion.map((e: any) => Math.abs(Number(e.margen))));
  const etiquetaCat = (c: string) => CATEGORIAS.find((x) => x.valor === c)?.label || c || "Sin categoría";

  const link = (o: any) => {
    const s = new URLSearchParams({
      tab, mes: String(mes), anio: String(anio), meses: String(meses),
      ...(p.sucursal ? { sucursal: String(p.sucursal) } : {}), ...o,
    });
    return `/reportes?${s.toString()}`;
  };

  const nombreMes = (periodo: string) => {
    const [a, m] = periodo.split("-");
    return `${MESES[Number(m) - 1]?.slice(0, 3)} ${a.slice(2)}`;
  };

  return (
    <>
      <Encabezado titulo="Reportes" detalle="Cómo se compone el resultado del negocio."
        acciones={
          <a href={`/api/exportar/reporte?mes=${mes}&anio=${anio}${suc ? "&sucursal=" + suc : ""}`} download
            className="inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2
              text-[13px] font-semibold bg-[#1b2433] hover:bg-[#232e40] text-[#cbd5e1]
              border border-[#1f2937] transition-colors">
            Exportar a Excel
          </a>
        } />

      {/* ------------------------------------------------------------- tabs */}
      <div className="flex flex-wrap gap-1 mb-4 border-b border-[#1f2937]">
        {TABS.map(([v, l]) => (
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
        <select name="sucursal" defaultValue={p.sucursal || ""} className="campo w-auto min-w-[160px]">
          <option value="">Todas las sucursales</option>
          {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        {tab === "evolucion" && (
          <select name="meses" defaultValue={meses} className="campo w-auto">
            {[3, 6, 12, 24].map((n) => <option key={n} value={n}>Últimos {n} meses</option>)}
          </select>
        )}
        <Boton tipo="submit" variante="suave">Ver período</Boton>
      </form>

      {/* -------------------------------------------------------- resultado */}
      {tab === "resultado" && (
        <>
          <GrillaKPI>
            <KPI label="Ingresos del período" valor={plataCorta(ingresos)} tono="verde"
                 detalle="margen + comisiones" />
            <KPI label="Egresos" valor={plataCorta(egresos)} tono="rojo" />
            <KPI label="Resultado neto" valor={<Monto valor={resultado} signo />} />
            <KPI label="Unidades vendidas" valor={numero(vm.unidades)}
                 detalle={[
                   `${numero(vm.u_propias)} propias`,
                   Number(vm.u_inversor) > 0 ? `${numero(vm.u_inversor)} de inversores` : null,
                   Number(vm.u_consig) > 0 ? `${numero(vm.u_consig)} en consignación` : null,
                 ].filter(Boolean).join(" · ")} />
          </GrillaKPI>

          <div className="grid lg:grid-cols-2 gap-4 mt-4">
            <Panel>
              <PanelTitulo titulo="Cómo se compone" detalle={`${MESES[mes - 1]} ${anio}`} />
              <div className="space-y-0.5 text-[13px]">
                <div className="flex justify-between py-2">
                  <span className="text-[#cbd5e1]">Margen de unidades propias</span>
                  <span className="tabular text-[#22c55e]">{plata(margenPropio)}</span>
                </div>
                {margenInversor !== 0 && (
                  <div className="flex justify-between py-2">
                    <span className="text-[#cbd5e1]">Margen de unidades de inversores</span>
                    <span className="tabular text-[#22c55e]">{plata(margenInversor)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2">
                  <span className="text-[#cbd5e1]">Comisiones de agencia
                    <span className="text-[11px] text-[#64748b] ml-1.5">unidades en consignación</span>
                  </span>
                  <span className="tabular text-[#22c55e]">{plata(comisionAgencia)}</span>
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
                  <span className="text-[#cbd5e1]">Garantías post-venta</span>
                  <span className="tabular text-[#f87171]">− {plata(garantias)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-[#cbd5e1]">Gastos de estructura</span>
                  <span className="tabular text-[#f87171]">− {plata(otrosGastos)}</span>
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
                unidad, y pega en el resultado recién cuando se vende. Una unidad en consignación
                nunca fue de la agencia, así que lo que deja es comisión y no margen.
                Para ver la plata que entró y salió, mirá la caja.
              </p>
            </Panel>

            <Panel>
              <PanelTitulo titulo="Gastos por categoría"
                detalle={suc
                  ? "De toda la agencia: las cuentas de caja no son por sucursal"
                  : "Sin contar compra ni preparación de unidades"} />
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

      {/* -------------------------------------------------------- inversores */}
      {tab === "inversores" && (
        <>
          <p className="text-[12.5px] text-[#64748b] mb-3 max-w-2xl leading-relaxed">
            Lo que le corresponde a cada inversor por lo vendido en {MESES[mes - 1]} de {anio},
            y cuánto capital suyo sigue parado en el playón.
          </p>
          <Tabla>
            <thead>
              <tr>
                <TH>Inversor</TH>
                <TH alinear="right">Vendidas en el mes</TH>
                <TH alinear="right">Facturado</TH>
                <TH alinear="right">Costo de las unidades</TH>
                <TH alinear="right">Resultado</TH>
                <TH alinear="right">En stock</TH>
                <TH alinear="right">Capital parado</TH>
              </tr>
            </thead>
            <tbody>
              {inversoresMes.length === 0 && <FilaVacia cols={7} mensaje="No hay inversores cargados." />}
              {inversoresMes.map((i: any) => (
                <tr key={i.id} className="hover:bg-[#151d29]">
                  <TD className="font-medium">
                    <Link href="/inversores" className="hover:text-[#2f6bff]">{i.nombre}</Link>
                  </TD>
                  <TD alinear="right">{numero(i.unidades)}</TD>
                  <TD alinear="right" className="text-[#9aa7b8]">{plata(i.facturado)}</TD>
                  <TD alinear="right" className="text-[#9aa7b8]">{plata(i.costo)}</TD>
                  <TD alinear="right"><Monto valor={Number(i.resultado)} signo /></TD>
                  <TD alinear="right">{numero(i.en_stock)}</TD>
                  <TD alinear="right" className="text-[#9aa7b8]">{plata(i.capital_parado)}</TD>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </>
      )}

      {/* ----------------------------------------------------------- agencia */}
      {tab === "agencia" && (
        <>
          <GrillaKPI cols={3}>
            <KPI label="Margen propio" valor={plataCorta(margenPropio)} tono="verde"
                 detalle={`${numero(vm.u_propias)} unidades de la agencia`} />
            <KPI label="Comisiones de agencia" valor={plataCorta(comisionAgencia)} tono="celeste"
                 detalle={`${numero(vm.u_consig)} en consignación`} />
            <KPI label="Sobre unidades de inversores" valor={plataCorta(margenInversor)} tono="violeta"
                 detalle={`${numero(vm.u_inversor)} unidades`} />
          </GrillaKPI>

          <Panel className="mt-4">
            <PanelTitulo titulo="De dónde sale la plata que gana la agencia"
              detalle={`${MESES[mes - 1]} ${anio}`} />
            {ingresos === 0 ? (
              <p className="text-[13px] text-[#64748b] py-8 text-center">
                Sin ventas cerradas en el período.
              </p>
            ) : (
              <div className="space-y-3">
                {[
                  ["Unidades propias", margenPropio, "#22c55e", "Autos comprados por la agencia. Lo que dejan es margen."],
                  ["Unidades de inversores", margenInversor, "#a855f7", "Comprados con plata de un tercero, que después se rinde."],
                  ["Consignación", comisionAgencia, "#38bdf8", "El auto nunca fue de la agencia: lo que queda es comisión."],
                ].map(([label, valor, color, nota]: any) => (
                  <div key={label}>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="text-[13px] text-[#cbd5e1]">{label}</span>
                      <span className="text-[13px] tabular">
                        {plata(valor)}
                        <span className="text-[11.5px] text-[#64748b] ml-2">
                          {porcentaje(ingresos !== 0 ? (valor / ingresos) * 100 : 0)}
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#1f2937] overflow-hidden">
                      <div className="h-full rounded-full"
                        style={{
                          width: `${ingresos !== 0 ? Math.max(0, (valor / ingresos) * 100) : 0}%`,
                          background: color,
                        }} />
                    </div>
                    <p className="text-[11px] text-[#64748b] mt-1">{nota}</p>
                  </div>
                ))}
                <div className="flex justify-between pt-3 mt-1 border-t border-[#1f2937] font-semibold text-[13px]">
                  <span>Total de ingresos</span>
                  <span className="tabular text-[#22c55e]">{plata(ingresos)}</span>
                </div>
              </div>
            )}
          </Panel>
        </>
      )}

      {/* --------------------------------------------------------- evolución */}
      {tab === "evolucion" && (
        <Panel>
          <PanelTitulo titulo={`Margen por mes — últimos ${meses} meses`}
            detalle="Solo unidades vendidas" />
          {evolucion.length === 0 ? (
            <p className="text-[13px] text-[#64748b] py-10 text-center">Sin ventas en el período.</p>
          ) : (
            <div className="flex items-end gap-2 h-[240px] pt-4 overflow-x-auto">
              {evolucion.map((e: any) => (
                <div key={e.periodo} className="flex-1 min-w-[42px] flex flex-col items-center gap-2">
                  <span className="text-[11px] tabular text-[#9aa7b8]">{plataCorta(e.margen)}</span>
                  <div className={`w-full rounded-t-md min-h-[3px]
                    ${Number(e.margen) >= 0 ? "bg-[#22c55e]" : "bg-[#ef4444]"}`}
                    style={{ height: `${(Math.abs(Number(e.margen)) / maxEvo) * 100}%` }} />
                  <span className="text-[10.5px] text-[#64748b] whitespace-nowrap">{nombreMes(e.periodo)}</span>
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
