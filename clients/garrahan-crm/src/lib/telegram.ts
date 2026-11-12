import { sql } from "./db";

/**
 * Avisos por Telegram. El token del bot va por variable de entorno
 * (TELEGRAM_BOT_TOKEN) y nunca a la base. El chat se elige en Configuración
 * —puede ser un grupo del equipo— y si no está, se usa TELEGRAM_CHAT_ID.
 *
 * Un aviso que falla no puede romper la operación que lo disparó: se registra
 * en el log y se sigue. Por eso avisar() nunca tira error.
 */

export const telegramConfigurado = () => Boolean(process.env.TELEGRAM_BOT_TOKEN);

async function chatDestino(): Promise<string | null> {
  try {
    const [e] = await sql`SELECT telegram_chat FROM empresa WHERE id = 1`;
    return (e?.telegram_chat || process.env.TELEGRAM_CHAT_ID || "").trim() || null;
  } catch {
    return process.env.TELEGRAM_CHAT_ID || null;
  }
}

/** Escapa lo que viene de un formulario para el modo HTML de Telegram. */
export const t = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Link a una pantalla del sistema, si se conoce la URL pública. */
export function enlace(ruta: string, texto: string) {
  const base = (process.env.CRM_PUBLIC_URL || "").replace(/\/$/, "");
  return base ? `<a href="${base}${ruta}">${t(texto)}</a>` : t(texto);
}

export async function avisar(html: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const chat = await chatDestino();
  if (!chat) return false;
  try {
    // TELEGRAM_API_URL solo existe para probar contra un servidor falso.
    const api = process.env.TELEGRAM_API_URL || "https://api.telegram.org";
    const r = await fetch(`${api}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat, text: html, parse_mode: "HTML", disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) console.error("Telegram:", r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (err: any) {
    console.error("Telegram: no se pudo mandar el aviso:", err?.message);
    return false;
  }
}

/** Formato corto de plata para los avisos: $ 12.500.000 / US$ 9.800. */
export function plataAviso(n: unknown, moneda = "ARS") {
  const v = Math.round(Number(n || 0)).toLocaleString("es-AR");
  return (moneda === "USD" ? "US$ " : "$ ") + v;
}
