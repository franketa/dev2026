import { sql } from "./db";
import { avisar, enlace, plataAviso, t, telegramConfigurado } from "./telegram";
import { HORAS_SIN_CONTACTAR } from "./leads";
import { DIAS_TRANSFERENCIA, DIAS_VTV, TRAMITE_TERMINADO } from "./constantes";

/**
 * El resumen de la mañana por Telegram: lo que vence, lo que está atrasado y
 * lo que hay que llamar hoy. Los avisos de cosas que pasan (lead nuevo, seña,
 * venta) salen en el momento; este junta los que dependen del calendario.
 */

const ZONA = "America/Argentina/Buenos_Aires";
const HORA_RESUMEN = 9;

const hoyAR = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
const horaAR = () => Number(new Intl.DateTimeFormat("en-US", { timeZone: ZONA, hour: "numeric", hourCycle: "h23" }).format(new Date()));
const diaSemanaAR = () => new Intl.DateTimeFormat("en-US", { timeZone: ZONA, weekday: "short" }).format(new Date());
const fc = (d: any) => new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

export async function armarResumen(): Promise<string | null> {
  const [senas, cobranzas, demoradas, cruzaron, llamados, transferencias, vtv, leads] = await Promise.all([
    sql`SELECT v.id, v.sena_vence, v.sena, x.marca, x.modelo, c.nombre AS cliente,
               (v.sena_vence - current_date) AS dias
        FROM ventas v JOIN vehiculos x ON x.id = v.vehiculo_id
        LEFT JOIN clientes c ON c.id = v.cliente_id
        WHERE v.estado = 'reserva' AND v.sena_vence IS NOT NULL AND v.sena_vence <= current_date + 1
        ORDER BY v.sena_vence`,
    sql`SELECT cb.concepto, cb.vencimiento, cb.monto - cb.cobrado AS debe, cb.moneda, c.nombre AS cliente
        FROM cobranzas cb LEFT JOIN clientes c ON c.id = cb.cliente_id
        WHERE cb.estado NOT IN ('cobrado','incobrable') AND cb.vencimiento < current_date
          AND cb.monto > cb.cobrado
        ORDER BY cb.vencimiento`,
    sql`SELECT count(*)::int AS n FROM v_vehiculos
        WHERE estado NOT IN ('vendido','baja') AND dias_stock > 60`,
    sql`SELECT id, marca, modelo, anio, dias_stock FROM v_vehiculos
        WHERE estado NOT IN ('vendido','baja')
          AND (dias_stock = 61 OR (${diaSemanaAR() === "Mon"} AND dias_stock > 60))
        ORDER BY dias_stock DESC LIMIT 10`,
    sql`SELECT pv.venta_id, c.nombre AS cliente, c.telefono, x.marca, x.modelo
        FROM postventa pv JOIN ventas v ON v.id = pv.venta_id
        LEFT JOIN clientes c ON c.id = v.cliente_id LEFT JOIN vehiculos x ON x.id = v.vehiculo_id
        WHERE v.estado <> 'cancelada' AND pv.contacto_7 IS NULL AND current_date - pv.entrega >= 7`,
    sql`SELECT pv.venta_id, c.nombre AS cliente, x.marca, x.modelo, current_date - pv.entrega AS dias
        FROM postventa pv JOIN ventas v ON v.id = pv.venta_id
        LEFT JOIN clientes c ON c.id = v.cliente_id LEFT JOIN vehiculos x ON x.id = v.vehiculo_id
        WHERE v.estado <> 'cancelada' AND NOT (v.estado_tramite = ANY(${TRAMITE_TERMINADO}))
          AND current_date - pv.entrega >= ${DIAS_TRANSFERENCIA}`,
    sql`SELECT pv.venta_id, pv.vtv_vence, c.nombre AS cliente, c.telefono, x.marca, x.modelo
        FROM postventa pv JOIN ventas v ON v.id = pv.venta_id
        LEFT JOIN clientes c ON c.id = v.cliente_id LEFT JOIN vehiculos x ON x.id = v.vehiculo_id
        WHERE v.estado <> 'cancelada' AND pv.vtv_vence IS NOT NULL
          AND pv.vtv_vence <= current_date + ${DIAS_VTV} AND pv.vtv_vence >= current_date - 30`,
    sql`SELECT id, nombre FROM leads
        WHERE estado = 'nuevo' AND creado_en < now() - make_interval(hours => ${HORAS_SIN_CONTACTAR})
        ORDER BY creado_en LIMIT 10`,
  ]);

  const bloques: string[] = [];
  const max = <T,>(xs: T[], n = 6) => xs.slice(0, n);
  const mas = (xs: any[], n = 6) => (xs.length > n ? `\n   …y ${xs.length - n} más` : "");

  if (senas.length) {
    bloques.push("💰 <b>Señas</b>\n" + max(senas).map((s: any) =>
      `• ${enlace("/ventas/" + s.id, `${s.marca} ${s.modelo}`)}${s.cliente ? " — " + t(s.cliente) : ""}: ` +
      (Number(s.dias) < 0 ? `<b>vencida</b> el ${fc(s.sena_vence)}` : Number(s.dias) === 0 ? "<b>vence hoy</b>" : "vence mañana")
    ).join("\n") + mas(senas));
  }
  if (cobranzas.length) {
    bloques.push("📌 <b>Cobros y cuotas vencidas</b>\n" + max(cobranzas).map((c: any) =>
      `• ${t(c.cliente || c.concepto)}: ${plataAviso(c.debe, c.moneda)} (venció ${fc(c.vencimiento)})`
    ).join("\n") + mas(cobranzas));
  }
  if (cruzaron.length) {
    bloques.push(`⏳ <b>Autos con más de 60 días</b> (${demoradas[0]?.n ?? cruzaron.length} en total)\n` +
      cruzaron.map((v: any) => `• ${enlace("/vehiculos/" + v.id, `${v.marca} ${v.modelo} ${v.anio || ""}`)}: ${v.dias_stock} días`).join("\n"));
  }
  const pv: string[] = [];
  for (const l of max(llamados)) pv.push(`• Llamar a ${t(l.cliente || "cliente")} (${t(l.marca)} ${t(l.modelo)}) — 7 días de la entrega`);
  for (const x of max(transferencias)) pv.push(`• Transferencia demorada: ${t(x.marca)} ${t(x.modelo)} de ${t(x.cliente || "—")}, ${x.dias} días`);
  for (const v of max(vtv)) pv.push(`• VTV de ${t(v.cliente || "—")} (${t(v.marca)} ${t(v.modelo)}) vence el ${fc(v.vtv_vence)}`);
  if (pv.length) bloques.push(`🤝 ${enlace("/postventa", "Postventa")}\n` + pv.join("\n"));
  if (leads.length) {
    bloques.push(`🔥 <b>Leads sin contactar hace más de ${HORAS_SIN_CONTACTAR} h</b>\n` +
      leads.map((l: any) => `• ${enlace("/leads/" + l.id, l.nombre)}`).join("\n"));
  }

  if (!bloques.length) return null;
  return `☀️ <b>Resumen del día · Garrahan</b>\n\n` + bloques.join("\n\n");
}

/** Manda el resumen ya. Devuelve si había algo para mandar. */
export async function mandarResumen() {
  const texto = await armarResumen();
  if (!texto) return false;
  return avisar(texto);
}

/**
 * Lo llama el reloj de instrumentation.ts cada 15 minutos. Manda una vez por
 * día, después de las 9: la clave en avisos_enviados lo garantiza aunque haya
 * dos procesos o el contenedor se reinicie.
 */
export async function tic() {
  if (!telegramConfigurado() || horaAR() < HORA_RESUMEN) return;
  const clave = "resumen:" + hoyAR();
  const [nuevo] = await sql`INSERT INTO avisos_enviados (clave) VALUES (${clave})
                            ON CONFLICT (clave) DO NOTHING RETURNING clave`;
  if (!nuevo) return;
  try {
    const texto = await armarResumen();
    if (texto && !(await avisar(texto))) {
      // Falló el envío: se suelta la clave para reintentar en el próximo tic.
      await sql`DELETE FROM avisos_enviados WHERE clave = ${clave}`;
    }
  } catch (err: any) {
    console.error("Resumen diario:", err?.message);
    await sql`DELETE FROM avisos_enviados WHERE clave = ${clave}`;
  }
}
