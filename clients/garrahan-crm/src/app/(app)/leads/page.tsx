import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Plus, Search, Globe, MessageCircle, Instagram, Facebook, Phone, Users, Store } from "lucide-react";
import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { plata, fecha, numero } from "@/lib/format";
import { ESTADOS_LEAD, ETAPAS_LEAD, ORIGENES_LEAD } from "@/lib/constantes";
import { Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Boton, Etapas } from "@/components/ui";
import Exportar from "@/components/exportar";
import SelectEstado from "@/components/select-estado";

export const dynamic = "force-dynamic";

const ICONO_ORIGEN: Record<string, any> = {
  web: Globe, whatsapp: MessageCircle, instagram: Instagram, facebook: Facebook,
  telefono: Phone, referido: Users, showroom: Store, portal: Globe,
};

export default async function Leads({ searchParams }: { searchParams: Promise<any> }) {
  await requiereSesion();
  const p = await searchParams;
  const estado = p.estado || "";
  const q = (p.q || "").trim();

  const donde: any[] = [];
  if (estado) donde.push(sql`l.estado = ${estado}`);
  if (q) donde.push(sql`(l.nombre ILIKE ${"%" + q + "%"} OR l.telefono ILIKE ${"%" + q + "%"}
                         OR l.vehiculo_texto ILIKE ${"%" + q + "%"})`);
  const where = donde.length
    ? donde.reduce((a, c, i) => (i === 0 ? sql`WHERE ${c}` : sql`${a} AND ${c}`), sql``)
    : sql``;

  const [filas, resumen, asesores] = await Promise.all([
    sql`SELECT l.*, us.nombre AS asesor, v.dominio, v.marca, v.modelo
        FROM leads l
        LEFT JOIN usuarios us ON us.id = l.asesor_id
        LEFT JOIN vehiculos v ON v.id = l.vehiculo_id
        ${where}
        ORDER BY (l.fecha_proxima IS NULL), l.fecha_proxima ASC, l.creado_en DESC
        LIMIT 200`,
    sql`SELECT count(*)::int AS total,
               count(*) FILTER (WHERE estado = 'nuevo')::int AS nuevos,
               count(*) FILTER (WHERE estado IN ('contactado','calificado','visita_agendada','en_negociacion'))::int AS gestion,
               count(*) FILTER (WHERE estado IN ('vendido','perdido','postergado'))::int AS cerrados,
               count(*) FILTER (WHERE fecha_proxima < current_date
                                AND estado NOT IN ('vendido','perdido','postergado'))::int AS vencidos
        FROM leads`,
    sql`SELECT id, nombre FROM usuarios WHERE activo ORDER BY nombre`,
  ]);

  const r = resumen[0] || {};

  async function cambiarEstado(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    const id = Number(fd.get("id"));
    const nuevo = String(fd.get("estado"));
    const etapa = ESTADOS_LEAD[nuevo]?.etapa || "captacion";
    await sql`UPDATE leads SET estado = ${nuevo}, etapa = ${etapa}, actualizado_en = now() WHERE id = ${id}`;
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'lead', ${id}, 'estado', ${nuevo})`;
    revalidatePath("/leads");
  }

  return (
    <>
      <Encabezado titulo="Leads" detalle="De la consulta al cierre. Cada uno con responsable y próxima acción."
        acciones={<><Exportar que="leads" /><Boton href="/leads/nuevo"><Plus size={15} /> Nuevo lead</Boton></>} />

      <GrillaKPI>
        <KPI label="Leads visibles" valor={numero(r.total)} />
        <KPI label="Nuevos" valor={numero(r.nuevos)} tono="azul" detalle="sin contactar" />
        <KPI label="En gestión" valor={numero(r.gestion)} tono="amarillo" />
        <KPI label="Acciones vencidas" valor={numero(r.vencidos)} tono={Number(r.vencidos) > 0 ? "rojo" : "verde"}
             detalle={Number(r.vencidos) > 0 ? "hay que llamar" : "todo al día"} />
      </GrillaKPI>

      {/* ------------------------------------------------ filtros por etapa */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-6 mb-3">
        <Link href="/leads" className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium
          ${!estado ? "bg-[#2f6bff] text-white" : "bg-[#1b2433] text-[#9aa7b8] hover:bg-[#232e40]"}`}>Todos</Link>
        {ETAPAS_LEAD.map((et) => (
          <div key={et.valor} className="flex items-center gap-1.5">
            <span className="etiqueta">{et.label}</span>
            {et.estados.map((es) => {
              const e = ESTADOS_LEAD[es];
              return (
                <Link key={es} href={`/leads?estado=${es}`}
                  className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors
                    ${estado === es ? "bg-[#2f6bff] text-white" : "bg-[#151d29] text-[#9aa7b8] hover:bg-[#1b2433]"}`}>
                  {e.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <form action="/leads" className="flex gap-2 mb-3">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b]" />
          <input name="q" defaultValue={q} className="campo pl-9"
            placeholder="Buscar por nombre, teléfono o vehículo…" />
        </div>
        <Boton tipo="submit" variante="suave">Buscar</Boton>
      </form>

      <Tabla>
        <thead>
          <tr>
            <TH>Etapa</TH><TH>Estado</TH><TH>Cliente</TH><TH>Origen</TH><TH>Asesor</TH>
            <TH>Vehículo de interés</TH><TH alinear="right">Presupuesto</TH>
            <TH>Próxima acción</TH>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && <FilaVacia cols={8} mensaje="No hay leads cargados todavía." />}
          {filas.map((l: any) => {
            const e = ESTADOS_LEAD[l.estado] || { label: l.estado, tono: "gris" as const, etapa: "captacion" };
            const idxEtapa = ETAPAS_LEAD.findIndex((x) => x.valor === e.etapa);
            const Ico = ICONO_ORIGEN[l.origen] || Store;
            const vencida = l.fecha_proxima && new Date(l.fecha_proxima) < new Date(new Date().toDateString());
            return (
              <tr key={l.id} className="hover:bg-[#151d29]">
                <TD><Etapas indice={idxEtapa} etiqueta={ETAPAS_LEAD[idxEtapa]?.label} /></TD>
                <TD>
                  <SelectEstado id={l.id} valor={l.estado} accion={cambiarEstado}
                    opciones={Object.entries(ESTADOS_LEAD).map(([k, x]) => ({ valor: k, label: x.label }))} />
                </TD>
                <TD>
                  <Link href={`/leads/${l.id}`} className="font-medium hover:text-[#2f6bff]">{l.nombre}</Link>
                  {l.telefono && <div className="text-[11.5px] text-[#64748b]">{l.telefono}</div>}
                </TD>
                <TD>
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[#9aa7b8]">
                    <Ico size={13} /> {ORIGENES_LEAD[l.origen] || l.origen}
                  </span>
                </TD>
                <TD className="text-[#9aa7b8]">{l.asesor || "—"}</TD>
                <TD>
                  {l.marca ? (
                    <Link href={`/vehiculos/${l.vehiculo_id}`} className="hover:text-[#2f6bff]">
                      {l.marca} {l.modelo}
                      {l.dominio && <span className="text-[#64748b]"> ({l.dominio})</span>}
                    </Link>
                  ) : <span className="text-[#9aa7b8]">{l.vehiculo_texto || "—"}</span>}
                </TD>
                <TD alinear="right" className="text-[#9aa7b8]">
                  {l.presupuesto ? plata(l.presupuesto) : "—"}
                </TD>
                <TD>
                  {l.proxima_accion ? (
                    <div>
                      <div className="text-[12.5px] truncate max-w-[200px]">{l.proxima_accion}</div>
                      <Chip tono={vencida ? "rojo" : "azul"} className="mt-1">{fecha(l.fecha_proxima)}</Chip>
                    </div>
                  ) : <span className="text-[#64748b]">Sin definir</span>}
                </TD>
              </tr>
            );
          })}
        </tbody>
      </Tabla>
    </>
  );
}
