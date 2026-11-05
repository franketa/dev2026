"use server";

import { revalidatePath } from "next/cache";
import { sql } from "./db";
import { requierePermiso } from "./auth";
import { puedeVerLead } from "./leads";
import { ESTADOS_LEAD } from "./constantes";

/**
 * "Ya lo contacté", desde el botón de leads de la barra de arriba.
 * Un lead nuevo (o sin respuesta) pasa a contactado. En uno que ya estaba en
 * seguimiento no se toca el estado: se da por hecho el seguimiento y sale de
 * la lista. Queda anotado en el historial del lead.
 */
export async function leadContactado(id: number) {
  const usr = await requierePermiso("leads");
  if (!(await puedeVerLead(usr, id))) return { ok: false };
  const [l] = await sql`SELECT estado, proxima_accion FROM leads WHERE id = ${id}`;
  if (!l) return { ok: false };

  const pasa = ["nuevo", "sin_respuesta"].includes(l.estado) ? "contactado" : l.estado;
  await sql.begin(async (tx) => {
    await tx`UPDATE leads SET estado = ${pasa}, etapa = ${ESTADOS_LEAD[pasa]?.etapa || "captacion"},
               fecha_proxima = NULL, proxima_accion = NULL, actualizado_en = now()
             WHERE id = ${id}`;
    await tx`INSERT INTO lead_interacciones (lead_id, tipo, detalle, usuario_id)
             VALUES (${id}, 'cambio_estado',
                     ${pasa !== l.estado ? "Contactado" : `Seguimiento hecho${l.proxima_accion ? ": " + l.proxima_accion : ""}`},
                     ${usr.id})`;
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
