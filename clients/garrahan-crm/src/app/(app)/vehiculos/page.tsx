import Link from "next/link";
import { Plus, Search, Wrench, Receipt } from "lucide-react";
import { sql } from "@/lib/db";
import { requiereSesion, veCostos } from "@/lib/auth";
import { plata, plataCorta, numero, km as fkm, dominio, porcentaje } from "@/lib/format";
import { ESTADOS_VEHICULO, ALERTAS } from "@/lib/constantes";
import {
  Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, THOrden, TD, FilaVacia, Boton,
} from "@/components/ui";
import Exportar from "@/components/exportar";
import { sucursalActiva } from "@/lib/sucursal";
import AtajoBuscar from "@/components/atajo-buscar";

export const dynamic = "force-dynamic";

const TABS = [
  { valor: "activos",   label: "Activos" },
  { valor: "reservado", label: "Reservados" },
  { valor: "en_taller", label: "En taller" },
  { valor: "vendido",   label: "Vendidos" },
  { valor: "baja",      label: "Dados de baja" },
  { valor: "todos",     label: "Todos" },
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
    const s = new URLSearchParams({ tab, q, sucursal, alerta, inversor, propiedad, orden, dir, ...cambios });
    for (const [k, v] of [...s.entries()]) if (!v) s.delete(k);
    return `/vehiculos?${s.toString()}`;
  };
  const ordenar = (campo: string, d: string) => link({ orden: campo, dir: d });

  return (
    <>
      <Encabezado
        titulo="Vehículos"
        detalle="El inventario, el estado y la rentabilidad de cada unidad."
        acciones={<><Exportar que="vehiculos" /><Boton href="/vehiculos/nuevo"><Plus size={15} /> Nuevo vehículo</Boton></>}
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
      <div className="flex flex-wrap items-center gap-1.5 mt-6 mb-3">
        {TABS.map((t) => (
          <Link key={t.valor} href={link({ tab: t.valor })}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors
              ${tab === t.valor ? "bg-[#1b2433] text-[#e8edf5]" : "text-[#9aa7b8] hover:bg-[#151d29]"}`}>
            {t.label}
            <span className="ml-1.5 text-[11px] text-[#64748b] tabular">{(c as any)[t.valor] ?? 0}</span>
          </Link>
        ))}
      </div>

      {/* ---------------------------------------------------------- filtros */}
      <AtajoBuscar />
      <form className="flex flex-wrap gap-2 mb-3" action="/vehiculos">
        <input type="hidden" name="tab" value={tab} />
        <input type="hidden" name="orden" value={orden} />
        <input type="hidden" name="dir" value={dir} />
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
      <Tabla>
        <thead>
          <tr>
            <THOrden campo="dominio" actual={orden} dir={dir} href={ordenar}>Dominio</THOrden>
            <THOrden campo="vehiculo" actual={orden} dir={dir} href={ordenar}>Vehículo</THOrden>
            <THOrden campo="anio" actual={orden} dir={dir} href={ordenar} alinear="right">Año</THOrden>
            <THOrden campo="km" actual={orden} dir={dir} href={ordenar} alinear="right">Kilometraje</THOrden>
            {costos && <THOrden campo="costos" actual={orden} dir={dir} href={ordenar} alinear="right">Costos</THOrden>}
            {costos && <THOrden campo="invertido" actual={orden} dir={dir} href={ordenar} alinear="right">Total invertido</THOrden>}
            <THOrden campo="precio" actual={orden} dir={dir} href={ordenar} alinear="right">Precio venta</THOrden>
            {costos && <THOrden campo="margen" actual={orden} dir={dir} href={ordenar} alinear="right">Margen</THOrden>}
            <THOrden campo="dias" actual={orden} dir={dir} href={ordenar} alinear="center">Días</THOrden>
            <THOrden campo="ubicacion" actual={orden} dir={dir} href={ordenar}>Ubicación</THOrden>
            <THOrden campo="estado" actual={orden} dir={dir} href={ordenar}>Estado</THOrden>
            <TH></TH>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <FilaVacia cols={costos ? 12 : 8}
              mensaje={q ? `No hay unidades que coincidan con "${q}".` : "No hay unidades en esta vista."} />
          )}
          {filas.map((v: any) => {
            const e = ESTADOS_VEHICULO[v.estado] || { label: v.estado, tono: "gris" as const };
            const a = v.alerta ? ALERTAS[v.alerta] : null;
            return (
              <tr key={v.id} className="hover:bg-[#151d29] group">
                <TD>
                  <Link href={`/vehiculos/${v.id}`} className="font-semibold text-[#60a5fa] hover:underline">
                    {dominio(v.dominio) === "—" ? "0km" : dominio(v.dominio)}
                  </Link>
                </TD>
                <TD>
                  <Link href={`/vehiculos/${v.id}`} className="hover:text-[#2f6bff]">
                    <div className="font-medium">{v.marca} {v.modelo}</div>
                    {v.version && <div className="text-[11.5px] text-[#64748b]">{v.version}</div>}
                  </Link>
                </TD>
                <TD alinear="right" className="text-[#9aa7b8]">{v.anio || "—"}</TD>
                <TD alinear="right" className="text-[#9aa7b8]">{fkm(v.km)}</TD>
                {costos && <TD alinear="right" className="text-[#9aa7b8]">{Number(v.costos) > 0 ? plata(v.costos) : "—"}</TD>}
                {costos && <TD alinear="right" className="font-medium">{plata(v.costo_total)}</TD>}
                <TD alinear="right">{Number(v.precio_venta) > 0 ? plata(v.precio_venta) : "—"}</TD>
                {costos && (
                  <TD alinear="right">
                    {Number(v.precio_venta) > 0 ? (
                      <span className={Number(v.margen) >= 0 ? "text-[#22c55e]" : "text-[#f87171]"}>
                        {porcentaje(v.margen_pct)}
                      </span>
                    ) : "—"}
                  </TD>
                )}
                <TD alinear="center">
                  {a ? <Chip tono={a.tono}>{v.dias_stock}</Chip>
                     : <span className="text-[#64748b]">—</span>}
                </TD>
                <TD className="text-[#9aa7b8]">
                  {v.sucursal || "—"}
                  {v.propiedad !== "propia" && (
                    <div className="text-[11px] mt-0.5"
                      style={{ color: v.propiedad === "consignacion" ? "#38bdf8" : "#c084fc" }}>
                      {v.propiedad === "consignacion" ? "En consignación" : v.inversor || "De un inversor"}
                    </div>
                  )}
                </TD>
                <TD><Chip tono={e.tono}>{e.label}</Chip></TD>
                <TD alinear="right">
                  {/* Siempre visibles, no solo al pasar el mouse: una acción que
                      hay que descubrir moviendo el cursor es una acción que no existe. */}
                  {!["vendido", "baja"].includes(v.estado) && (
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
                  )}
                </TD>
              </tr>
            );
          })}
        </tbody>
      </Tabla>

      {filas.length >= 300 && (
        <p className="text-[12px] text-[#64748b] mt-3">Mostrando las primeras 300 unidades. Afiná la búsqueda para ver el resto.</p>
      )}
    </>
  );
}
