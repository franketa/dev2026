import Link from "next/link";
import { Plus, Search, Wrench } from "lucide-react";
import { sql } from "@/lib/db";
import { requiereSesion, veCostos } from "@/lib/auth";
import { plata, plataCorta, numero, km as fkm, dominio, porcentaje } from "@/lib/format";
import { ESTADOS_VEHICULO, ALERTAS } from "@/lib/constantes";
import {
  Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Boton,
} from "@/components/ui";

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

  // ------------------------------------------------------------- filtros
  const donde: any[] = [];
  if (tab === "activos") donde.push(sql`estado NOT IN ('vendido','baja')`);
  else if (tab !== "todos") donde.push(sql`estado = ${tab}`);
  if (q) donde.push(sql`(dominio ILIKE ${"%" + q + "%"} OR marca ILIKE ${"%" + q + "%"} OR modelo ILIKE ${"%" + q + "%"})`);
  if (sucursal) donde.push(sql`sucursal_id = ${Number(sucursal)}`);
  if (alerta) donde.push(sql`alerta = ${alerta}`);

  const where = donde.length
    ? donde.reduce((acc, cur, i) => (i === 0 ? sql`WHERE ${cur}` : sql`${acc} AND ${cur}`), sql``)
    : sql``;

  const [filas, resumen, sucursales, conteos] = await Promise.all([
    sql`SELECT * FROM v_vehiculos ${where} ORDER BY dias_stock DESC NULLS LAST LIMIT 300`,
    sql`SELECT count(*)::int AS n, COALESCE(SUM(costo_total),0) AS capital,
               COALESCE(SUM(precio_venta),0) AS venta,
               COALESCE(AVG(NULLIF(margen_pct,0)),0) AS margen,
               COALESCE(AVG(dias_stock),0) AS dias
        FROM v_vehiculos WHERE estado NOT IN ('vendido','baja')`,
    sql`SELECT id, nombre FROM sucursales WHERE activa ORDER BY nombre`,
    sql`SELECT
          count(*) FILTER (WHERE estado NOT IN ('vendido','baja'))::int AS activos,
          count(*) FILTER (WHERE estado = 'reservado')::int AS reservado,
          count(*) FILTER (WHERE estado = 'en_taller')::int AS en_taller,
          count(*) FILTER (WHERE estado = 'vendido')::int AS vendido,
          count(*) FILTER (WHERE estado = 'baja')::int AS baja,
          count(*)::int AS todos
        FROM vehiculos`,
  ]);

  const r = resumen[0] || {};
  const c = conteos[0] || {};
  const demoradas = filas.filter((v: any) => v.alerta === "naranja" || v.alerta === "rojo").length;

  const link = (cambios: Record<string, string>) => {
    const s = new URLSearchParams({ tab, q, sucursal, alerta, ...cambios });
    for (const [k, v] of [...s.entries()]) if (!v) s.delete(k);
    return `/vehiculos?${s.toString()}`;
  };

  return (
    <>
      <Encabezado
        titulo="Vehículos"
        detalle="El inventario, el estado y la rentabilidad de cada unidad."
        acciones={<Boton href="/vehiculos/nuevo"><Plus size={15} /> Nuevo vehículo</Boton>}
      />

      <GrillaKPI>
        <KPI label="Unidades activas" valor={numero(r.n)} detalle="en el predio" />
        {costos && <KPI label="Capital inmovilizado" valor={plataCorta(r.capital)} detalle="costo real del stock" />}
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
      <form className="flex flex-wrap gap-2 mb-3" action="/vehiculos">
        <input type="hidden" name="tab" value={tab} />
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b]" />
          <input name="q" defaultValue={q} placeholder="Buscar por dominio, marca o modelo…"
            className="campo pl-9" />
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
        <Boton tipo="submit" variante="suave">Filtrar</Boton>
      </form>

      {/* ----------------------------------------------------------- tabla */}
      <Tabla>
        <thead>
          <tr>
            <TH>Dominio</TH>
            <TH>Vehículo</TH>
            <TH alinear="right">Año</TH>
            <TH alinear="right">Kilometraje</TH>
            {costos && <TH alinear="right">Costos</TH>}
            {costos && <TH alinear="right">Total invertido</TH>}
            <TH alinear="right">Precio venta</TH>
            {costos && <TH alinear="right">Margen</TH>}
            <TH alinear="center">Días</TH>
            <TH>Ubicación</TH>
            <TH>Estado</TH>
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
                <TD className="text-[#9aa7b8]">{v.sucursal || "—"}</TD>
                <TD><Chip tono={e.tono}>{e.label}</Chip></TD>
                <TD alinear="right">
                  {!["vendido", "baja"].includes(v.estado) && (
                    <Link href={`/taller/nueva?vehiculo=${v.id}`}
                      className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1.5
                        rounded-md border border-[#9a3412] bg-[#2c1405] px-2 py-1
                        text-[11.5px] text-[#fb923c] transition-opacity whitespace-nowrap">
                      <Wrench size={12} /> Al taller
                    </Link>
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
