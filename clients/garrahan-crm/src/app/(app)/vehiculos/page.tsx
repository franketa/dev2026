import Link from "next/link";
import { Plus, Search, Wrench, Receipt, Columns3, LayoutGrid, Table2 } from "lucide-react";
import { sql } from "@/lib/db";
import { requiereSesion, veCostos } from "@/lib/auth";
import { plata, plataCorta, numero, km as fkm, dominio, porcentaje } from "@/lib/format";
import { ESTADOS_VEHICULO, ALERTAS } from "@/lib/constantes";
import {
  Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, THOrden, TD, FilaVacia, Boton, Panel,
} from "@/components/ui";
import Exportar from "@/components/exportar";
import ImprimirListado from "@/components/imprimir-listado";
import AtajoBuscar from "@/components/atajo-buscar";
import { sucursalActiva } from "@/lib/sucursal";

export const dynamic = "force-dynamic";

const TABS = [
  { valor: "activos",   label: "Activos" },
  { valor: "reservado", label: "Reservados" },
  { valor: "en_taller", label: "En taller" },
  { valor: "vendido",   label: "Vendidos" },
  { valor: "baja",      label: "Dados de baja" },
  { valor: "todos",     label: "Todos" },
];

/**
 * Las columnas de la tabla, en un solo lugar: de acá salen el encabezado, las
 * celdas y el selector de columnas. Definirlas dos veces es garantía de que
 * tarde o temprano se desalineen.
 *
 * `plata: true` marca las que solo ve quien tiene permiso de costos.
 */
const COLUMNAS = [
  { clave: "dominio",   label: "Dominio",        orden: "dominio",   alinear: "left" as const },
  { clave: "vehiculo",  label: "Vehículo",       orden: "vehiculo",  alinear: "left" as const, fija: true },
  { clave: "anio",      label: "Año",            orden: "anio",      alinear: "right" as const },
  { clave: "km",        label: "Kilometraje",    orden: "km",        alinear: "right" as const },
  { clave: "costos",    label: "Costos",         orden: "costos",    alinear: "right" as const, plata: true },
  { clave: "invertido", label: "Total invertido",orden: "invertido", alinear: "right" as const, plata: true },
  { clave: "precio",    label: "Precio venta",   orden: "precio",    alinear: "right" as const },
  { clave: "margen",    label: "Margen",         orden: "margen",    alinear: "right" as const, plata: true },
  { clave: "dias",      label: "Días",           orden: "dias",      alinear: "center" as const },
  { clave: "ubicacion", label: "Ubicación",      orden: "ubicacion", alinear: "left" as const },
  { clave: "estado",    label: "Estado",         orden: "estado",    alinear: "left" as const },
];

