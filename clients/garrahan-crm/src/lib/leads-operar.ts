import { sql } from "./db";
import { puede, veTodosLosLeads, type Usuario } from "./auth";
import { avisarLeadNuevo, puedeVerLead } from "./leads";
import { ESTADOS_LEAD, ORIGENES_LEAD } from "./constantes";
import { SIN_PERMISO } from "./aviso";
import { fallo, type Res } from "./resultado";

/**
 * Lo que se le puede hacer a un lead. Lo usan las pantallas y el asistente de
 * Telegram: una sola versión de cada regla, se entre por donde se entre.
 */

/** Los tipos de seguimiento que carga una persona. `cambio_estado` lo anota el sistema. */
export const TIPOS_SEGUIMIENTO: Record<string, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  email: "Email",
  visita: "Visita",
  test_drive: "Test drive",
  cotizacion: "Cotización",
  nota: "Nota",
};

export type DatosLead = {
  nombre: string | null;
  telefono?: string | null;
  email?: string | null;
  origen?: string | null;
  estado?: string | null;
  cliente_id?: number | null;
  asesor_id?: number | null;
  vehiculo_id?: number | null;
  vehiculo_texto?: string | null;
  presupuesto?: number | null;
  entrega_usado?: boolean;
  usado_detalle?: string | null;
  tasacion?: number | null;
  proxima_accion?: string | null;
  fecha_proxima?: string | null;
  observaciones?: string | null;
  sucursal_id?: number | null;
};

