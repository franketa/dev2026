import { NextResponse } from "next/server";
import crypto from "crypto";
import { sql } from "@/lib/db";
import { avisarLeadNuevo } from "@/lib/leads";

export const dynamic = "force-dynamic";

const corto = (v: unknown, max = 200) => {
  const s = String(v ?? "").trim().slice(0, max);
  return s === "" ? null : s;
};

function claveValida(recibida: string | null) {
  const esperada = process.env.WEB_API_KEY;
  if (!esperada || !recibida) return false;
  const a = Buffer.from(esperada);
  const b = Buffer.from(recibida);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Los formularios de la web dejan acá su consulta y entra como lead, con
 * aviso por Telegram. Hoy el único es el cotizador de "Vendé tu auto".
 *
 * No lo llama el navegador: lo llama el servidor del sitio, con una clave
 * compartida (WEB_API_KEY). Así nadie carga leads de mentira pegándole directo.
 */
export async function POST(req: Request) {
  if (!process.env.WEB_API_KEY) {
    return NextResponse.json({ error: "Integración con la web sin configurar" }, { status: 503 });
  }
  if (!claveValida(req.headers.get("x-garrahan-clave"))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const nombre = corto(b.nombre, 120);
  const telefono = corto(b.telefono, 40);
  if (!nombre || !telefono) return NextResponse.json({ error: "Faltan nombre y teléfono" }, { status: 400 });

  // Un doble clic o un reintento no tiene que dejar dos leads iguales.
  const [repetido] = await sql`
    SELECT id FROM leads
    WHERE telefono = ${telefono} AND origen = 'web' AND creado_en > now() - interval '15 minutes'
    LIMIT 1`;
  if (repetido) return NextResponse.json({ id: repetido.id, repetido: true });

  const esCotizacion = b.tipo === "vender";
  const u = b.usado || {};
  const usado = esCotizacion
    ? [u.vehiculo, u.anio, u.km, u.combustible, u.transmision,
       u.estado ? "estado " + u.estado : null,
       u.precio ? "pretende " + u.precio : "a tasar"]
        .map((x) => corto(x, 80)).filter(Boolean).join(" · ")
    : null;
  const vehiculoId = Number(b.vehiculo_id) || null;
  const observaciones = [
    esCotizacion ? "Cotización desde 'Vendé tu auto' en la web." : "Consulta desde la web.",
    b.localidad ? "Localidad: " + corto(b.localidad, 80) : null,
    esCotizacion ? (u.parte_de_pago ? "Lo quiere dejar como parte de pago." : "Lo quiere vender directo.") : null,
    corto(b.mensaje, 1000),
  ].filter(Boolean).join("\n");

  const [l] = await sql`
    INSERT INTO leads (nombre, telefono, email, origen, etapa, estado, vehiculo_id, vehiculo_texto,
                       entrega_usado, usado_detalle, proxima_accion, fecha_proxima, observaciones)
    VALUES (${nombre}, ${telefono}, ${corto(b.email, 120)}, 'web', 'captacion', 'nuevo',
            ${vehiculoId && (await sql`SELECT 1 FROM vehiculos WHERE id = ${vehiculoId}`).length ? vehiculoId : null},
            ${esCotizacion && u.parte_de_pago ? corto(u.interes, 120) : corto(b.vehiculo_texto, 120)},
            ${esCotizacion}, ${usado},
            ${esCotizacion ? "Cotizar el usado y responder" : "Responder la consulta"},
            current_date, ${observaciones})
    RETURNING id`;
  await sql`INSERT INTO lead_interacciones (lead_id, tipo, detalle)
            VALUES (${l.id}, ${esCotizacion ? "cotizacion" : "nota"},
                    ${esCotizacion ? "Pidió cotización de su usado desde la web" : "Consultó desde la web"})`;

  await avisarLeadNuevo(l.id);
  return NextResponse.json({ id: l.id }, { status: 201 });
}
