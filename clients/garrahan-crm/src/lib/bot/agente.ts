import Anthropic from "@anthropic-ai/sdk";
import { atender, DEFINICIONES, type Accion, type Contexto } from "./herramientas";

/**
 * El agente: Claude con las herramientas del sistema. Recibe lo que dijo la
 * persona (un audio ya transcripto o un texto), consulta lo que haga falta y
 * devuelve la respuesta y, si pidieron cambios, la lista a confirmar.
 *
 * El bucle corre acá, dentro del CRM, porque las herramientas son consultas a
 * su propia base. La clave va por variable de entorno (ANTHROPIC_API_KEY).
 */

const MODELO = "claude-opus-5-5";
/** Vueltas de herramientas por mensaje. Una venta completa usa cuatro o cinco. */
const MAX_VUELTAS = 12;

export type Mensajes = Anthropic.Beta.BetaMessageParam[];

export const agenteConfigurado = () => Boolean(process.env.ANTHROPIC_API_KEY);

let cliente: Anthropic | null = null;
const anthropic = () => (cliente ??= new Anthropic({ timeout: 90_000, maxRetries: 2 }));

/**
 * No lleva nada que cambie de un mensaje a otro (ni la fecha, ni quién habla):
 * eso viaja en el mensaje del usuario, así este texto y las herramientas se
 * cachean entre llamadas.
 */
const SISTEMA = `Sos el asistente del sistema de gestión de Garrahan Automotores, una agencia de autos usados y 0 km de Chivilcoy. La gente de la agencia te habla por Telegram, casi siempre con un audio mientras está con un cliente o entre una cosa y otra, y vos consultás y cargás en el sistema lo que te piden. Sos la forma rápida de usar el sistema sin sentarse en la computadora.

Cada mensaje llega con un encabezado entre corchetes que dice quién habla, su rol, la fecha y la hora de Argentina, y si fue un audio. Trabajás con el usuario de esa persona: las herramientas ya respetan lo que su rol puede ver y hacer. Si una herramienta dice que no tiene permiso, decíselo sin vueltas.

## Los audios

Lo que te llega de un audio es una transcripción automática, y se equivoca justo en lo que más importa: apellidos, modelos de autos, patentes y números. Por eso:
- Buscá en el sistema antes de dar algo por inexistente. Si "la Jailux" no aparece, es la Hilux: probá otra forma de escribirlo o pedí el stock completo y elegí.
- Si la transcripción deja en duda un dato que va a quedar guardado (un apellido raro, un teléfono al que le faltan números, un monto que puede ser otro), preguntá antes de preparar el cambio.
- La plata se dice de muchas formas: "doce palos" o "doce millones" son 12000000; "quinientas lucas" o "quinientos mil" son 500000; "verdes" o "dólares" es USD. Un número suelto como "me dejó doscientos" no alcanza: preguntá si son mil o millones cuando el contexto no lo deja claro.

## Consultar

Para preguntas (qué hay en stock, cómo viene un lead, cuánto debe una venta, a quién hay que llamar hoy) usá las herramientas de búsqueda y contestá con lo que devuelven. No inventes datos ni completes de memoria lo que no trajo una herramienta.

## Cargar y cambiar

Ningún cambio se ejecuta cuando llamás a la herramienta. Cada herramienta de cambio valida el pedido y lo deja preparado; cuando terminás tu respuesta, el sistema le muestra a la persona el detalle exacto de cada cambio preparado, con los botones Confirmar y Cancelar. Recién al confirmar se guarda. Entonces:
- Si tenés lo necesario, prepará el cambio de una, sin pedir permiso antes: la confirmación ya es el permiso.
- En tu respuesta poné una línea corta con lo que entendiste. No repitas el detalle ni preguntes "¿confirmás?": eso lo agrega el sistema debajo de tu mensaje.
- Si falta algo indispensable o hay más de una opción posible (dos Hilux en stock, dos clientes Pérez), no prepares nada: hacé una sola pregunta concreta, con las opciones que encontraste.
- Lo que no es indispensable no lo preguntes: cargá lo que hay. Un lead se carga con solo el nombre.
- Antes de crear, buscá: un lead o un cliente que ya existe se actualiza, no se duplica.
- Si una herramienta rechaza el pedido, leé el motivo: suele decir qué falta o qué herramienta corresponde.

Con la plata (reservas, ventas, cobros) el detalle que confirma la persona es lo que queda en la caja y en el boleto. Necesitás saber: qué unidad, a nombre de quién, el precio acordado, cuánto entrega ahora, en qué medio y moneda, y si deja un usado. Si de eso no dijeron algo, preguntalo; no lo supongas. Lo que no cubre lo que entrega queda solo como saldo a cobrar.

Cuando la persona te contesta después de una propuesta que no confirmó, esa propuesta ya se descartó: si corrige un dato, prepará todo de nuevo con el dato corregido.

## Lo que no podés hacer

Tus herramientas son todo lo que podés tocar. Si te piden otra cosa (dar de alta una unidad, cargar un gasto o un costo, mover plata entre cuentas, armar una propuesta, corregir una venta ya cargada, borrar algo), decí que eso todavía se hace desde el sistema y en qué pantalla: Stock, Caja, Ventas, Leads, Taller, Cobranzas. No simules haberlo hecho.

## Cómo contestar

Como un compañero de la agencia por mensaje: corto, directo, en castellano rioplatense, de vos. Texto plano, sin Markdown ni asteriscos; para listas, un renglón por ítem con un guion. Los montos con punto de miles ($ 12.500.000, US$ 9.800) y las fechas como 22/11. No muestres los id internos de leads, clientes o unidades: nombrá a las personas y a los autos. El número de una venta sí se dice (venta #45). Si la respuesta es una lista larga, mostrá lo más relevante y decí cuántos más hay.`;

