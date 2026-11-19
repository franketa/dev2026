import crypto from "crypto";
import { sql } from "../db";
import { ROLES, veCostos, type Usuario } from "../auth";
import { chatDestino, datosDelBot, descargarDeTelegram, enlace, t, tg } from "../telegram";
import { agenteConfigurado, correrAgente, type Mensajes } from "./agente";
import { ejecutar, type Accion, type Contexto } from "./herramientas";
import { transcribir, transcripcionConfigurada } from "./transcribir";

/**
 * El asistente de Telegram: lo que entra por el webhook del bot.
 *
 * Alguien del equipo manda un audio (o escribe), se transcribe, el agente lo
 * resuelve contra el sistema y contesta en el mismo chat. Si pidió cambios,
 * la respuesta lleva el detalle y dos botones: nada se guarda hasta que la
 * misma persona toca Confirmar.
 *
 * Quién es quién: cada usuario del sistema vincula su Telegram desde «Mi
 * cuenta». El asistente solo atiende a usuarios vinculados y activos, en un
 * chat privado o en el chat del equipo elegido en Configuración.
 */

const ZONA = "America/Argentina/Buenos_Aires";
/** Más largo que esto no es un pedido: es una reunión. */
const MAX_SEGUNDOS = 300;
/** Una conversación sin movimiento se da por terminada: el próximo mensaje empieza de cero. */
const MINUTOS_CONVERSACION = 30;
/** Y una que creció demasiado, también. */
const MAX_HISTORIAL = 200_000;
/** Lo que dura una propuesta a la espera del botón. */
const MINUTOS_CONFIRMAR = 60;

export const asistenteConfigurado = () => Boolean(process.env.TELEGRAM_BOT_TOKEN) && agenteConfigurado();

/** El secreto con el que Telegram firma cada llamada al webhook. Sale del token: no hay otra variable que cargar. */
export const secretoWebhook = () =>
  crypto.createHash("sha256").update("garrahan-webhook:" + (process.env.TELEGRAM_BOT_TOKEN || "")).digest("hex");

/* --------------------------------------------------------------- una por vez
   Dos audios seguidos de la misma persona se atienden en orden: comparten la
   conversación y la propuesta pendiente. */
const colas = new Map<string, Promise<void>>();
function enCola(clave: string, tarea: () => Promise<void>): Promise<void> {
  const correr = () => tarea().catch((e) => console.error("Asistente:", e?.message));
  const sigue: Promise<void> = (colas.get(clave) ?? Promise.resolve()).then(correr).finally(() => {
    if (colas.get(clave) === sigue) colas.delete(clave);
  });
  colas.set(clave, sigue);
  return sigue;
}

/* ------------------------------------------------------------------ entrada */
export async function procesarUpdate(u: any): Promise<void> {
  // Telegram reintenta lo que no recibió respuesta: cada update se atiende una vez.
  const id = Number(u?.update_id);
  if (id) {
    const [nuevo] = await sql`INSERT INTO bot_updates (update_id) VALUES (${id})
                              ON CONFLICT (update_id) DO NOTHING RETURNING update_id`;
    if (!nuevo) return;
  }
  if (u?.callback_query) return manejarBoton(u.callback_query);
  const m = u?.message;
  if (!m?.from || m.from.is_bot || !m.chat) return;
  return enCola(`${m.chat.id}:${m.from.id}`, () => manejarMensaje(m));
}

async function usuarioDeTelegram(telegramId: number): Promise<Usuario | null> {
  const [u] = await sql`SELECT id, nombre, email, rol, sucursal_id FROM usuarios
                        WHERE telegram_id = ${telegramId} AND activo LIMIT 1`;
  return (u as Usuario) ?? null;
}

/** El grupo del equipo: el mismo chat que recibe los avisos. */
async function esElChatDelEquipo(chat: any) {
  const elegido = await chatDestino();
  if (!elegido) return false;
  return elegido === String(chat.id) || (!!chat.username && elegido.toLowerCase() === "@" + String(chat.username).toLowerCase());
}

/** Telegram corta en 4096 caracteres. */
const entero = (s: string) => (s.length > 4000 ? s.slice(0, 3990) + "…" : s);
const sinEtiquetas = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

