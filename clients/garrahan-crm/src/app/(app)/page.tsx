import Link from "next/link";
import { sql, num } from "@/lib/db";
import { requiereSesion, veCostos } from "@/lib/auth";
import { plata, plataCorta, numero, porcentaje, fecha, saludo, dominio } from "@/lib/format";
import { ALERTAS, ESTADOS_VEHICULO } from "@/lib/constantes";
import { KPI, GrillaKPI, Panel, PanelTitulo, Chip, Tabla, TH, TD, FilaVacia } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const u = await requiereSesion();
  const costos = veCostos(u);
  const hoy = new Date();
  const mes = hoy.getMonth() + 1, anio = hoy.getFullYear();

  const [stock, ventasMes, porEstado, porSucursal, demoradas, acciones, porVendedor, ultimos6] =
    await Promise.all([
      sql`SELECT count(*)::int AS unidades,
                 COALESCE(SUM(costo_total),0) AS capital,
                 COALESCE(AVG(NULLIF(margen_pct,0)),0) AS margen
          FROM v_vehiculos WHERE estado NOT IN ('vendido','baja')`,
      sql`SELECT count(*)::int AS cantidad, COALESCE(SUM(precio - descuento),0) AS importe
          FROM ventas
          WHERE estado = 'completada'
            AND extract(month FROM fecha) = ${mes} AND extract(year FROM fecha) = ${anio}`,
      sql`SELECT estado, count(*)::int AS n FROM vehiculos
          WHERE estado NOT IN ('vendido','baja') GROUP BY estado ORDER BY n DESC`,
      sql`SELECT COALESCE(s.nombre,'Sin asignar') AS sucursal, count(*)::int AS n,
                 COALESCE(SUM(v.costo_total),0) AS capital
          FROM v_vehiculos v LEFT JOIN sucursales s ON s.id = v.sucursal_id
          WHERE v.estado NOT IN ('vendido','baja')
          GROUP BY s.nombre ORDER BY n DESC`,
      sql`SELECT id, dominio, marca, modelo, anio, dias_stock, alerta, costo_total, precio_venta
          FROM v_vehiculos
          WHERE estado NOT IN ('vendido','baja') AND dias_stock > 60
          ORDER BY dias_stock DESC LIMIT 6`,
      sql`SELECT l.id, l.nombre, l.proxima_accion, l.fecha_proxima, l.estado,
                 COALESCE(us.nombre,'—') AS asesor
          FROM leads l LEFT JOIN usuarios us ON us.id = l.asesor_id
          WHERE l.fecha_proxima IS NOT NULL
            AND l.estado NOT IN ('vendido','perdido','postergado')
          ORDER BY l.fecha_proxima ASC LIMIT 6`,
      sql`SELECT COALESCE(us.nombre,'Sin asignar') AS vendedor, count(*)::int AS n
          FROM ventas v LEFT JOIN usuarios us ON us.id = v.vendedor_id
          WHERE v.estado = 'completada'
            AND v.fecha >= date_trunc('month', current_date) - interval '5 months'
          GROUP BY us.nombre ORDER BY n DESC LIMIT 6`,
      sql`SELECT to_char(date_trunc('month', fecha),'TMMon') AS mes,
                 date_trunc('month', fecha) AS orden, count(*)::int AS n
          FROM ventas WHERE estado = 'completada'
            AND fecha >= date_trunc('month', current_date) - interval '5 months'
          GROUP BY 1,2 ORDER BY 2`,
    ]);

  const s = stock[0] || {};
  const vm = ventasMes[0] || {};
  const maxSuc = Math.max(1, ...porSucursal.map((r: any) => r.n));
  const maxVen = Math.max(1, ...porVendedor.map((r: any) => r.n));
  const maxMes = Math.max(1, ...ultimos6.map((r: any) => r.n));
  const enRojo = demoradas.filter((d: any) => d.alerta === "rojo").length;

  return (
    <>
      <div className="mb-6">
        <div className="etiqueta">{fecha(hoy)}</div>
        <h1 className="text-[26px] font-semibold mt-1.5">
          {saludo()}, <span className="text-[var(--c-primario)]">{u.nombre.split(" ")[0]}</span>
        </h1>
        <p className="text-[13px] text-[var(--c-tinta-tenue)] mt-1">
          El pulso de la agencia: stock, ventas y rentabilidad en una sola vista.
        </p>
      </div>

      {/* ------------------------------------------------------------- KPIs */}
      <GrillaKPI>
        <KPI label="Stock activo" valor={numero(s.unidades)}
             detalle={`${numero(porSucursal.length)} ubicaciones`} href="/vehiculos" />
        <KPI label="Ventas del mes" valor={numero(vm.cantidad)}
             detalle={costos ? plataCorta(vm.importe) : undefined} href="/ventas" />
        {costos ? (
          <KPI label="Capital en stock" valor={plataCorta(s.capital)}
               detalle="inmovilizado hoy" href="/vehiculos" />
        ) : (
          <KPI label="Leads activos" valor={numero(acciones.length)} detalle="con acción pendiente" href="/leads" />
        )}
        {costos ? (
          <KPI label="Margen promedio" valor={porcentaje(s.margen)} detalle="sobre el stock actual" />
        ) : (
          <KPI label="Unidades demoradas" valor={numero(demoradas.length)} detalle="+60 días" tono="naranja" href="/vehiculos" />
        )}
      </GrillaKPI>

      {/* -------------------------------------------------- alerta de aging */}
      {enRojo > 0 && (
        <Link href="/vehiculos?alerta=rojo"
          className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--c-rojo-borde)] bg-[var(--c-rojo-fondo)]
            px-4 py-3 hover:bg-[var(--c-degradado-c)] transition-colors">
          <span className="h-2 w-2 rounded-full bg-[var(--c-rojo)] shrink-0" />
          <span className="text-[13px] text-[var(--c-rojo-suave)]">
            <b>{enRojo} {enRojo === 1 ? "unidad lleva" : "unidades llevan"} más de 90 días</b> en el predio.
            Es capital parado que no está trabajando.
          </span>
          <span className="ml-auto text-[12px] text-[var(--c-rojo-alto)] shrink-0">Ver →</span>
        </Link>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        {/* ------------------------------------------------ stock por ubicación */}
        <Panel>
          <PanelTitulo titulo="Stock por ubicación" detalle="Unidades activas y capital" />
          {porSucursal.length === 0 ? (
            <p className="text-[13px] text-[var(--c-tinta-tenue)] py-6 text-center">Todavía no hay unidades cargadas.</p>
          ) : (
            <div className="space-y-3.5">
              {porSucursal.map((r: any) => (
                <div key={r.sucursal}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-[13px]">{r.sucursal}</span>
                    <span className="text-[13px] tabular text-[var(--c-tinta-media)]">
                      {r.n}{costos && <span className="text-[var(--c-tinta-tenue)]"> · {plataCorta(r.capital)}</span>}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--c-borde)] overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--c-primario)]"
                         style={{ width: `${(r.n / maxSuc) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* ----------------------------------------------------- stock por estado */}
        <Panel>
          <PanelTitulo titulo="Estado de las unidades" detalle="Dónde está parado el stock" />
          {porEstado.length === 0 ? (
            <p className="text-[13px] text-[var(--c-tinta-tenue)] py-6 text-center">Sin datos.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {porEstado.map((r: any) => {
                const e = ESTADOS_VEHICULO[r.estado] || { label: r.estado, tono: "gris" as const };
                return (
                  <Link key={r.estado} href={`/vehiculos?estado=${r.estado}`}
                    className="flex items-center gap-2.5 rounded-lg border border-[var(--c-borde)]
                      bg-[var(--c-hueco)] px-3.5 py-2.5 hover:border-[var(--c-primario)] transition-colors">
                    <Chip tono={e.tono}>{e.label}</Chip>
                    <span className="text-[17px] font-semibold tabular">{r.n}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        {/* ------------------------------------------------------- ventas por mes */}
        <Panel>
          <PanelTitulo titulo="Ventas por mes" detalle="Últimos 6 meses" />
          {ultimos6.length === 0 ? (
            <p className="text-[13px] text-[var(--c-tinta-tenue)] py-10 text-center">Todavía no hay ventas cerradas.</p>
          ) : (
            <div className="flex items-end gap-3 h-[150px] pt-2">
              {ultimos6.map((r: any) => (
                <div key={r.mes} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-[12px] tabular text-[var(--c-tinta-media)]">{r.n}</span>
                  <div className="w-full rounded-t-md bg-[var(--c-primario)] min-h-[3px]"
                       style={{ height: `${(r.n / maxMes) * 100}%` }} />
                  <span className="text-[11px] text-[var(--c-tinta-tenue)] capitalize">{r.mes}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* ---------------------------------------------------- ventas por vendedor */}
        <Panel>
          <PanelTitulo titulo="Ventas por vendedor" detalle="Operaciones cerradas" />
          {porVendedor.length === 0 ? (
            <p className="text-[13px] text-[var(--c-tinta-tenue)] py-10 text-center">Sin operaciones en el período.</p>
          ) : (
            <div className="space-y-3.5 pt-1">
              {porVendedor.map((r: any) => (
                <div key={r.vendedor}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-[13px]">{r.vendedor}</span>
                    <span className="text-[13px] tabular text-[var(--c-tinta-media)]">{r.n}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--c-borde)] overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--c-verde)]"
                         style={{ width: `${(r.n / maxVen) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        {/* ------------------------------------------------------ unidades demoradas */}
        <Panel padding={false}>
          <div className="p-5 pb-0">
            <PanelTitulo titulo="Unidades demoradas" detalle="Más de 60 días en el predio"
              accion={<Link href="/vehiculos" className="text-[12.5px] text-[var(--c-primario)] hover:underline">Ver stock</Link>} />
          </div>
          <Tabla className="border-0 rounded-none bg-transparent">
            <tbody>
              {demoradas.length === 0 && <FilaVacia cols={3} mensaje="Ninguna unidad supera los 60 días. Bien ahí." />}
              {demoradas.map((v: any) => {
                const a = ALERTAS[v.alerta] || ALERTAS.verde;
                return (
                  <tr key={v.id} className="hover:bg-[var(--c-hover)]">
                    <TD>
                      <Link href={`/vehiculos/${v.id}`} className="hover:text-[var(--c-primario)]">
                        <div className="font-medium">{v.marca} {v.modelo}</div>
                        <div className="text-[11.5px] text-[var(--c-tinta-tenue)]">{dominio(v.dominio)} · {v.anio}</div>
                      </Link>
                    </TD>
                    <TD alinear="right"><Chip tono={a.tono}>{v.dias_stock} días</Chip></TD>
                    {costos && <TD alinear="right" className="text-[var(--c-tinta-media)]">{plataCorta(v.costo_total)}</TD>}
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        </Panel>

        {/* --------------------------------------------------------- próximas acciones */}
        <Panel padding={false}>
          <div className="p-5 pb-0">
            <PanelTitulo titulo="Próximas acciones" detalle="Leads que hay que seguir"
              accion={<Link href="/leads" className="text-[12.5px] text-[var(--c-primario)] hover:underline">Ver leads</Link>} />
          </div>
          <Tabla className="border-0 rounded-none bg-transparent">
            <tbody>
              {acciones.length === 0 && <FilaVacia cols={3} mensaje="No hay acciones pendientes cargadas." />}
              {acciones.map((l: any) => {
                const vencida = new Date(l.fecha_proxima) < new Date(new Date().toDateString());
                return (
                  <tr key={l.id} className="hover:bg-[var(--c-hover)]">
                    <TD>
                      <Link href={`/leads/${l.id}`} className="hover:text-[var(--c-primario)]">
                        <div className="font-medium">{l.nombre}</div>
                        <div className="text-[11.5px] text-[var(--c-tinta-tenue)] truncate max-w-[220px]">
                          {l.proxima_accion || "Sin acción definida"}
                        </div>
                      </Link>
                    </TD>
                    <TD alinear="right">
                      <Chip tono={vencida ? "rojo" : "azul"}>{fecha(l.fecha_proxima)}</Chip>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        </Panel>
      </div>
    </>
  );
}
