import crypto from "crypto";
import { headers } from "next/headers";
import { sql } from "./db";

export type Moneda = "ARS" | "USD";
export type Unidad = { vehiculo_id: number; precio: number; moneda: Moneda };

/** Hasta tres autos: más que eso no entra en una hoja ni ayuda a decidir. */
export const MAX_UNIDADES = 3;

/** El link que se manda: imposible de adivinar, corto para WhatsApp. */
export const nuevoToken = () => crypto.randomBytes(12).toString("base64url");

/** Dirección del CRM para armar links que se abren afuera del sistema. */
export async function basePublica() {
  if (process.env.CRM_PUBLIC_URL) return process.env.CRM_PUBLIC_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Todo lo que necesita la hoja. Los datos del auto se leen al momento (fotos,
 * km), pero el precio y la moneda son los de la propuesta.
 */
export async function cargarPropuesta(por: { id: number } | { token: string }) {
  const [p] = "token" in por
    ? await sql`SELECT p.*, us.nombre AS vendedor, us.telefono AS vendedor_tel, us.email AS vendedor_email
                FROM propuestas p LEFT JOIN usuarios us ON us.id = p.usuario_id
                WHERE p.token = ${por.token}`
    : await sql`SELECT p.*, us.nombre AS vendedor, us.telefono AS vendedor_tel, us.email AS vendedor_email
                FROM propuestas p LEFT JOIN usuarios us ON us.id = p.usuario_id
                WHERE p.id = ${por.id}`;
  if (!p) return null;

  const unidades: Unidad[] = p.unidades || [];
  const ids = unidades.map((u) => Number(u.vehiculo_id));
  const [autos, emp] = await Promise.all([
    ids.length
      ? sql`SELECT v.id, v.marca, v.modelo, v.version, v.anio, v.km, v.condicion, v.combustible,
                   v.transmision, v.color, v.motor,
                   (SELECT f.id FROM vehiculo_fotos f WHERE f.vehiculo_id = v.id
                    ORDER BY f.posicion, f.id LIMIT 1) AS foto
            FROM vehiculos v WHERE v.id IN ${sql(ids)}`
      : Promise.resolve([] as any[]),
    sql`SELECT * FROM empresa WHERE id = 1`,
  ]);

  const items = unidades
    .map((u) => ({ ...u, auto: autos.find((a: any) => a.id === Number(u.vehiculo_id)) }))
    .filter((x) => x.auto);

  const vence = new Date(new Date(p.creado_en).getTime() + Number(p.validez_dias) * 86400e3);
  return { p, items, empresa: emp[0] || {}, vence };
}

export type DatosPropuesta = NonNullable<Awaited<ReturnType<typeof cargarPropuesta>>>;

/** "Toyota Hilux 2020", para el historial del lead y el título del link. */
export const nombreAuto = (a: any) => [a.marca, a.modelo, a.anio].filter(Boolean).join(" ");