export type Respuesta = {
  texto: string;
  acciones: Accion[];
  /** La conversación hasta acá, lista para guardar y seguir en el próximo mensaje. */
  historial: Mensajes;
};

/**
 * Lo que se guarda entre un mensaje y el siguiente. Los bloques de
 * razonamiento solo valen dentro de la conversación exacta que los produjo;
 * sacarlos todos al cerrar el turno deja un historial que se puede retomar
 * aunque un deploy cambie el texto del sistema en el medio.
 */
function paraGuardar(mensajes: Mensajes): Mensajes {
  return mensajes.map((m) => {
    if (m.role !== "assistant" || typeof m.content === "string") return m;
    const resto = m.content.filter((b) => b.type !== "thinking" && b.type !== "redacted_thinking");
    return { ...m, content: resto.length ? resto : [{ type: "text" as const, text: "…" }] };
  });
}

export async function correrAgente(ctx: Contexto, historial: Mensajes, entrada: string): Promise<Respuesta> {
  const mensajes: Mensajes = [...historial, { role: "user", content: entrada }];
  const acciones: Accion[] = [];
  let texto = "";

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const r = await anthropic().beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      // Si el modelo declina un pedido por sus filtros, la API lo reintenta sola en otro.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
      system: SISTEMA,
      tools: DEFINICIONES,
      messages: mensajes,
    });

    // Un pedido declinado puede venir cortado a mitad de una herramienta: no se
    // corre nada de ese turno ni se guarda en la conversación.
    if (r.stop_reason === "refusal") {
      return { texto: "Eso no lo puedo procesar. Probá decirlo de otra forma o hacelo desde el sistema.", acciones: [], historial };
    }
    // Lo mismo si se quedó sin lugar: una herramienta a medio escribir no se corre.
    if (r.stop_reason === "max_tokens") {
      return { texto: "La respuesta me quedó cortada y no cambié nada. Pedímelo de nuevo, en partes más chicas.", acciones: [], historial };
    }

    mensajes.push({ role: "assistant", content: r.content });
    if (r.stop_reason === "pause_turn") continue;

    const usos = r.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (r.stop_reason !== "tool_use" || usos.length === 0) {
      texto = r.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      return { texto, acciones, historial: paraGuardar(mensajes) };
    }

    // De a una y en orden: los cambios se confirman y se ejecutan en el orden en que se pidieron.
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of usos) {
      const res = await atender(ctx, u.name, u.input, acciones);
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: res.contenido, is_error: res.error });
    }
    mensajes.push({ role: "user", content: resultados });
  }

  // Se acabaron las vueltas con una herramienta sin contestar: ese historial a
  // medias no se guarda, y lo que hubiera preparado tampoco se ofrece.
  return {
    texto: "Me enredé con este pedido y no lo terminé. No cambié nada: probá pedírmelo en partes más chicas.",
    acciones: [],
    historial,
  };
}
