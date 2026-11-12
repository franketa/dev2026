import { sql } from "./db";

/**
 * Lo que la web pública ve del stock. El formato es exactamente el que ya
 * usaba garrahanautomotores.com.ar (server/db.js → rowToVehicle), así el
 * frontend del sitio no cambia: solo cambia de dónde salen los datos.
 *
 * Nada de costos, inversores, dominio ni titular: esto es público.
 */

/** URL pública del CRM, para armar los links de las fotos. */
export function basePublica(req: Request) {
  if (process.env.CRM_PUBLIC_URL) return process.env.CRM_PUBLIC_URL.replace(/\/$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** El vocabulario del sitio: sus filtros usan 'Diésel' y estos tres estados. */
const COMBUSTIBLE_WEB: Record<string, string> = { Diesel: "Diésel" };
function estadoWeb(estado: string) {
  // Para la web, un auto de promoción está a la venta como cualquier otro.
  if (estado === "disponible" || estado === "promocion") return "disponible";
  if (estado === "reservado") return "reservado";
  return "vendido";
}

const COLUMNAS = sql`
  v.id, v.marca, v.modelo, v.version, v.anio, v.km, v.condicion, v.carroceria, v.combustible,
  v.transmision, v.motor, v.puertas, v.color, v.traccion, v.precio_venta, v.precio_oferta,
  v.moneda_venta, v.mostrar_precio, v.acepta_financiacion, v.acepta_permuta, v.equipamiento,
  v.descripcion_web, v.destacado, v.estado, v.creado_en,
  COALESCE((SELECT array_agg(f.id ORDER BY f.posicion, f.id) FROM vehiculo_fotos f
            WHERE f.vehiculo_id = v.id), '{}') AS fotos`;

function aWeb(r: any, base: string) {
  const fotos: string[] = (r.fotos || []).map((id: number) => `${base}/api/fotos/${id}`);
  return {
    id: r.id,
    marca: r.marca,
    modelo: r.modelo,
    version: r.version || "",
    anio: r.anio,
    km: r.condicion === "0km" ? 0 : Number(r.km || 0),
    condicion: r.condicion,
    tipo: r.carroceria || "Otro",
    combustible: COMBUSTIBLE_WEB[r.combustible] || r.combustible || "",
    transmision: r.transmision || "",
    motor: r.motor || "",
    puertas: r.puertas || null,
    color: r.color || "",
    traccion: r.traccion || "",
    precio: Math.round(Number(r.precio_venta || 0)),
    precioDescuento: Math.round(Number(r.precio_oferta || 0)),
    moneda: r.moneda_venta || "ARS",
    mostrarPrecio: !!r.mostrar_precio && Number(r.precio_venta) > 0,
    financiacion: !!r.acepta_financiacion,
    permuta: !!r.acepta_permuta,
    equipamiento: String(r.equipamiento || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
    descripcion: r.descripcion_web || "",
    destacado: !!r.destacado,
    estado: estadoWeb(r.estado),
    coverImage: fotos[0] || null,
    images: fotos.slice(1),
    createdAt: r.creado_en,
  };
}

/** Lo que está a la venta, más los de solo promoción. Señado o vendido sale solo de la lista. */
export async function stockPublico(base: string) {
  const filas = await sql`
    SELECT ${COLUMNAS} FROM vehiculos v
    WHERE v.publicado AND v.estado IN ('disponible', 'promocion')
    ORDER BY v.destacado DESC, v.creado_en DESC`;
  return filas.map((r: any) => aWeb(r, base));
}

/**
 * Una unidad puntual. Si ya se señó o vendió se devuelve igual, marcada: quien
 * llega por un link viejo ve "vendido" en vez de una página rota. Las que
 * están en preparación o nunca se publicaron no existen para la web.
 */
export async function unidadPublica(id: number, base: string) {
  const [r] = await sql`
    SELECT ${COLUMNAS} FROM vehiculos v
    WHERE v.id = ${id} AND v.publicado
      AND v.estado IN ('disponible', 'promocion', 'reservado', 'vendido')`;
  return r ? aWeb(r, base) : null;
}
