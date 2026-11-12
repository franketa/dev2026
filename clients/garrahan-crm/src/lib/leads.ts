import { sql } from "./db";
import { veTodosLosLeads, type Usuario } from "./auth";
import { ORIGENES_LEAD } from "./constantes";
import { avisar, enlace, t } from "./telegram";

/** Un lead nuevo sin tocar después de esto aparece en rojo y entra en el aviso diario. */
export const HORAS_SIN_CONTACTAR = 24;

/**
 * Qué leads ve cada uno (la tabla va con alias `l`). El vendedor ve los suyos
 * y los que todavía no tienen asesor, para poder tomarlos; el referente, solo
 * los que cargó o le asignaron.
 */
export function leadsVisibles(u: Usuario) {
  if (veTodosLosLeads(u)) return sql`TRUE`;
  if (u.rol === "vendedor") {
    return sql`(l.asesor_id = ${u.id} OR l.asesor_id IS NULL OR l.creado_por = ${u.id})`;
  }
  return sql`(l.asesor_id = ${u.id} OR l.creado_por = ${u.id})`;
}

export async function puedeVerLead(u: Usuario, id: number) {
  const [r] = await sql`SELECT 1 FROM leads l WHERE l.id = ${id} AND ${leadsVisibles(u)}`;
  return !!r;
}

export async function avisarLeadNuevo(id: number) {
  const [l] = await sql`
    SELECT l.nombre, l.telefono, l.origen, l.vehiculo_texto, l.entrega_usado, l.usado_detalle,
           v.marca, v.modelo, us.nombre AS asesor
    FROM leads l
    LEFT JOIN vehiculos v ON v.id = l.vehiculo_id
    LEFT JOIN usuarios us ON us.id = l.asesor_id
    WHERE l.id = ${id}`;
  if (!l) return;
  const interes = l.marca ? `${l.marca} ${l.modelo}` : l.vehiculo_texto;
  const lineas = [
    `${l.entrega_usado && l.origen === "web" ? "🚗 <b>Cotización de usado</b>" : "🔥 <b>Lead nuevo</b>"} · ${enlace("/leads/" + id, l.nombre)}`,
    `Origen: ${t(ORIGENES_LEAD[l.origen] || l.origen)}${l.telefono ? " · " + t(l.telefono) : ""}`,
    interes ? `Interesado en: ${t(interes)}` : null,
    l.entrega_usado && l.usado_detalle ? `Usado: ${t(l.usado_detalle)}` : null,
    l.asesor ? `Asesor: ${t(l.asesor)}` : "Sin asesor asignado",
  ];
  await avisar(lineas.filter(Boolean).join("\n"));
}
