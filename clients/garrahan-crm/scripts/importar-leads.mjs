/**
 * Carga los leads de la hoja CRM del Excel de la agencia.
 *
 *   node scripts/importar-leads.mjs --clave=XXXX              → muestra qué haría
 *   node scripts/importar-leads.mjs --clave=XXXX --confirmar  → carga
 *   (o un JSON propio: node scripts/importar-leads.mjs datos.json [--confirmar])
 *
 * Los datos tienen nombres y teléfonos: al repositorio (que es público) solo
 * van cifrados en datos/leads.enc, con la misma clave que el stock.
 *
 * Se puede correr dos veces: cada lead queda marcado en la auditoría con su
 * clave ("excel-crm:12") y la segunda vez se saltea. Tampoco se carga un lead
 * cuyo teléfono ya está en el sistema (por ejemplo, porque entró por la web).
 * No avisa por Telegram: son consultas viejas, no nuevas.
 */
import postgres from "postgres";
import { readFileSync } from "fs";
import crypto from "crypto";

const url = process.env.DATABASE_URL;
if (!url) { console.error("Falta DATABASE_URL."); process.exit(1); }
const confirmar = process.argv.includes("--confirmar");
const archivo = process.argv.slice(2).find((a) => !a.startsWith("--"));
const sql = postgres(url, { max: 1, onnotice: () => {} });

function leerDatos() {
  const clave = process.argv.find((a) => a.startsWith("--clave="))?.slice(8);
  if (!clave) return readFileSync(archivo || 0, "utf8");
  const crudo = Buffer.from(readFileSync(new URL("./datos/leads.enc", import.meta.url), "utf8"), "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", crypto.scryptSync(clave.trim(), "garrahan-stock", 32), crudo.subarray(0, 12));
  d.setAuthTag(crudo.subarray(12, 28));
  try {
    return Buffer.concat([d.update(crudo.subarray(28)), d.final()]).toString("utf8");
  } catch {
    console.error("La clave no es correcta."); process.exit(1);
  }
}
const datos = JSON.parse(leerDatos());
const ultimos8 = (t) => String(t || "").replace(/\D/g, "").slice(-8);

const ESTADOS = {
  contactado: "Contactado", calificado: "Calificado", en_negociacion: "En negociación",
  vendido: "Vendido", perdido: "Perdido",
};

async function main() {
  const [salon] = await sql`SELECT id FROM sucursales WHERE nombre = 'Salón Principal'`;
  const ya = new Set((await sql`SELECT detalle FROM auditoria
                                WHERE entidad = 'lead' AND accion = 'importado'`).map((r) => r.detalle));
  const telefonos = new Set((await sql`SELECT telefono FROM leads WHERE telefono IS NOT NULL`)
    .map((r) => ultimos8(r.telefono)).filter((t) => t.length === 8));

  const cuenta = {};
  let nuevos = 0, repetidos = 0, yaEstaban = 0;
  for (const l of datos.leads) {
    if (ya.has(l.clave)) { yaEstaban++; continue; }
    const t8 = ultimos8(l.telefono);
    if (t8.length === 8 && telefonos.has(t8)) {
      console.log(`= ${l.nombre}: ese teléfono ya está en el sistema, no se carga`);
      repetidos++; continue;
    }
    if (t8.length === 8) telefonos.add(t8);
    nuevos++;
    cuenta[l.estado] = (cuenta[l.estado] || 0) + 1;
    if (!confirmar) continue;

    await sql.begin(async (tx) => {
      const alta = l.creado_en ? new Date(l.creado_en + "T12:00:00-03:00") : new Date();
      const [n] = await tx`
        INSERT INTO leads (nombre, telefono, email, origen, etapa, estado, vehiculo_texto, presupuesto,
                           proxima_accion, fecha_proxima, observaciones, sucursal_id, creado_en, actualizado_en)
        VALUES (${l.nombre}, ${l.telefono}, ${l.email}, ${l.origen}, ${l.etapa}, ${l.estado},
                ${l.vehiculo_texto}, ${l.presupuesto}, ${l.proxima_accion}, ${l.fecha_proxima},
                ${l.observaciones}, ${salon?.id ?? null}, ${alta}, ${alta})
        RETURNING id`;
      await tx`INSERT INTO lead_interacciones (lead_id, tipo, detalle, fecha)
               VALUES (${n.id}, 'nota', 'Cargado desde el Excel de la agencia.', ${alta})`;
      await tx`INSERT INTO auditoria (entidad, entidad_id, accion, detalle)
               VALUES ('lead', ${n.id}, 'importado', ${l.clave})`;
    });
  }

  console.log(`\n${nuevos} leads ${confirmar ? "cargados" : "para cargar"}` + (nuevos
    ? ": " + Object.entries(cuenta).map(([k, v]) => `${v} ${ESTADOS[k] || k}`).join(", ") + "."
    : "."));
  if (repetidos) console.log(`${repetidos} no se cargan porque su teléfono ya estaba en el sistema.`);
  if (yaEstaban) console.log(`${yaEstaban} ya se habían cargado antes.`);
  if (!confirmar) console.log("\nNo se cargó nada. Para cargar, agregá --confirmar.");
}

main()
  .catch((e) => { console.error("\nError:", e.message); process.exitCode = 1; })
  .finally(() => sql.end());