export default async function Vehiculos({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requiereSesion();
  const costos = veCostos(u);
  const p = await searchParams;
  const tab = p.tab || "activos";
  const q = (p.q || "").trim();
  const sucursal = p.sucursal || "";
  const alerta = p.alerta || "";
  const inversor = p.inversor || "";
  const propiedad = p.propiedad || "";
  const vista = p.vista === "tarjetas" ? "tarjetas" : "tabla";

  // Columnas visibles. Sin parámetro se muestran todas las que el rol permite.
  const permitidas = COLUMNAS.filter((c) => !c.plata || costos);
  const pedidas = (p.cols || "").split(",").filter(Boolean);
  const visibles = pedidas.length
    ? permitidas.filter((c) => c.fija || pedidas.includes(c.clave))
    : permitidas;

  // Lista blanca: el nombre de la columna va a parar al ORDER BY, así que no
  // puede salir de la URL sin pasar por acá.
  const ORDENABLES: Record<string, string> = {
    dominio: "dominio", vehiculo: "marca", anio: "anio", km: "km",
    costos: "costos", invertido: "costo_total", precio: "precio_venta",
    margen: "margen_pct", dias: "dias_stock", ubicacion: "sucursal", estado: "estado",
  };
  const orden = ORDENABLES[p.orden] ? p.orden : "dias";
  const columna = ORDENABLES[orden];
  const dir = p.dir === "asc" ? "asc" : "desc";

  // La sucursal del menú manda salvo que el listado tenga su propio filtro puesto.
  const global = await sucursalActiva();
  const filtroSucursal = sucursal ? Number(sucursal) : global;

  // ------------------------------------------------------------- filtros
  const donde: any[] = [];
  if (tab === "activos") donde.push(sql`estado NOT IN ('vendido','baja')`);
  else if (tab !== "todos") donde.push(sql`estado = ${tab}`);
  if (q) donde.push(sql`(dominio ILIKE ${"%" + q + "%"} OR marca ILIKE ${"%" + q + "%"} OR modelo ILIKE ${"%" + q + "%"})`);
  if (filtroSucursal) donde.push(sql`sucursal_id = ${filtroSucursal}`);
  if (alerta) donde.push(sql`alerta = ${alerta}`);
  if (inversor === "sin") donde.push(sql`inversor_id IS NULL`);
  else if (inversor) donde.push(sql`inversor_id = ${Number(inversor)}`);
  if (propiedad) donde.push(sql`propiedad = ${propiedad}`);

  const where = donde.length
    ? donde.reduce((acc, cur, i) => (i === 0 ? sql`WHERE ${cur}` : sql`${acc} AND ${cur}`), sql``)
    : sql``;

  // Los KPIs y los contadores de las pestañas miran la misma sucursal que la
  // tabla. Si no, muestran un total que no se corresponde con lo que se ve.
  const soloSuc = filtroSucursal ? sql`AND sucursal_id = ${filtroSucursal}` : sql``;
  const soloSucWhere = filtroSucursal ? sql`WHERE sucursal_id = ${filtroSucursal}` : sql``;

  const [filas, resumen, sucursales, conteos, inversores] = await Promise.all([
    sql`SELECT * FROM v_vehiculos ${where}
        ORDER BY ${sql(columna)} ${dir === "asc" ? sql`ASC` : sql`DESC`} NULLS LAST
        LIMIT 300`,
    // "capital" y no "costo_total": una unidad en consignación no se compró,
    // así que lo único puesto ahí es la preparación.
    sql`SELECT count(*)::int AS n, COALESCE(SUM(capital),0) AS capital,
               COALESCE(SUM(precio_venta),0) AS venta,
               COALESCE(AVG(NULLIF(margen_pct,0)),0) AS margen,
               COALESCE(AVG(dias_stock),0) AS dias,
               count(*) FILTER (WHERE propiedad = 'consignacion')::int AS consig,
               count(*) FILTER (WHERE propiedad = 'inversor')::int AS de_inversor
        FROM v_vehiculos WHERE estado NOT IN ('vendido','baja') ${soloSuc}`,
    sql`SELECT id, nombre FROM sucursales WHERE activa ORDER BY nombre`,
    sql`SELECT
          count(*) FILTER (WHERE estado NOT IN ('vendido','baja'))::int AS activos,
          count(*) FILTER (WHERE estado = 'reservado')::int AS reservado,
          count(*) FILTER (WHERE estado = 'en_taller')::int AS en_taller,
          count(*) FILTER (WHERE estado = 'vendido')::int AS vendido,
          count(*) FILTER (WHERE estado = 'baja')::int AS baja,
          count(*)::int AS todos
        FROM vehiculos ${soloSucWhere}`,
    sql`SELECT id, nombre FROM inversores WHERE activo ORDER BY nombre`,
  ]);

  const r = resumen[0] || {};
  const c = conteos[0] || {};
  const demoradas = filas.filter((v: any) => v.alerta === "naranja" || v.alerta === "rojo").length;

  const link = (cambios: Record<string, string>) => {
    const s = new URLSearchParams({
      tab, q, sucursal, alerta, inversor, propiedad, orden, dir,
      vista: vista === "tarjetas" ? "tarjetas" : "",
      cols: pedidas.join(","), ...cambios,
    });
    for (const [k, v] of [...s.entries()]) if (!v) s.delete(k);
    return `/vehiculos?${s.toString()}`;
  };
  const ordenar = (campo: string, d: string) => link({ orden: campo, dir: d });

  /** Qué va en cada celda. Un solo lugar, lo usan la tabla y las tarjetas. */
  const celda = (v: any, clave: string) => {
    const e = ESTADOS_VEHICULO[v.estado] || { label: v.estado, tono: "gris" as const };
    const a = v.alerta ? ALERTAS[v.alerta] : null;
    switch (clave) {
      case "dominio":
        return (
          <Link href={`/vehiculos/${v.id}`} className="font-semibold text-[#60a5fa] hover:underline">
            {dominio(v.dominio) === "—" ? "0km" : dominio(v.dominio)}
          </Link>
        );
      case "vehiculo":
        return (
          <Link href={`/vehiculos/${v.id}`} className="hover:text-[#2f6bff]">
            <div className="font-medium">{v.marca} {v.modelo}</div>
            {v.version && <div className="text-[11.5px] text-[#64748b]">{v.version}</div>}
          </Link>
        );
      case "anio": return <span className="text-[#9aa7b8]">{v.anio || "—"}</span>;
      case "km": return <span className="text-[#9aa7b8]">{fkm(v.km)}</span>;
      case "costos": return <span className="text-[#9aa7b8]">{Number(v.costos) > 0 ? plata(v.costos) : "—"}</span>;
      case "invertido": return <span className="font-medium">{plata(v.costo_total)}</span>;
      case "precio": return Number(v.precio_venta) > 0 ? plata(v.precio_venta) : "—";
      case "margen":
        return Number(v.precio_venta) > 0 ? (
          <span className={Number(v.margen) >= 0 ? "text-[#22c55e]" : "text-[#f87171]"}>
            {porcentaje(v.margen_pct)}
          </span>
        ) : "—";
      case "dias":
        return a ? <Chip tono={a.tono}>{v.dias_stock}</Chip> : <span className="text-[#64748b]">—</span>;
      case "ubicacion":
        return (
          <span className="text-[#9aa7b8]">
            {v.sucursal || "—"}
            {v.propiedad !== "propia" && (
              <span className="block text-[11px] mt-0.5"
                style={{ color: v.propiedad === "consignacion" ? "#38bdf8" : "#c084fc" }}>
                {v.propiedad === "consignacion" ? "En consignación" : v.inversor || "De un inversor"}
              </span>
            )}
          </span>
        );
      case "estado": return <Chip tono={e.tono}>{e.label}</Chip>;
      default: return null;
    }
  };

  const acciones = (v: any) =>
    !["vendido", "baja"].includes(v.estado) ? (
      <span className="inline-flex items-center gap-1.5">
        <Link href={`/taller/nueva?vehiculo=${v.id}`} title="Mandar al taller"
          className="inline-flex items-center gap-1.5 rounded-md border border-[#9a3412]
            bg-[#2c1405] px-2 py-1 text-[11.5px] text-[#fb923c]
            hover:bg-[#3d1c07] transition-colors whitespace-nowrap">
          <Wrench size={12} /> Al taller
        </Link>
        <Link href={`/ventas/nueva?vehiculo=${v.id}`} title="Crear venta de esta unidad"
          className="inline-flex items-center gap-1.5 rounded-md border border-[#1e3a8a]
            bg-[#0a1b3d] px-2 py-1 text-[11.5px] text-[#60a5fa]
            hover:bg-[#0e2452] transition-colors whitespace-nowrap">
          <Receipt size={12} /> Vender
        </Link>
      </span>
    ) : null;

  return (
    <>
      <Encabezado
        titulo="Vehículos"
        detalle="El inventario, el estado y la rentabilidad de cada unidad."
        acciones={
          <>
            <ImprimirListado />
            <Exportar que="vehiculos" />
            <Boton href="/vehiculos/nuevo"><Plus size={15} /> Nuevo vehículo</Boton>
          </>
        }
      />

      <GrillaKPI>
        <KPI label="Unidades activas" valor={numero(r.n)} detalle="en el predio" />
        {costos && <KPI label="Capital inmovilizado" valor={plataCorta(r.capital)}
                        detalle={Number(r.consig) > 0
                          ? `${numero(r.consig)} en consignación no suman`
                          : "plata de la agencia parada"} />}
        {costos && <KPI label="Margen potencial" valor={plataCorta(Number(r.venta) - Number(r.capital))}
                        detalle={porcentaje(r.margen) + " promedio"} />}
        <KPI label="Promedio en playón" valor={`${Math.round(Number(r.dias))} días`}
             detalle={demoradas > 0 ? `${demoradas} con más de 60` : "todo al día"}
             tono={demoradas > 0 ? "naranja" : "verde"} />
      </GrillaKPI>

      {/* ------------------------------------------------------------ tabs */}
      <div className="no-imprimir flex flex-wrap items-center gap-1.5 mt-6 mb-3">
        {TABS.map((t) => (
          <Link key={t.valor} href={link({ tab: t.valor })}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors
              ${tab === t.valor ? "bg-[#1b2433] text-[#e8edf5]" : "text-[#9aa7b8] hover:bg-[#151d29]"}`}>
            {t.label}
            <span className="ml-1.5 text-[11px] text-[#64748b] tabular">{(c as any)[t.valor] ?? 0}</span>
          </Link>
        ))}

        <div className="ml-auto flex items-center gap-1.5">
          {/* --------------------------------------------- selector de columnas */}
          {vista === "tabla" && (
            <details className="relative">
              <summary className="cursor-pointer list-none inline-flex items-center gap-1.5
                rounded-lg border border-[#1f2937] bg-[#111721] px-3 py-1.5
                text-[12.5px] text-[#cbd5e1] hover:border-[#334155] transition-colors">
                <Columns3 size={14} /> Columnas
                <span className="text-[#64748b] tabular">{visibles.length}</span>
              </summary>
              <form action="/vehiculos" className="absolute right-0 z-20 mt-2 w-[230px] p-3
                bg-[#111721] border border-[#1f2937] rounded-xl shadow-2xl">
                {["tab", "q", "sucursal", "alerta", "inversor", "propiedad", "orden", "dir"].map((k) => (
                  <input key={k} type="hidden" name={k}
                    value={{ tab, q, sucursal, alerta, inversor, propiedad, orden, dir }[k] as string} />
                ))}
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {permitidas.map((col) => (
                    <label key={col.clave}
                      className={`flex items-center gap-2.5 text-[12.5px] cursor-pointer
                        ${col.fija ? "text-[#64748b]" : "text-[#cbd5e1]"}`}>
                      <input type="checkbox" name="cols" value={col.clave}
                        defaultChecked={visibles.some((x) => x.clave === col.clave)}
                        disabled={col.fija}
                        className="h-3.5 w-3.5 accent-[#2f6bff]" />
                      {col.label}
                      {col.fija && <span className="text-[10.5px]">(siempre)</span>}
                    </label>
                  ))}
                </div>
                <button type="submit" className="mt-3 w-full rounded-lg bg-[#2f6bff]
                  hover:bg-[#4d81ff] py-1.5 text-[12.5px] font-semibold text-white transition-colors">
                  Aplicar
                </button>
              </form>
            </details>
          )}

          {/* ------------------------------------------------- tabla o tarjetas */}
          <div className="flex rounded-lg border border-[#1f2937] bg-[#111721] overflow-hidden">
            {[
              ["tabla", Table2, "Ver como tabla"],
              ["tarjetas", LayoutGrid, "Ver como tarjetas"],
            ].map(([v, Ico, titulo]: any) => (
              <Link key={v} href={link({ vista: v === "tabla" ? "" : v })} title={titulo}
                className={`px-2.5 py-2 transition-colors
                  ${vista === v ? "bg-[#1b2433] text-[#e8edf5]" : "text-[#64748b] hover:text-[#cbd5e1]"}`}>
                <Ico size={15} />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------- filtros */}
      <AtajoBuscar />
      <form className="no-imprimir flex flex-wrap gap-2 mb-3" action="/vehiculos">
        <input type="hidden" name="tab" value={tab} />
        <input type="hidden" name="orden" value={orden} />
        <input type="hidden" name="dir" value={dir} />
        {vista === "tarjetas" && <input type="hidden" name="vista" value="tarjetas" />}
        {pedidas.map((c) => <input key={c} type="hidden" name="cols" value={c} />)}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b]" />
          <input name="q" defaultValue={q} placeholder="Buscar por dominio, marca o modelo…"
            className="campo pl-9 pr-9" />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10.5px] px-1.5 py-0.5
            rounded border border-[#1f2937] bg-[#0d131c] text-[#475569] pointer-events-none">/</kbd>
        </div>
        <select name="sucursal" defaultValue={sucursal} className="campo w-auto min-w-[160px]">
          <option value="">Todas las sucursales</option>
          {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select name="alerta" defaultValue={alerta} className="campo w-auto min-w-[150px]">
          <option value="">Todas las antigüedades</option>
          <option value="verde">Hasta 30 días</option>
          <option value="amarillo">Más de 30 días</option>
          <option value="naranja">Más de 60 días</option>
          <option value="rojo">Más de 90 días</option>
        </select>
        {costos && (
          <select name="inversor" defaultValue={inversor} className="campo w-auto min-w-[160px]">
            <option value="">Todos los inversores</option>
            <option value="sin">Sin inversor (de la agencia)</option>
            {inversores.map((i: any) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </select>
        )}
        <select name="propiedad" defaultValue={propiedad} className="campo w-auto min-w-[150px]">
          <option value="">Propias y de terceros</option>
          <option value="propia">Solo propias</option>
          <option value="inversor">De inversores</option>
          <option value="consignacion">En consignación</option>
        </select>
        <Boton tipo="submit" variante="suave">Filtrar</Boton>
      </form>

      {/* ----------------------------------------------------------- tabla */}
      {vista === "tabla" ? (
        <Tabla className="apaisado">
          <thead>
            <tr>
              {visibles.map((col) => (
                <THOrden key={col.clave} campo={col.orden} actual={orden} dir={dir}
                  href={ordenar} alinear={col.alinear}>{col.label}</THOrden>
              ))}
              <TH></TH>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <FilaVacia cols={visibles.length + 1}
                mensaje={q ? `No hay unidades que coincidan con "${q}".` : "No hay unidades en esta vista."} />
            )}
            {filas.map((v: any) => (
              <tr key={v.id} className="hover:bg-[#151d29]">
                {visibles.map((col) => (
                  <TD key={col.clave} alinear={col.alinear}>{celda(v, col.clave)}</TD>
                ))}
                <TD alinear="right" className="no-imprimir">{acciones(v)}</TD>
              </tr>
            ))}
          </tbody>
        </Tabla>
      ) : (
        /* --------------------------------------------------------- tarjetas */
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filas.length === 0 && (
            <Panel className="sm:col-span-2 xl:col-span-3">
              <p className="text-[13px] text-[#64748b] py-10 text-center">
                {q ? `No hay unidades que coincidan con "${q}".` : "No hay unidades en esta vista."}
              </p>
            </Panel>
          )}
          {filas.map((v: any) => {
            const e = ESTADOS_VEHICULO[v.estado] || { label: v.estado, tono: "gris" as const };
            const a = v.alerta ? ALERTAS[v.alerta] : null;
            return (
              <Panel key={v.id} className="hover:border-[#334155] transition-colors">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <Link href={`/vehiculos/${v.id}`}
                      className="font-semibold text-[14px] hover:text-[#2f6bff] block truncate">
                      {v.marca} {v.modelo}
                    </Link>
                    <div className="text-[11.5px] text-[#64748b] truncate">
                      {v.version || "—"} · {v.anio || "s/año"} · {fkm(v.km)}
                    </div>
                  </div>
                  <Chip tono={e.tono}>{e.label}</Chip>
                </div>

                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <Link href={`/vehiculos/${v.id}`}
                    className="text-[12.5px] font-semibold text-[#60a5fa] hover:underline">
                    {dominio(v.dominio) === "—" ? "0 km" : dominio(v.dominio)}
                  </Link>
                  <span className="text-[16px] font-semibold tabular">
                    {Number(v.precio_venta) > 0 ? plata(v.precio_venta) : "Sin precio"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#1f2937]">
                  <span className="text-[11.5px] text-[#64748b] truncate">
                    {v.sucursal || "Sin sucursal"}
                    {v.propiedad === "consignacion" && (
                      <span className="text-[#38bdf8]"> · En consignación</span>
                    )}
                    {v.propiedad === "inversor" && (
                      <span className="text-[#c084fc]"> · {v.inversor}</span>
                    )}
                    {v.propiedad === "propia" && v.inversor && (
                      <span> · {v.inversor}</span>
                    )}
                  </span>
                  {a && <Chip tono={a.tono}>{v.dias_stock} días</Chip>}
                </div>

                {costos && Number(v.precio_venta) > 0 && (
                  <div className="flex items-center justify-between gap-3 mt-2 text-[12px]">
                    <span className="text-[#64748b]">Margen</span>
                    <span className={Number(v.margen) >= 0 ? "text-[#22c55e]" : "text-[#f87171]"}>
                      {plata(v.margen)} · {porcentaje(v.margen_pct)}
                    </span>
                  </div>
                )}

                <div className="mt-3 no-imprimir">{acciones(v)}</div>
              </Panel>
            );
          })}
        </div>
      )}

      {filas.length >= 300 && (
        <p className="text-[12px] text-[#64748b] mt-3">Mostrando las primeras 300 unidades. Afiná la búsqueda para ver el resto.</p>
      )}
    </>
  );
}