async function responder(m: any, html: string, extra: Record<string, unknown> = {}) {
  const base = {
    chat_id: m.chat.id,
    disable_web_page_preview: true,
    reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true },
    ...extra,
  };
  const enviado = await tg<any>("sendMessage", { ...base, text: entero(html), parse_mode: "HTML" });
  if (enviado) return enviado;
  // Un mensaje cortado por largo puede quedar con una etiqueta abierta y
  // Telegram lo rechaza: que salga igual, en texto plano.
  return tg<any>("sendMessage", { ...base, text: entero(sinEtiquetas(html)) });
}

const COMO_VINCULAR = "Todavía no sé quién sos. Entrá al sistema, andá a <b>Mi cuenta</b> y tocá " +
  "<b>Vincular Telegram</b>: te da un link para abrir acá.";

const AYUDA = "Soy el asistente del sistema de Garrahan. Mandame un audio o escribime, por ejemplo:\n\n" +
  "• «¿Qué pickups tenemos disponibles?»\n" +
  "• «Vino Juan Pérez por la Amarok, entrega un Gol 2015, llamarlo el viernes»\n" +
  "• «Llamé a Marcela Villalba, viene el sábado a las diez»\n" +
  "• «Juan Pérez seña la Hilux con dos millones en efectivo»\n" +
  "• «¿A quién tengo que llamar hoy?»\n\n" +
  "Antes de guardar cualquier cambio te muestro el detalle y me lo confirmás con un botón.";

