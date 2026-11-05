import { sql } from "@/lib/db";
import { puede, type Usuario } from "@/lib/auth";
import { leadsVisibles } from "@/lib/leads";
import { numeroWhatsApp } from "@/lib/format";
import MenuLeads, { type LeadMenu } from "@/components/menu-leads";

/** El día de hoy en Argentina: el servidor y la base corren en UTC. */
const hoy = () => sql`(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`;
const CERRADOS = ["vendido", "perdido", "postergado", "reservado"];

/** "hace 2 h", "hace 3 días": cuánto lleva esperando. */
function haceCuanto(d: Date) {
  const min = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.floor(h / 24);
  return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
}

/**
 * Botón de leads de la barra de arriba: rojo si hay nuevos sin contactar,
 * amarillo si hay seguimientos para hoy o vencidos, verde si está todo al día.
 * Cada uno ve los leads que le corresponden (los mismos que en Leads).
 */
export default async function BotonLeads({ usuario }: { usuario: Usuario }) {
  if (!puede(usuario, "leads")) return null;

  const filas = await sql`
    SELECT l.id, l.nombre, l.telefono, l.estado, l.creado_en, l.proxima_accion,
           COALESCE(NULLIF(trim(concat_ws(' ', v.marca, v.modelo, v.anio)), ''), l.vehiculo_texto) AS auto,
           CASE WHEN l.estado = 'nuevo' THEN 'nuevo'
                WHEN l.fecha_proxima < ${hoy()} THEN 'vencido'
                ELSE 'hoy' END AS grupo
    FROM leads l
    LEFT JOIN vehiculos v ON v.id = l.vehiculo_id
    WHERE ${leadsVisibles(usuario)}
      AND (l.estado = 'nuevo'
           OR (l.fecha_proxima <= ${hoy()} AND l.estado NOT IN ${sql(CERRADOS)}))
    ORDER BY l.creado_en`;

  const leads: LeadMenu[] = filas.map((l: any) => ({
    id: Number(l.id),
    nombre: l.nombre,
    auto: l.auto || null,
    accion: l.proxima_accion || null,
    hace: haceCuanto(l.creado_en),
    whatsapp: numeroWhatsApp(l.telefono),
    grupo: l.grupo,
  }));

  return <MenuLeads leads={leads} />;
}