export async function crearLead(usr: Usuario, d: DatosLead): Promise<Res<{ id: number }>> {
  if (!puede(usr, "leads")) return fallo(SIN_PERMISO);
  const nombre = (d.nombre || "").trim();
  if (!nombre) return fallo("Falta el nombre.");

  const estado = d.estado || "nuevo";
  if (!ESTADOS_LEAD[estado]) return fallo("Ese estado no existe.");
  const origen = d.origen || "showroom";

  const [l] = await sql`
    INSERT INTO leads (cliente_id, nombre, telefono, email, origen, etapa, estado,
                       asesor_id, vehiculo_id, vehiculo_texto, presupuesto,
                       entrega_usado, usado_detalle, tasacion,
                       proxima_accion, fecha_proxima, observaciones, sucursal_id, creado_por)
    VALUES (${d.cliente_id ?? null}, ${nombre}, ${d.telefono ?? null}, ${d.email ?? null},
            ${origen}, ${ESTADOS_LEAD[estado].etapa}, ${estado},
            ${d.asesor_id ?? null}, ${d.vehiculo_id ?? null}, ${d.vehiculo_texto ?? null},
            ${d.presupuesto ?? null},
            ${!!d.entrega_usado}, ${d.usado_detalle ?? null}, ${d.tasacion ?? null},
            ${d.proxima_accion ?? null}, ${d.fecha_proxima ?? null},
            ${d.observaciones ?? null}, ${d.sucursal_id ?? null}, ${usr.id})
    RETURNING id`;

  await sql`INSERT INTO lead_interacciones (lead_id, tipo, detalle, usuario_id)
            VALUES (${l.id}, 'nota', ${"Lead cargado desde " + (ORIGENES_LEAD[origen] || "showroom")}, ${usr.id})`;
  await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
            VALUES (${usr.id}, 'lead', ${l.id}, 'alta', ${nombre})`;

  await avisarLeadNuevo(l.id);
  return { ok: true, id: Number(l.id) };
}

/** Un contacto con el lead: qué pasó y, si se sabe, qué sigue y para cuándo. */
export async function registrarSeguimiento(
  usr: Usuario, id: number,
  d: { tipo?: string | null; detalle: string | null; proxima_accion?: string | null; fecha_proxima?: string | null },
): Promise<Res> {
  if (!puede(usr, "leads")) return fallo(SIN_PERMISO);
  if (!(await puedeVerLead(usr, id))) return fallo("Ese lead no es tuyo.");
  const detalle = (d.detalle || "").trim();
  if (!detalle) return fallo("Escribí qué pasó.");
  const tipo = d.tipo || "nota";
  if (!TIPOS_SEGUIMIENTO[tipo]) return fallo("Ese tipo de seguimiento no existe.");

  await sql`INSERT INTO lead_interacciones (lead_id, tipo, detalle, usuario_id)
            VALUES (${id}, ${tipo}, ${detalle}, ${usr.id})`;

  // Si la interacción trae la próxima acción, se pisa la anterior: es la vigente.
  const prox = (d.proxima_accion || "").trim();
  const cuando = (d.fecha_proxima || "").trim();
  if (prox || cuando) {
    await sql`UPDATE leads SET proxima_accion = COALESCE(NULLIF(${prox}, ''), proxima_accion),
                               fecha_proxima  = COALESCE(NULLIF(${cuando}, '')::date, fecha_proxima),
                               actualizado_en = now()
              WHERE id = ${id}`;
  } else {
    await sql`UPDATE leads SET actualizado_en = now() WHERE id = ${id}`;
  }
  return { ok: true };
}

export async function cambiarEstadoLead(usr: Usuario, id: number, nuevo: string): Promise<Res<{ label: string }>> {
  if (!puede(usr, "leads")) return fallo(SIN_PERMISO);
  if (!(await puedeVerLead(usr, id))) return fallo("Ese lead no es tuyo.");
  const etapa = ESTADOS_LEAD[nuevo]?.etapa;
  if (!etapa) return fallo("Ese estado no existe.");
  await sql`UPDATE leads SET estado = ${nuevo}, etapa = ${etapa}, actualizado_en = now()
            WHERE id = ${id}`;
  await sql`INSERT INTO lead_interacciones (lead_id, tipo, detalle, usuario_id)
            VALUES (${id}, 'cambio_estado', ${"Pasó a " + ESTADOS_LEAD[nuevo].label}, ${usr.id})`;
  return { ok: true, label: ESTADOS_LEAD[nuevo].label };
}

export async function marcarLeadPerdido(usr: Usuario, id: number, motivo: string | null): Promise<Res> {
  if (!puede(usr, "leads")) return fallo(SIN_PERMISO);
  if (!(await puedeVerLead(usr, id))) return fallo("Ese lead no es tuyo.");
  const m = (motivo || "").trim();
  await sql`UPDATE leads SET estado = 'perdido', etapa = 'cerrado',
                             motivo_perdida = ${m || null}, actualizado_en = now()
            WHERE id = ${id}`;
  await sql`INSERT INTO lead_interacciones (lead_id, tipo, detalle, usuario_id)
            VALUES (${id}, 'cambio_estado', ${"Perdido" + (m ? ": " + m : "")}, ${usr.id})`;
  return { ok: true };
}

/** Cómo se nombra cada dato en el historial del lead. Son también los que se pueden corregir. */
const NOMBRES: Record<string, string> = {
  nombre: "nombre", telefono: "teléfono", email: "email", origen: "origen", asesor_id: "asesor",
  sucursal_id: "sucursal", cliente_id: "cliente", vehiculo_id: "unidad", vehiculo_texto: "lo que pidió",
  presupuesto: "presupuesto", entrega_usado: "entrega usado", usado_detalle: "usado",
  tasacion: "tasación", proxima_accion: "próxima acción", fecha_proxima: "fecha de la próxima acción",
  observaciones: "observaciones", motivo_perdida: "motivo de la pérdida",
};

/**
 * Corrige datos del lead. Solo se tocan las claves que vienen en `nuevo`; el
 * estado no es una de ellas: se cambia con cambiarEstadoLead, que es donde
 * queda anotado cada paso del embudo. Devuelve los nombres de lo que cambió.
 */
export async function editarLead(usr: Usuario, id: number, nuevo: Record<string, any>): Promise<Res<{ cambios: string[] }>> {
  if (!puede(usr, "leads.editar")) return fallo(SIN_PERMISO);
  if (!(await puedeVerLead(usr, id))) return fallo("Ese lead no es tuyo.");
  const [antes] = await sql`SELECT * FROM leads WHERE id = ${id}`;
  if (!antes) return fallo("Ese lead ya no existe.");

  const datos: Record<string, any> = {};
  for (const k of Object.keys(nuevo)) if (NOMBRES[k]) datos[k] = nuevo[k] === undefined ? null : nuevo[k];
  if ("nombre" in datos && !String(datos.nombre ?? "").trim()) return fallo("Falta el nombre.");

  // Reasignar un lead es cosa de quien los ve todos. El vendedor solo puede
  // quedarse con uno que todavía no tiene asesor.
  if ("asesor_id" in datos && !veTodosLosLeads(usr)) {
    const loToma = antes.asesor_id == null && Number(datos.asesor_id) === usr.id;
    if (!loToma) datos.asesor_id = antes.asesor_id;
  }
  if ("motivo_perdida" in datos && antes.estado !== "perdido") datos.motivo_perdida = antes.motivo_perdida;

  const comparable = (k: string, v: any) => {
    if (v === null || v === undefined || v === "") return "";
    if (k === "fecha_proxima") return new Date(v).toISOString().slice(0, 10);
    if (["presupuesto", "tasacion", "asesor_id", "sucursal_id", "cliente_id", "vehiculo_id"].includes(k)) return String(Number(v));
    return String(v);
  };
  const cambios = Object.keys(datos).filter((k) => comparable(k, datos[k]) !== comparable(k, antes[k]));
  if (cambios.length === 0) return { ok: true, cambios: [] };

  const aGuardar = Object.fromEntries(cambios.map((k) => [k, datos[k]]));
  await sql.begin(async (tx) => {
    await tx`UPDATE leads SET ${tx(aGuardar)}, actualizado_en = now() WHERE id = ${id}`;
    await tx`INSERT INTO lead_interacciones (lead_id, tipo, detalle, usuario_id)
             VALUES (${id}, 'nota', ${"Datos corregidos: " + cambios.map((k) => NOMBRES[k] || k).join(", ")}, ${usr.id})`;
    await tx`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
             VALUES (${usr.id}, 'lead', ${id}, 'editar',
                     ${cambios.map((k) => `${NOMBRES[k] || k}: ${comparable(k, antes[k]) || "—"} → ${comparable(k, datos[k]) || "—"}`).join(" · ")})`;
  });
  return { ok: true, cambios: cambios.map((k) => NOMBRES[k] || k) };
}