/* ------------------------------------------------------------------ mensajes */
async function manejarMensaje(m: any) {
  const privado = m.chat.type === "private";
  if (!privado && !(await esElChatDelEquipo(m.chat))) return;

  const texto = String(m.text || m.caption || "").trim();
  const audio = m.voice || m.audio || m.video_note || null;
  const bot = await datosDelBot();

  const cmd = /^\/([a-z_]+)(?:@(\w+))?(?:\s+([\s\S]*))?$/i.exec(texto);
  if (cmd && (!cmd[2] || cmd[2].toLowerCase() === bot?.username.toLowerCase())) {
    const que = cmd[1].toLowerCase();
    const resto = (cmd[3] || "").trim();
    if (que === "vincular" || (que === "start" && resto)) return vincular(m, resto);
    if (que === "start" || que === "ayuda" || que === "help") {
      const usr = await usuarioDeTelegram(m.from.id);
      return void (await responder(m, usr ? AYUDA : COMO_VINCULAR));
    }
    return;
  }

  // En el grupo se habla de todo: el asistente atiende los audios, las
  // respuestas a sus mensajes y cuando lo nombran. En privado, todo.
  const loNombran = !!bot?.username && texto.toLowerCase().includes("@" + bot.username.toLowerCase());
  const leResponden = !!bot && m.reply_to_message?.from?.id === bot.id;
  if (!privado && !audio && !loNombran && !leResponden) return;
  if (!audio && !texto) return;

  const usr = await usuarioDeTelegram(m.from.id);
  if (!usr) return void (await responder(m, COMO_VINCULAR));
  if (!asistenteConfigurado()) return void (await responder(m, "El asistente todavía no está activado en el servidor."));

  // «Escribiendo…» mientras trabaja: transcribir y pensar lleva unos segundos.
  const escribiendo = () => tg("sendChatAction", { chat_id: m.chat.id, action: "typing" });
  escribiendo();
  const latido = setInterval(escribiendo, 4500);
  try {
    let entrada = texto;
    let transcripto: string | null = null;
    if (audio) {
      if (Number(audio.duration || 0) > MAX_SEGUNDOS) {
        return void (await responder(m, "Ese audio es muy largo para mí (hasta 5 minutos). Mandámelo en partes."));
      }
      if (!transcripcionConfigurada()) {
        return void (await responder(m, "Todavía no puedo escuchar audios: falta activar la transcripción en el servidor. Escribime."));
      }
      const datos = await descargarDeTelegram(audio.file_id);
      if (!datos) return void (await responder(m, "No pude bajar el audio. Mandámelo de nuevo."));
      transcripto = await transcribir(datos, m.voice ? "audio.ogg" : audio.file_name || "audio", audio.mime_type || (m.voice ? "audio/ogg" : "application/octet-stream"));
      if (!transcripto) return void (await responder(m, "No llegué a entender el audio. ¿Me lo repetís, o me lo escribís?"));
      entrada = texto ? `${transcripto}\n(Texto que acompañaba al audio: ${texto})` : transcripto;
    }

    const clave = { chat: Number(m.chat.id), tg: Number(m.from.id) };
    const descartadas = await descartarPendientes(clave);
    const historial = await cargarConversacion(clave);

    const ahora = new Date();
    const rol = ROLES.find((r) => r.valor === usr.rol)?.label || usr.rol;
    const cuando = ahora.toLocaleString("es-AR", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const ctx: Contexto = {
      usr,
      // En el grupo lo lee todo el equipo: los costos y márgenes solo se muestran por privado.
      costos: veCostos(usr) && privado,
      hoy: new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(ahora),
    };
    const encabezado = `[${usr.nombre} · ${rol} · ${cuando} · ${audio ? "audio transcripto" : "texto"} · ` +
      `${privado ? "chat privado" : "grupo del equipo" + (veCostos(usr) ? " (acá no se muestran costos ni márgenes: se piden por privado)" : "")}]`;
    const nota = descartadas ? "[sistema: la propuesta anterior quedó sin confirmar y se descartó]\n" : "";

    const r = await correrAgente(ctx, historial, `${nota}${encabezado}\n${entrada}`);

    const cabecera = transcripto ? `🎙 <i>${t(recortar(transcripto, 600))}</i>\n\n` : "";
    if (r.acciones.length === 0) {
      await responder(m, cabecera + t(r.texto || "No tengo nada para decir sobre eso."));
    } else {
      const lista = r.acciones.map((a, i) => (r.acciones.length > 1 ? `<b>${i + 1}.</b> ` : "") + t(a.resumen)).join("\n\n");
      const cuerpo = `${cabecera}${r.texto ? t(r.texto) + "\n\n" : ""}<b>Para confirmar:</b>\n${lista}`;
      const [p] = await sql`
        INSERT INTO bot_pendientes (chat_id, telegram_id, usuario_id, acciones, texto)
        VALUES (${clave.chat}, ${clave.tg}, ${usr.id}, ${sql.json(r.acciones as any)}, ${cuerpo}) RETURNING id`;
      const enviado = await responder(m, cuerpo, {
        reply_markup: { inline_keyboard: [[
          { text: "✅ Confirmar", callback_data: `ok:${p.id}` },
          { text: "❌ Cancelar", callback_data: `no:${p.id}` },
        ]] },
      });
      if (enviado?.message_id) await sql`UPDATE bot_pendientes SET mensaje_id = ${enviado.message_id} WHERE id = ${p.id}`;
      // Sin el mensaje no hay botón que tocar: la propuesta no puede quedar viva.
      else await sql`UPDATE bot_pendientes SET estado = 'cancelada', resuelto_en = now() WHERE id = ${p.id}`;
    }
    await guardarConversacion(clave, r.historial);
  } catch (err: any) {
    console.error("Asistente: no se pudo atender el mensaje:", err?.status || "", err?.message);
    await responder(m, "Tuve un problema para procesar eso y no cambié nada. Probá de nuevo en un rato.");
  } finally {
    clearInterval(latido);
  }
}

const recortar = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

/* --------------------------------------------------------------- vinculación */
const intentos = new Map<number, { n: number; desde: number }>();

async function vincular(m: any, codigo: string) {
  const c = codigo.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!c) return void (await responder(m, COMO_VINCULAR));

  // Cinco códigos errados por hora y por persona: nadie los prueba de a miles.
  const ahora = Date.now();
  const i = intentos.get(m.from.id);
  if (i && ahora - i.desde < 3600_000 && i.n >= 5) {
    return void (await responder(m, "Demasiados intentos. Probá de nuevo en una hora."));
  }

  const [v] = await sql`DELETE FROM bot_vinculos WHERE codigo = ${c} AND vence > now() RETURNING usuario_id`;
  if (!v) {
    intentos.set(m.from.id, i && ahora - i.desde < 3600_000 ? { n: i.n + 1, desde: i.desde } : { n: 1, desde: ahora });
    return void (await responder(m, "Ese código no existe o ya venció. Generá uno nuevo en <b>Mi cuenta</b>."));
  }
  intentos.delete(m.from.id);

  const [usr] = await sql.begin(async (tx) => {
    // Un Telegram, un usuario: si estaba vinculado a otro, se suelta.
    await tx`UPDATE usuarios SET telegram_id = NULL WHERE telegram_id = ${m.from.id}`;
    return tx`UPDATE usuarios SET telegram_id = ${m.from.id} WHERE id = ${v.usuario_id} AND activo RETURNING id, nombre`;
  });
  if (!usr) return void (await responder(m, "Ese usuario ya no está activo en el sistema."));
  await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
            VALUES (${usr.id}, 'usuario', ${usr.id}, 'telegram_vinculado', ${String(m.from.username || m.from.first_name || m.from.id)})`;
  await responder(m, `Listo, ${t(usr.nombre)}: ya te reconozco.\n\n${AYUDA}`);
}

/* -------------------------------------------------------------- conversación */
type Clave = { chat: number; tg: number };

async function cargarConversacion(k: Clave): Promise<Mensajes> {
  const [c] = await sql`
    SELECT mensajes FROM bot_conversaciones
    WHERE chat_id = ${k.chat} AND telegram_id = ${k.tg}
      AND actualizado_en > now() - make_interval(mins => ${MINUTOS_CONVERSACION})`;
  if (!c || c.mensajes.length > MAX_HISTORIAL) return [];
  try { return JSON.parse(c.mensajes) as Mensajes; } catch { return []; }
}

async function guardarConversacion(k: Clave, mensajes: Mensajes) {
  await sql`
    INSERT INTO bot_conversaciones (chat_id, telegram_id, mensajes, actualizado_en)
    VALUES (${k.chat}, ${k.tg}, ${JSON.stringify(mensajes)}, now())
    ON CONFLICT (chat_id, telegram_id) DO UPDATE SET mensajes = EXCLUDED.mensajes, actualizado_en = now()`;
}

/** Suma al final de la conversación lo que pasó con una propuesta, para que el agente lo sepa. */
async function anotarEnConversacion(k: Clave, nota: string) {
  const historial = await cargarConversacion(k);
  if (historial.length === 0) return;
  await guardarConversacion(k, [...historial, { role: "user", content: nota }]);
}

/* --------------------------------------------------------------- propuestas */

/** Lo que quedó esperando el botón se cae cuando la persona sigue hablando. Devuelve si había algo. */
async function descartarPendientes(k: Clave) {
  const viejas = await sql`
    UPDATE bot_pendientes SET estado = 'cancelada', resuelto_en = now()
    WHERE chat_id = ${k.chat} AND telegram_id = ${k.tg} AND estado = 'pendiente'
    RETURNING mensaje_id, texto`;
  for (const p of viejas) {
    if (p.mensaje_id) await editar(k.chat, p.mensaje_id, p.texto + "\n\n⏹ <i>Sin confirmar: se descartó.</i>");
  }
  return viejas.length > 0;
}

/** Reescribe el mensaje de una propuesta. Al no mandar botones, Telegram los saca. */
async function editar(chat: number, mensajeId: number, html: string) {
  const base = { chat_id: chat, message_id: Number(mensajeId), disable_web_page_preview: true };
  return (await tg("editMessageText", { ...base, text: entero(html), parse_mode: "HTML" }))
    ?? tg("editMessageText", { ...base, text: entero(sinEtiquetas(html)) });
}

async function manejarBoton(q: any) {
  const aviso = (text?: string, alerta = false) =>
    tg("answerCallbackQuery", { callback_query_id: q.id, ...(text ? { text, show_alert: alerta } : {}) });

  const partes = /^(ok|no):(\d+)$/.exec(String(q.data || ""));
  if (!partes) return void (await aviso());
  const confirma = partes[1] === "ok";
  const [p] = await sql`SELECT *, creado_en < now() - make_interval(mins => ${MINUTOS_CONFIRMAR}) AS vencida
                        FROM bot_pendientes WHERE id = ${Number(partes[2])}`;
  if (!p) return void (await aviso("Esa propuesta ya no existe."));
  if (String(p.telegram_id) !== String(q.from?.id)) return void (await aviso("Solo puede confirmarlo quien lo pidió.", true));

  // El primer toque se queda con la propuesta: un doble clic no la ejecuta dos veces.
  const estado = p.vencida ? "vencida" : confirma ? "confirmada" : "cancelada";
  const [mia] = await sql`UPDATE bot_pendientes SET estado = ${estado}, resuelto_en = now()
                          WHERE id = ${p.id} AND estado = 'pendiente' RETURNING id`;
  if (!mia) return void (await aviso("Eso ya se resolvió."));
  await aviso(estado === "confirmada" ? "Confirmado, lo cargo…" : estado === "cancelada" ? "Cancelado" : "Venció");

  const clave: Clave = { chat: Number(p.chat_id), tg: Number(p.telegram_id) };
  return enCola(`${clave.chat}:${clave.tg}`, async () => {
    const cerrar = (cola: string) => (p.mensaje_id ? editar(clave.chat, p.mensaje_id, p.texto + "\n\n" + cola) : null);

    if (estado === "vencida") {
      await cerrar("⌛ <i>Venció sin confirmar. No se cambió nada: pedímelo de nuevo.</i>");
      return;
    }
    if (estado === "cancelada") {
      await cerrar("❌ <i>Cancelado. No se cambió nada.</i>");
      await anotarEnConversacion(clave, "[sistema: la persona canceló la propuesta. No se cambió nada.]");
      return;
    }

    // Se ejecuta con el usuario como está hoy: si lo dieron de baja o lo desvincularon, no corre.
    const usr = await usuarioDeTelegram(clave.tg);
    if (!usr || usr.id !== Number(p.usuario_id)) {
      await cerrar("✖ <i>Tu usuario ya no está vinculado o activo. No se cambió nada.</i>");
      return;
    }

    const acciones: Accion[] = p.acciones;
    const lineas: string[] = [];
    const paraElAgente: string[] = [];
    let cortado = false;
    for (const a of acciones) {
      const titulo = a.resumen.split("\n")[0];
      if (cortado) {
        lineas.push(`⏸ No se hizo: ${t(titulo)}`);
        paraElAgente.push(`NO se ejecutó: ${titulo}`);
        continue;
      }
      const r = await ejecutar(usr, a);
      if ("error" in r) {
        // Lo que sigue podía depender de esto: se frena acá.
        lineas.push(`✖ No se pudo: ${t(titulo)}\n   ${t(r.error)}`);
        paraElAgente.push(`FALLÓ: ${titulo} — ${r.error}`);
        cortado = true;
      } else {
        lineas.push("✔ " + (r.ruta ? enlace(r.ruta, r.texto) : t(r.texto)));
        paraElAgente.push(`Hecho: ${r.texto}${r.ruta ? ` (${r.ruta})` : ""}`);
      }
    }
    await cerrar((cortado ? "⚠️ <b>Confirmado, pero no salió todo:</b>\n" : "✅ <b>Hecho:</b>\n") + lineas.join("\n"));
    await anotarEnConversacion(clave, `[sistema: ${usr.nombre} confirmó la propuesta. ${paraElAgente.join(" · ")}]`);
  });
}

/* --------------------------------------------------------------------- aseo */

/** Lo llama el reloj de instrumentation.ts: lo viejo no hace falta guardarlo. */
export async function limpiar() {
  await sql`DELETE FROM bot_updates WHERE recibido_en < now() - interval '2 days'`;
  await sql`DELETE FROM bot_vinculos WHERE vence < now()`;
  await sql`DELETE FROM bot_conversaciones WHERE actualizado_en < now() - interval '1 day'`;
  await sql`UPDATE bot_pendientes SET estado = 'vencida', resuelto_en = now()
            WHERE estado = 'pendiente' AND creado_en < now() - make_interval(mins => ${MINUTOS_CONFIRMAR})`;
  await sql`DELETE FROM bot_pendientes WHERE creado_en < now() - interval '30 days'`;
}

/**
 * Le dice a Telegram dónde mandar lo que le escriben al bot. Se llama al
 * arrancar el servidor; hacerlo de nuevo no cambia nada. Sin las claves del
 * asistente no se registra y el bot sigue como estaba: solo manda avisos.
 */
export async function registrarWebhook() {
  const base = (process.env.CRM_PUBLIC_URL || "").replace(/\/$/, "");
  if (!asistenteConfigurado() || !base.startsWith("https://")) return false;
  const ok = await tg("setWebhook", {
    url: base + "/api/telegram/webhook",
    secret_token: secretoWebhook(),
    allowed_updates: ["message", "callback_query"],
    max_connections: 5,
  });
  if (ok) {
    await tg("setMyCommands", { commands: [
      { command: "ayuda", description: "Qué le podés pedir al asistente" },
      { command: "vincular", description: "Vincular tu usuario del sistema (con el código de Mi cuenta)" },
    ] });
    console.log("Asistente de Telegram: webhook registrado.");
    const bot = await datosDelBot();
    if (bot && !bot.lee_grupos) {
      console.log("Asistente de Telegram: el bot tiene el modo privacidad activo y no recibe los audios del grupo. " +
        "Se desactiva en BotFather (/setprivacy → Disable) y hay que sacar y volver a agregar el bot al grupo.");
    }
  }
  return !!ok;
}
