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

// TELEGRAM_API_URL solo existe para probar contra un servidor falso.
const apiTelegram = () => process.env.TELEGRAM_API_URL || "https://api.telegram.org";

/**
 * Una llamada cualquiera a la API del bot (la usa el asistente: recibir,
 * contestar, botones). Devuelve el `result`, o null si falló: el motivo queda
 * en el log, nunca el token.
 */
export async function tg<T = any>(metodo: string, cuerpo: Record<string, unknown> = {}, ms = 10000): Promise<T | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch(`${apiTelegram()}/bot${token}/${metodo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(ms),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) {
      console.error(`Telegram ${metodo}:`, r.status, String(j?.description || "").slice(0, 200));
      return null;
    }
    return j.result as T;
  } catch (err: any) {
    console.error(`Telegram ${metodo}:`, err?.name === "TimeoutError" ? "sin respuesta" : "no se pudo conectar");
    return null;
  }
}

/** Baja un archivo que alguien le mandó al bot (un audio). Telegram deja hasta 20 MB. */
export async function descargarDeTelegram(fileId: string): Promise<Buffer | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const f = await tg<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!token || !f?.file_path) return null;
  try {
    const r = await fetch(`${apiTelegram()}/file/bot${token}/${f.file_path}`, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    console.error("Telegram: no se pudo bajar el archivo");
    return null;
  }
}

let elBot: { id: number; username: string; lee_grupos: boolean } | null = null;

/** Quién es el bot: su usuario (para el link y las menciones) y si lee los mensajes de un grupo. */
export async function datosDelBot() {
  if (elBot) return elBot;
  const me = await tg<any>("getMe");
  if (!me) return null;
  elBot = { id: Number(me.id), username: String(me.username || ""), lee_grupos: !!me.can_read_all_group_messages };
  return elBot;
}

/** El chat del equipo: el de Configuración o, si no hay, TELEGRAM_CHAT_ID. */
export async function chatDestino(): Promise<string | null> {
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
    const r = await fetch(`${apiTelegram()}/bot${token}/sendMessage`, {
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
