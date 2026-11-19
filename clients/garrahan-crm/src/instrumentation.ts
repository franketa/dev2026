/**
 * Arranca con el servidor. Prende el reloj del resumen diario de Telegram y,
 * si el asistente está configurado, le dice a Telegram dónde mandar lo que le
 * escriben al bot: un solo contenedor, sin cron externo que configurar en Coolify.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  const { tic } = await import("./lib/avisos");
  const { registrarWebhook, limpiar } = await import("./lib/bot");
  const correr = () => {
    tic().catch((e) => console.error("Avisos:", e?.message));
    limpiar().catch((e) => console.error("Asistente:", e?.message));
  };
  setTimeout(correr, 60_000);
  setInterval(correr, 15 * 60_000);
  // Un momento después de arrancar, cuando el servidor ya atiende.
  setTimeout(() => registrarWebhook().catch((e) => console.error("Asistente:", e?.message)), 10_000);
}
