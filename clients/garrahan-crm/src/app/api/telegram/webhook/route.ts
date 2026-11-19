import { after, NextResponse } from "next/server";
import crypto from "crypto";
import { asistenteConfigurado, procesarUpdate, secretoWebhook } from "@/lib/bot";

export const dynamic = "force-dynamic";

function secretoValido(recibido: string | null) {
  if (!recibido) return false;
  const a = Buffer.from(secretoWebhook());
  const b = Buffer.from(recibido);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Acá llega lo que le escriben al bot: Telegram llama a esta dirección con
 * cada mensaje y cada botón tocado, firmado con el secreto que se le dio al
 * registrar el webhook (lib/bot → registrarWebhook).
 *
 * Se contesta enseguida y se trabaja después: transcribir un audio y resolverlo
 * lleva más de lo que Telegram espera antes de reintentar.
 */
export async function POST(req: Request) {
  if (!asistenteConfigurado()) return NextResponse.json({ error: "Asistente sin configurar" }, { status: 503 });
  if (!secretoValido(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let update: unknown;
  try { update = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  after(() => procesarUpdate(update).catch((e) => console.error("Asistente:", e?.message)));
  return NextResponse.json({ ok: true });
}
