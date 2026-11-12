/**
 * Arranca con el servidor. Prende el reloj del resumen diario de Telegram:
 * un solo contenedor, sin cron externo que configurar en Coolify.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  const { tic } = await import("./lib/avisos");
  const correr = () => tic().catch((e) => console.error("Avisos:", e?.message));
  setTimeout(correr, 60_000);
  setInterval(correr, 15 * 60_000);
}
