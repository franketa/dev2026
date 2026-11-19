import type Anthropic from "@anthropic-ai/sdk";
import { sql } from "../db";
import { puede, type Usuario } from "../auth";
import { leadsVisibles, puedeVerLead } from "../leads";
import {
  crearLead, editarLead, registrarSeguimiento, cambiarEstadoLead, marcarLeadPerdido, TIPOS_SEGUIMIENTO,
} from "../leads-operar";
import {
  crearVenta, registrarPago, cambiarEstadoVenta, extenderSena, enDias, MEDIOS_A_CAJA,
} from "../ventas-operar";
import { ventaActiva } from "../ventas";
import { guardarCliente } from "../clientes";
import { cotizacionDeHoy } from "../cotizacion";
import {
  ESTADOS_LEAD, ESTADOS_VEHICULO, ESTADOS_VENTA, ESTADOS_TRAMITE, MEDIOS_PAGO, ORIGENES_LEAD,
} from "../constantes";
import { SIN_PERMISO } from "../aviso";
import { fallo, type Res } from "../resultado";

/**
 * Lo que el asistente de Telegram puede hacer en el sistema.
 *
 * Las consultas se contestan en el momento. Los cambios no: `preparar` valida
 * el pedido contra la base y arma un renglón que la persona lee y confirma con
 * un botón; recién ahí corre `ejecutar`, que llama a las mismas operaciones
 * que usan las pantallas (lib/leads-operar, lib/ventas-operar). El asistente
 * actúa con el usuario de quien le habla y no puede más que él.
 */

export type Contexto = {
  usr: Usuario;
  /** Ve costos y márgenes: por rol, y solo en un chat privado. */
  costos: boolean;
  /** Hoy en Argentina, AAAA-MM-DD. */
  hoy: string;
};

/** Un cambio ya validado, a la espera de que lo confirmen. */
export type Accion = { tipo: string; datos: any; resumen: string };

type Definicion = Anthropic.Beta.BetaTool;
type Hecho = Res<{ texto: string; ruta?: string }>;
type Consulta = { def: Definicion; leer: (ctx: Contexto, i: any) => Promise<unknown> };
type Cambio = {
  def: Definicion;
  preparar: (ctx: Contexto, i: any) => Promise<{ datos: any; resumen: string } | { error: string }>;
  ejecutar: (usr: Usuario, datos: any) => Promise<Hecho>;
};

/* ------------------------------------------------------------------ lectura
   Lo que manda el modelo se trata como un formulario: se limpia campo por campo. */
const str = (v: unknown, max = 300) => {
  const s = typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "";
  return s === "" ? null : s;
};
const ent = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const monto = (v: unknown) => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) && n > 0 ? n : null;
};
const fechaIso = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) ? v : null;
const moneda = (v: unknown): "ARS" | "USD" => (v === "USD" ? "USD" : "ARS");

const plata = (n: unknown, m: string = "ARS") =>
  (m === "USD" ? "US$ " : "$ ") + Math.round(Number(n || 0)).toLocaleString("es-AR");
const dia = (v: unknown) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
/** Un timestamp, como fecha en Argentina. */
const diaAR = (v: unknown) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? null
    : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(d);
};
const dm = (iso: string | null) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "—");
const unidad = (v: any) => [v.marca, v.modelo, v.version, v.anio].filter(Boolean).join(" ");
const persona = (c: any) => [c.nombre, c.apellido].filter(Boolean).join(" ");
const digitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** Compara sin mayúsculas ni acentos: «citroen» encuentra «Citroën». */
const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const sinAcentos = (expr: any) => sql`translate(lower(${expr}), 'áéíóúüëïñ', 'aeiouuein')`;
const palabras = (texto: unknown) => (str(texto) || "").split(/\s+/).filter(Boolean).slice(0, 6).map(plano);
/** Todas las palabras tienen que aparecer en el texto armado con esas columnas. */
const contiene = (ps: string[], expr: any) =>
  ps.reduce((acc, p) => sql`${acc} AND ${sinAcentos(expr)} LIKE ${"%" + p + "%"}`, sql`TRUE`);

const NO = { error: SIN_PERMISO + " Tu usuario no tiene acceso a esa parte del sistema." };

/* ================================================================ consultas */

const buscar_vehiculos: Consulta = {
  def: {
    name: "buscar_vehiculos",
    description:
      "Busca unidades del stock. Sin texto devuelve todo lo que está en venta. Devuelve el id de cada unidad, " +
      "que es lo que piden las demás herramientas. Los nombres de modelos pueden venir mal transcriptos del audio: " +
      "si no aparece, probá con otra forma de escribirlo o buscá sin texto y elegí de la lista.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Marca, modelo, versión, año, color o patente. Varias palabras achican la búsqueda." },
        estado: {
          type: "string",
          enum: ["en_venta", "todos", ...Object.keys(ESTADOS_VEHICULO)],
          description: "en_venta (por defecto) = disponibles y señados.",
        },
      },
    },
  },
  async leer(ctx, i) {
    if (!puede(ctx.usr, "vehiculos")) return NO;
    const estado = str(i.estado) || "en_venta";
    const porEstado = estado === "todos" ? sql`TRUE`
      : estado === "en_venta" ? sql`v.estado IN ('disponible','reservado')`
      : sql`v.estado = ${estado}`;
    const filas = await sql`
      SELECT v.id, v.marca, v.modelo, v.version, v.anio, v.km, v.color, v.dominio, v.estado,
             v.precio_venta, v.moneda_venta, v.precio_oferta, v.precio_minimo, v.dias_stock, v.sucursal,
             v.costo_total, v.margen
      FROM v_vehiculos v
      WHERE ${porEstado}
        AND ${contiene(palabras(i.texto), sql`concat_ws(' ', v.marca, v.modelo, v.version, v.anio, v.dominio, v.color)`)}
      ORDER BY v.marca, v.modelo, v.anio LIMIT 40`;
    return {
      unidades: filas.map((v: any) => ({
        id: v.id, unidad: unidad(v), km: v.km, color: v.color, patente: v.dominio,
        estado: ESTADOS_VEHICULO[v.estado]?.label || v.estado,
        precio: plata(v.precio_venta, v.moneda_venta),
        ...(v.precio_oferta ? { precio_oferta: plata(v.precio_oferta, v.moneda_venta) } : {}),
        ...(v.precio_minimo ? { minimo_autorizado: plata(v.precio_minimo, v.moneda_venta) } : {}),
        dias_en_stock: v.dias_stock, sucursal: v.sucursal,
        ...(ctx.costos ? { costo_total: plata(v.costo_total), margen: plata(v.margen) } : {}),
      })),
      ...(filas.length === 40 ? { nota: "Hay más: son las primeras 40. Afiná la búsqueda." } : {}),
    };
  },
};

const ver_vehiculo: Consulta = {
  def: {
    name: "ver_vehiculo",
    description: "La ficha de una unidad: datos, precio, papeles, si tiene una venta o reserva viva y cuántos leads la consultaron.",
    input_schema: { type: "object", properties: { vehiculo_id: { type: "integer" } }, required: ["vehiculo_id"] },
  },
  async leer(ctx, i) {
    if (!puede(ctx.usr, "vehiculos")) return NO;
    const id = ent(i.vehiculo_id);
    const [v] = await sql`SELECT * FROM v_vehiculos WHERE id = ${id}`;
    if (!v) return { error: "No hay una unidad con ese id." };
    const [ficha] = await sql`SELECT * FROM vehiculo_ficha WHERE vehiculo_id = ${id}`;
    const viva = await ventaActiva(v.id);
    const [interes] = await sql`SELECT count(*)::int AS n FROM leads
                                WHERE vehiculo_id = ${id} AND estado NOT IN ('vendido','perdido')`;
    return {
      id: v.id, unidad: unidad(v), patente: v.dominio, km: v.km, color: v.color,
      combustible: v.combustible, transmision: v.transmision, condicion: v.condicion,
      estado: ESTADOS_VEHICULO[v.estado]?.label || v.estado,
      precio: plata(v.precio_venta, v.moneda_venta),
      precio_oferta: v.precio_oferta ? plata(v.precio_oferta, v.moneda_venta) : null,
      minimo_autorizado: v.precio_minimo ? plata(v.precio_minimo, v.moneda_venta) : null,
      acepta_permuta: v.acepta_permuta, acepta_financiacion: v.acepta_financiacion,
      publicado_en_la_web: v.publicado, dias_en_stock: v.dias_stock, sucursal: v.sucursal,
      ingreso: dia(v.fecha_ingreso), observaciones: v.observaciones,
      papeles: ficha ? {
        vtv: ficha.vtv, vtv_vence: dia(ficha.vtv_vence), titulo: ficha.titulo, cedula: ficha.cedula,
        formulario_08: ficha.form_08, informe_de_dominio: ficha.informe_dominio, prenda: ficha.prenda,
        deuda_patentes: Number(ficha.deuda_patentes || 0), infracciones: Number(ficha.infracciones || 0),
      } : "sin cargar",
      venta_viva: viva ? { venta_id: viva.id, estado: ESTADOS_VENTA[viva.estado]?.label || viva.estado } : null,
      leads_interesados: interes.n,
      ...(ctx.costos ? {
        valor_de_compra: plata(v.valor_compra, v.moneda_compra), costos_cargados: plata(v.costos),
        costo_total: plata(v.costo_total), margen: plata(v.margen), margen_pct: Number(v.margen_pct),
        propiedad: v.propiedad, inversor: v.inversor,
      } : {}),
    };
  },
};

const buscar_leads: Consulta = {
  def: {
    name: "buscar_leads",
    description:
      "Busca leads (personas interesadas) por nombre, teléfono o la unidad que consultaron. Solo trae los que " +
      "este usuario puede ver. Usala antes de cargar un lead nuevo, para no duplicar, y para armar la agenda del día.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Nombre, teléfono o unidad." },
        estado: {
          type: "string",
          enum: ["abiertos", "todos", ...Object.keys(ESTADOS_LEAD)],
          description: "abiertos (por defecto) = todo menos vendido, perdido y postergado.",
        },
        para_hoy: { type: "boolean", description: "Solo los que tienen una acción para hoy o atrasada, y los nuevos sin contactar." },
        solo_mios: { type: "boolean", description: "Solo los que tiene asignados este usuario." },
      },
    },
  },
  async leer(ctx, i) {
    if (!puede(ctx.usr, "leads")) return NO;
    const estado = str(i.estado) || "abiertos";
    const porEstado = estado === "todos" ? sql`TRUE`
      : estado === "abiertos" ? sql`l.estado NOT IN ('vendido','perdido','postergado')`
      : sql`l.estado = ${estado}`;
    const ps = palabras(i.texto);
    // Un teléfono se busca por sus números, se haya cargado con guiones o sin.
    const numeros = digitos(i.texto);
    const porTexto = numeros.length >= 6 && ps.length === 1
      ? sql`regexp_replace(COALESCE(l.telefono, ''), '[^0-9]', '', 'g') LIKE ${"%" + numeros + "%"}`
      : contiene(ps, sql`concat_ws(' ', l.nombre, l.telefono, l.vehiculo_texto, v.marca, v.modelo, v.anio)`);
    const filas = await sql`
      SELECT l.id, l.nombre, l.telefono, l.estado, l.origen, l.proxima_accion, l.fecha_proxima,
             l.presupuesto, l.vehiculo_texto, l.entrega_usado, l.creado_en,
             v.marca, v.modelo, v.anio, us.nombre AS asesor
      FROM leads l
      LEFT JOIN vehiculos v ON v.id = l.vehiculo_id
      LEFT JOIN usuarios us ON us.id = l.asesor_id
      WHERE ${leadsVisibles(ctx.usr)} AND ${porEstado} AND ${porTexto}
        AND ${i.para_hoy ? sql`(l.fecha_proxima <= ${ctx.hoy} OR l.estado = 'nuevo')` : sql`TRUE`}
        AND ${i.solo_mios ? sql`l.asesor_id = ${ctx.usr.id}` : sql`TRUE`}
      ORDER BY l.fecha_proxima NULLS LAST, l.actualizado_en DESC LIMIT 30`;
    return {
      leads: filas.map((l: any) => ({
        id: l.id, nombre: l.nombre, telefono: l.telefono,
        estado: ESTADOS_LEAD[l.estado]?.label || l.estado,
        origen: ORIGENES_LEAD[l.origen] || l.origen,
        interes: l.marca ? unidad(l) : l.vehiculo_texto,
        presupuesto: l.presupuesto ? plata(l.presupuesto) : null,
        entrega_usado: l.entrega_usado,
        proxima_accion: l.proxima_accion, fecha_proxima: dia(l.fecha_proxima),
        asesor: l.asesor || "sin asignar", ingreso: diaAR(l.creado_en),
      })),
      ...(filas.length === 30 ? { nota: "Hay más: son los primeros 30. Afiná la búsqueda." } : {}),
    };
  },
};

const ver_lead: Consulta = {
  def: {
    name: "ver_lead",
    description: "La ficha de un lead con sus últimos seguimientos, lo que busca, y la venta si ya se generó.",
    input_schema: { type: "object", properties: { lead_id: { type: "integer" } }, required: ["lead_id"] },
  },
  async leer(ctx, i) {
    if (!puede(ctx.usr, "leads")) return NO;
    const id = ent(i.lead_id) || 0;
    if (!(await puedeVerLead(ctx.usr, id))) return { error: "No hay un lead con ese id entre los que podés ver." };
    const [l] = await sql`
      SELECT l.*, v.marca, v.modelo, v.version, v.anio, v.precio_venta, v.moneda_venta, us.nombre AS asesor
      FROM leads l LEFT JOIN vehiculos v ON v.id = l.vehiculo_id
      LEFT JOIN usuarios us ON us.id = l.asesor_id WHERE l.id = ${id}`;
    const [historial, venta] = await Promise.all([
      sql`SELECT i.tipo, i.detalle, i.fecha, us.nombre AS usuario FROM lead_interacciones i
          LEFT JOIN usuarios us ON us.id = i.usuario_id
          WHERE i.lead_id = ${id} ORDER BY i.fecha DESC, i.id DESC LIMIT 8`,
      sql`SELECT id, estado FROM ventas WHERE lead_id = ${id} ORDER BY id DESC LIMIT 1`,
    ]);
    return {
      id: l.id, nombre: l.nombre, telefono: l.telefono, email: l.email,
      estado: ESTADOS_LEAD[l.estado]?.label || l.estado, origen: ORIGENES_LEAD[l.origen] || l.origen,
      asesor: l.asesor || "sin asignar", cliente_id: l.cliente_id,
      unidad_que_consulto: l.vehiculo_id
        ? { vehiculo_id: l.vehiculo_id, unidad: unidad(l), precio: plata(l.precio_venta, l.moneda_venta) }
        : l.vehiculo_texto,
      presupuesto: l.presupuesto ? plata(l.presupuesto) : null,
      entrega_usado: l.entrega_usado, usado: l.usado_detalle, tasacion: l.tasacion ? plata(l.tasacion) : null,
      proxima_accion: l.proxima_accion, fecha_proxima: dia(l.fecha_proxima),
      observaciones: l.observaciones, motivo_perdida: l.motivo_perdida, ingreso: diaAR(l.creado_en),
      ultimos_seguimientos: historial.map((h: any) => ({
        fecha: diaAR(h.fecha), tipo: h.tipo, detalle: h.detalle, quien: h.usuario || "sistema",
      })),
      venta: venta[0] ? { venta_id: venta[0].id, estado: ESTADOS_VENTA[venta[0].estado]?.label } : null,
    };
  },
};

const buscar_clientes: Consulta = {
  def: {
    name: "buscar_clientes",
    description: "Busca clientes ya cargados por nombre, apellido, DNI/CUIT o teléfono. Usala antes de cargar un comprador nuevo.",
    input_schema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] },
  },
  async leer(ctx, i) {
    if (!puede(ctx.usr, "clientes")) return NO;
    const ps = palabras(i.texto);
    const numeros = digitos(i.texto);
    const porTexto = numeros.length >= 6 && ps.length === 1
      ? sql`(regexp_replace(COALESCE(c.telefono, ''), '[^0-9]', '', 'g') LIKE ${"%" + numeros + "%"}
             OR regexp_replace(COALESCE(c.dni_cuit, ''), '[^0-9]', '', 'g') LIKE ${"%" + numeros + "%"})`
      : contiene(ps, sql`concat_ws(' ', c.nombre, c.apellido, c.dni_cuit, c.telefono)`);
    const filas = await sql`
      SELECT c.id, c.nombre, c.apellido, c.dni_cuit, c.telefono, c.email, c.direccion, c.localidad
      FROM clientes c WHERE ${porTexto} ORDER BY c.apellido NULLS LAST, c.nombre LIMIT 20`;
    return {
      clientes: filas.map((c: any) => ({
        id: c.id, nombre: persona(c), dni_cuit: c.dni_cuit, telefono: c.telefono, email: c.email,
        domicilio: [c.direccion, c.localidad].filter(Boolean).join(", ") || null,
      })),
    };
  },
};

/** Total, cobrado y saldo de cada venta, en pesos. */
const ventasConSaldo = (filtro: any, limite: number) => sql`
  SELECT vt.id, vt.nro_boleto, vt.fecha, vt.estado, vt.estado_tramite, vt.sena, vt.sena_vence,
         vt.precio - vt.descuento AS total, vt.descuento, vt.observaciones, vt.vehiculo_id, vt.lead_id,
         x.marca, x.modelo, x.version, x.anio, x.dominio, x.costo_total,
         c.nombre, c.apellido, c.dni_cuit, c.telefono, us.nombre AS vendedor,
         COALESCE((SELECT SUM(p.monto * CASE WHEN p.moneda = 'USD' THEN COALESCE(p.cotizacion, 1) ELSE 1 END)
                   FROM venta_pagos p WHERE p.venta_id = vt.id), 0) AS cobrado
  FROM ventas vt
  JOIN v_vehiculos x ON x.id = vt.vehiculo_id
  LEFT JOIN clientes c ON c.id = vt.cliente_id
  LEFT JOIN usuarios us ON us.id = vt.vendedor_id
  WHERE ${filtro} ORDER BY vt.id DESC LIMIT ${limite}`;

const buscar_ventas: Consulta = {
  def: {
    name: "buscar_ventas",
    description:
      "Busca ventas y reservas por comprador, unidad, patente o número. Trae el total, lo cobrado y el saldo de " +
      "cada una. Usala para encontrar la venta antes de registrarle un cobro o cambiarle el estado.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Comprador, unidad o patente." },
        numero: { type: "integer", description: "Número de venta (#) o de boleto." },
        estado: {
          type: "string",
          enum: ["abiertas", "todas", ...Object.keys(ESTADOS_VENTA)],
          description: "abiertas (por defecto) = reservas y operaciones en proceso.",
        },
      },
    },
  },
  async leer(ctx, i) {
    if (!puede(ctx.usr, "ventas")) return NO;
    const n = ent(i.numero);
    const estado = n ? "todas" : str(i.estado) || "abiertas";
    const porEstado = estado === "todas" ? sql`TRUE`
      : estado === "abiertas" ? sql`vt.estado IN ('reserva','en_proceso')`
      : sql`vt.estado = ${estado}`;
    const filas = await ventasConSaldo(sql`
      ${porEstado} AND ${n ? sql`(vt.id = ${n} OR vt.nro_boleto = ${n})` : sql`TRUE`}
      AND ${contiene(palabras(i.texto), sql`concat_ws(' ', x.marca, x.modelo, x.anio, x.dominio, c.nombre, c.apellido)`)}`, 25);
    return {
      ventas: filas.map((v: any) => ({
        venta_id: v.id, boleto: v.nro_boleto, fecha: dia(v.fecha),
        estado: ESTADOS_VENTA[v.estado]?.label || v.estado,
        unidad: unidad(v), patente: v.dominio, comprador: persona(v) || "sin cargar", vendedor: v.vendedor,
        total: plata(v.total), cobrado: plata(v.cobrado), saldo: plata(Math.max(0, Number(v.total) - Number(v.cobrado))),
        ...(v.estado === "reserva" ? { sena_vence: dia(v.sena_vence) } : {}),
      })),
    };
  },
};

const ver_venta: Consulta = {
  def: {
    name: "ver_venta",
    description: "El detalle de una venta: comprador, cobros hechos, saldo pendiente, financiación y trámite.",
    input_schema: { type: "object", properties: { venta_id: { type: "integer" } }, required: ["venta_id"] },
  },
  async leer(ctx, i) {
    if (!puede(ctx.usr, "ventas")) return NO;
    const id = ent(i.venta_id);
    const [v] = await ventasConSaldo(sql`vt.id = ${id}`, 1);
    if (!v) return { error: "No hay una venta con ese número." };
    const [pagos, cobranzas, fin] = await Promise.all([
      sql`SELECT medio, monto, moneda, cotizacion, fecha, referencia, es_sena FROM venta_pagos
          WHERE venta_id = ${id} ORDER BY fecha, id`,
      sql`SELECT concepto, vencimiento, monto, cobrado, moneda, estado FROM cobranzas
          WHERE venta_id = ${id} ORDER BY vencimiento`,
      sql`SELECT entidad, monto, cuotas, estado FROM financiaciones WHERE venta_id = ${id}`,
    ]);
    const total = Number(v.total);
    return {
      venta_id: v.id, boleto: v.nro_boleto, fecha: dia(v.fecha),
      estado: ESTADOS_VENTA[v.estado]?.label || v.estado,
      tramite: ESTADOS_TRAMITE[v.estado_tramite] || v.estado_tramite,
      unidad: unidad(v), patente: v.dominio, vehiculo_id: v.vehiculo_id,
      comprador: persona(v) || "sin cargar", dni_cuit: v.dni_cuit, telefono: v.telefono, vendedor: v.vendedor,
      total: plata(total), descuento: Number(v.descuento) ? plata(v.descuento) : null,
      cobrado: plata(v.cobrado), saldo: plata(Math.max(0, total - Number(v.cobrado))),
      sena: Number(v.sena) ? plata(v.sena) : null, sena_vence: dia(v.sena_vence),
      cobros: pagos.map((p: any) => ({
        fecha: dia(p.fecha), medio: MEDIOS_PAGO[p.medio] || p.medio, monto: plata(p.monto, p.moneda),
        ...(p.moneda === "USD" ? { cotizacion: Number(p.cotizacion) } : {}),
        ...(p.es_sena ? { es_sena: true } : {}), referencia: p.referencia,
      })),
      saldos_a_cobrar: cobranzas.map((c: any) => ({
        concepto: c.concepto, vence: dia(c.vencimiento), monto: plata(c.monto, c.moneda),
        cobrado: plata(c.cobrado, c.moneda), estado: c.estado,
      })),
      financiacion: fin.map((f: any) => ({ entidad: f.entidad, monto: plata(f.monto), cuotas: f.cuotas, estado: f.estado })),
      observaciones: v.observaciones,
      ...(ctx.costos ? { costo_de_la_unidad: plata(v.costo_total), margen: plata(total - Number(v.costo_total || 0)) } : {}),
    };
  },
};

const datos_de_referencia: Consulta = {
  def: {
    name: "datos_de_referencia",
    description:
      "Las cuentas de caja (con su id y su moneda) y la cotización del dólar de hoy. Hace falta antes de preparar " +
      "una venta o un cobro: cada pago en efectivo, transferencia, tarjeta, cheque o Mercado Pago entra a una cuenta.",
    input_schema: { type: "object", properties: {} },
  },
  async leer(ctx) {
    if (!puede(ctx.usr, "ventas")) return NO;
    const [cuentas, dolar] = await Promise.all([
      sql`SELECT id, nombre, tipo, moneda FROM caja_cuentas WHERE activa ORDER BY posicion, nombre`,
      cotizacionDeHoy(),
    ]);
    return {
      cuentas_de_caja: cuentas.map((c: any) => ({ cuenta_id: c.id, nombre: c.nombre, tipo: c.tipo, moneda: c.moneda })),
      dolar_hoy: dolar ? { valor: Number(dolar.valor), fecha: dia(dolar.fecha) } : "sin cotización cargada",
    };
  },
};

/* ================================================================== cambios */

const camposLead = {
  telefono: { type: "string" },
  email: { type: "string" },
  origen: { type: "string", enum: Object.keys(ORIGENES_LEAD), description: "Por dónde llegó. showroom = vino a la agencia." },
  vehiculo_id: { type: "integer", description: "La unidad del stock que le interesa (id de buscar_vehiculos)." },
  vehiculo_texto: { type: "string", description: "Lo que busca, si no es una unidad del stock: «una pickup hasta 2018»." },
  presupuesto: { type: "number", description: "En pesos." },
  entrega_usado: { type: "boolean" },
  usado_detalle: { type: "string", description: "El usado que entrega: marca, modelo, año, km." },
  tasacion: { type: "number", description: "En cuánto se le tasó el usado, en pesos." },
  proxima_accion: { type: "string", description: "Lo que hay que hacer con este lead: «Llamarlo para confirmar la visita»." },
  fecha_proxima: { type: "string", description: "Para cuándo es la próxima acción, AAAA-MM-DD." },
  observaciones: { type: "string" },
} as const;

/** Lo que el modelo mandó de un lead, limpio. Lo que no vino no aparece. */
async function leerCamposLead(i: any) {
  const d: Record<string, any> = {};
  const errores: string[] = [];
  const lineas: string[] = [];
  if (str(i.telefono)) { d.telefono = str(i.telefono, 40); lineas.push("Teléfono: " + d.telefono); }
  if (str(i.email)) { d.email = str(i.email, 120); lineas.push("Email: " + d.email); }
  if (str(i.origen)) {
    if (!ORIGENES_LEAD[i.origen]) errores.push("Ese origen no existe.");
    else { d.origen = i.origen; lineas.push("Origen: " + ORIGENES_LEAD[i.origen]); }
  }
  if (ent(i.vehiculo_id)) {
    const [v] = await sql`SELECT id, marca, modelo, version, anio FROM vehiculos WHERE id = ${ent(i.vehiculo_id)}`;
    if (!v) errores.push("No hay una unidad con ese vehiculo_id.");
    else { d.vehiculo_id = v.id; lineas.push("Le interesa: " + unidad(v)); }
  }
  if (str(i.vehiculo_texto)) { d.vehiculo_texto = str(i.vehiculo_texto, 200); lineas.push("Busca: " + d.vehiculo_texto); }
  if (monto(i.presupuesto)) { d.presupuesto = monto(i.presupuesto); lineas.push("Presupuesto: " + plata(d.presupuesto)); }
  if (typeof i.entrega_usado === "boolean") { d.entrega_usado = i.entrega_usado; if (!i.entrega_usado) lineas.push("No entrega usado"); }
  if (str(i.usado_detalle)) { d.usado_detalle = str(i.usado_detalle, 300); d.entrega_usado = true; }
  if (monto(i.tasacion)) d.tasacion = monto(i.tasacion);
  if (d.entrega_usado) {
    lineas.push("Entrega usado" + (d.usado_detalle ? ": " + d.usado_detalle : "") + (d.tasacion ? ` (tasado en ${plata(d.tasacion)})` : ""));
  }
  if (i.fecha_proxima != null && i.fecha_proxima !== "") {
    if (!fechaIso(i.fecha_proxima)) errores.push("fecha_proxima tiene que ser AAAA-MM-DD.");
    else d.fecha_proxima = i.fecha_proxima;
  }
  if (str(i.proxima_accion)) d.proxima_accion = str(i.proxima_accion, 200);
  if (d.proxima_accion || d.fecha_proxima) {
    lineas.push("Próxima acción: " + (d.proxima_accion || "(la que ya tenía)") + (d.fecha_proxima ? ` — ${dm(d.fecha_proxima)}` : ""));
  }
  if (str(i.observaciones)) { d.observaciones = str(i.observaciones, 1000); lineas.push("Observaciones: " + d.observaciones); }
  return { d, errores, lineas };
}

const sangria = (ls: string[]) => ls.map((l) => "   " + l).join("\n");

async function leadVisible(usr: Usuario, id: unknown) {
  const n = ent(id) || 0;
  if (!n || !(await puedeVerLead(usr, n))) return null;
  const [l] = await sql`SELECT id, nombre, estado, asesor_id FROM leads WHERE id = ${n}`;
  return l || null;
}

const crear_lead: Cambio = {
  def: {
    name: "crear_lead",
    description:
      "Carga un lead nuevo: una persona interesada en comprar (o en dejar su usado). Queda a nombre de quien habla. " +
      "Buscá antes con buscar_leads si ya existe. Lo único obligatorio es el nombre.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre y apellido como los dijo." },
        ...camposLead,
        estado: {
          type: "string", enum: Object.keys(ESTADOS_LEAD).filter((e) => !["vendido", "reservado", "perdido"].includes(e)),
          description: "nuevo si todavía nadie habló con la persona; contactado si ya se habló (lo normal cuando lo carga el vendedor que lo atendió).",
        },
        ya_revise_duplicados: { type: "boolean", description: "true para cargarlo igual cuando ya hay un lead abierto parecido y es otra persona." },
      },
      required: ["nombre"],
    },
  },
  async preparar(ctx, i) {
    if (!puede(ctx.usr, "leads")) return { error: SIN_PERMISO };
    const nombre = str(i.nombre, 120);
    if (!nombre) return { error: "Falta el nombre." };
    const { d, errores, lineas } = await leerCamposLead(i);
    if (errores.length) return { error: errores.join(" ") };
    const estado = str(i.estado) || "nuevo";
    if (!ESTADOS_LEAD[estado]) return { error: "Ese estado no existe." };

    if (!i.ya_revise_duplicados) {
      const tel = digitos(d.telefono);
      const parecidos = await sql`
        SELECT l.id, l.nombre, l.telefono, l.estado FROM leads l
        WHERE l.estado NOT IN ('vendido','perdido')
          AND (${sinAcentos(sql`l.nombre`)} = ${plano(nombre)}
               OR (${tel.length >= 6} AND regexp_replace(COALESCE(l.telefono, ''), '[^0-9]', '', 'g') = ${tel}))
        LIMIT 3`;
      if (parecidos.length) {
        return {
          error: "Ya hay un lead abierto que parece el mismo: " +
            parecidos.map((p: any) => `id ${p.id} ${p.nombre} (${p.telefono || "sin teléfono"}, ${ESTADOS_LEAD[p.estado]?.label})`).join("; ") +
            ". Si es la misma persona, anotá el seguimiento en ese lead. Si es otra, repetí con ya_revise_duplicados en true.",
        };
      }
    }
    return {
      datos: { ...d, nombre, estado },
      resumen: `Cargar lead: ${nombre} (${ESTADOS_LEAD[estado].label})` + (lineas.length ? "\n" + sangria(lineas) : ""),
    };
  },
  async ejecutar(usr, d) {
    const r = await crearLead(usr, {
      ...d,
      // Queda a nombre de quien lo cargó, si es alguien que vende.
      asesor_id: ["vendedor", "gerente", "dueno"].includes(usr.rol) ? usr.id : null,
      sucursal_id: usr.sucursal_id,
    });
    return "error" in r ? r : { ok: true, texto: `Lead cargado: ${d.nombre}`, ruta: `/leads/${r.id}` };
  },
};

const actualizar_lead: Cambio = {
  def: {
    name: "actualizar_lead",
    description:
      "Corrige o completa datos de un lead que ya existe (teléfono, lo que busca, presupuesto, usado, próxima acción). " +
      "Mandá solo lo que cambia. Para anotar un contacto usá registrar_seguimiento; para el estado, cambiar_estado_lead.",
    input_schema: {
      type: "object",
      properties: {
        lead_id: { type: "integer" },
        nombre: { type: "string" },
        ...camposLead,
        asignarme: { type: "boolean", description: "true para que este usuario tome un lead que no tiene asesor." },
      },
      required: ["lead_id"],
    },
  },
  async preparar(ctx, i) {
    if (!puede(ctx.usr, "leads.editar")) return { error: SIN_PERMISO };
    const l = await leadVisible(ctx.usr, i.lead_id);
    if (!l) return { error: "No hay un lead con ese id entre los que podés ver." };
    const { d, errores, lineas } = await leerCamposLead(i);
    if (errores.length) return { error: errores.join(" ") };
    if (str(i.nombre)) { d.nombre = str(i.nombre, 120); lineas.unshift("Nombre: " + d.nombre); }
    if (i.asignarme === true) {
      if (l.asesor_id && Number(l.asesor_id) !== ctx.usr.id) return { error: "Ese lead ya tiene otro asesor: lo reasigna el dueño desde el sistema." };
      d.asesor_id = ctx.usr.id; lineas.push("Asesor: " + ctx.usr.nombre);
    }
    if (!Object.keys(d).length) return { error: "No vino ningún dato para cambiar." };
    return { datos: { lead_id: l.id, nombre_lead: l.nombre, cambios: d }, resumen: `Corregir el lead de ${l.nombre}:\n` + sangria(lineas) };
  },
  async ejecutar(usr, d) {
    const r = await editarLead(usr, d.lead_id, d.cambios);
    if ("error" in r) return r;
    return {
      ok: true, ruta: `/leads/${d.lead_id}`,
      texto: r.cambios.length ? `Lead de ${d.nombre_lead} actualizado (${r.cambios.join(", ")})` : `El lead de ${d.nombre_lead} ya tenía esos datos`,
    };
  },
};

const registrar_seguimiento: Cambio = {
  def: {
    name: "registrar_seguimiento",
    description:
      "Anota en el historial de un lead un contacto que ya pasó (una llamada, una visita, un WhatsApp, un test drive) " +
      "y, si corresponde, lo que sigue y el estado nuevo. Es lo más habitual después de hablar con un interesado.",
    input_schema: {
      type: "object",
      properties: {
        lead_id: { type: "integer" },
        tipo: { type: "string", enum: Object.keys(TIPOS_SEGUIMIENTO), description: "nota si no fue un contacto con la persona." },
        detalle: { type: "string", description: "Qué pasó, en una o dos oraciones, con las palabras del vendedor." },
        proxima_accion: { type: "string", description: "Lo que sigue: «Confirmar la visita»." },
        fecha_proxima: { type: "string", description: "Para cuándo, AAAA-MM-DD." },
        nuevo_estado: { type: "string", enum: Object.keys(ESTADOS_LEAD), description: "Solo si el contacto cambia el estado del lead." },
        motivo_perdida: { type: "string", description: "Si pasa a perdido: precio, compró en otro lado, dejó de responder…" },
      },
      required: ["lead_id", "tipo", "detalle"],
    },
  },
  async preparar(ctx, i) {
    if (!puede(ctx.usr, "leads")) return { error: SIN_PERMISO };
    const l = await leadVisible(ctx.usr, i.lead_id);
    if (!l) return { error: "No hay un lead con ese id entre los que podés ver." };
    const tipo = str(i.tipo) || "nota";
    if (!TIPOS_SEGUIMIENTO[tipo]) return { error: "Ese tipo de seguimiento no existe." };
    const detalle = str(i.detalle, 1000);
    if (!detalle) return { error: "Falta qué pasó." };
    let fecha: string | null = null;
    if (i.fecha_proxima != null && i.fecha_proxima !== "") {
      fecha = fechaIso(i.fecha_proxima);
      if (!fecha) return { error: "fecha_proxima tiene que ser AAAA-MM-DD." };
    }
    const estado = str(i.nuevo_estado);
    if (estado && !ESTADOS_LEAD[estado]) return { error: "Ese estado no existe." };
    const prox = str(i.proxima_accion, 200);
    const motivo = str(i.motivo_perdida, 200);

    const lineas = [`${TIPOS_SEGUIMIENTO[tipo]}: «${detalle}»`];
    if (prox || fecha) lineas.push("Próxima acción: " + (prox || "(la que ya tenía)") + (fecha ? ` — ${dm(fecha)}` : ""));
    if (estado && estado !== l.estado) {
      lineas.push(`Pasa de ${ESTADOS_LEAD[l.estado]?.label || l.estado} a ${ESTADOS_LEAD[estado].label}` +
        (estado === "perdido" && motivo ? ` (${motivo})` : ""));
    }
    return {
      datos: { lead_id: l.id, nombre_lead: l.nombre, tipo, detalle, proxima_accion: prox, fecha_proxima: fecha,
               estado: estado && estado !== l.estado ? estado : null, motivo },
      resumen: `Anotar en el lead de ${l.nombre}:\n` + sangria(lineas),
    };
  },
  async ejecutar(usr, d) {
    const r = await registrarSeguimiento(usr, d.lead_id, d);
    if ("error" in r) return r;
    let extra = "";
    if (d.estado) {
      const e = d.estado === "perdido" ? await marcarLeadPerdido(usr, d.lead_id, d.motivo) : await cambiarEstadoLead(usr, d.lead_id, d.estado);
      if ("error" in e) return fallo(`El seguimiento quedó anotado, pero el estado no cambió: ${e.error}`);
      extra = ` · pasó a ${ESTADOS_LEAD[d.estado].label}`;
    }
    return { ok: true, texto: `Seguimiento anotado en el lead de ${d.nombre_lead}${extra}`, ruta: `/leads/${d.lead_id}` };
  },
};

const cambiar_estado_lead: Cambio = {
  def: {
    name: "cambiar_estado_lead",
    description: "Mueve un lead de estado en el embudo, o lo da por perdido, sin anotar un contacto.",
    input_schema: {
      type: "object",
      properties: {
        lead_id: { type: "integer" },
        estado: { type: "string", enum: Object.keys(ESTADOS_LEAD) },
        motivo_perdida: { type: "string", description: "Si pasa a perdido." },
      },
      required: ["lead_id", "estado"],
    },
  },
  async preparar(ctx, i) {
    if (!puede(ctx.usr, "leads")) return { error: SIN_PERMISO };
    const l = await leadVisible(ctx.usr, i.lead_id);
    if (!l) return { error: "No hay un lead con ese id entre los que podés ver." };
    const estado = str(i.estado) || "";
    if (!ESTADOS_LEAD[estado]) return { error: "Ese estado no existe." };
    if (estado === l.estado) return { error: `El lead ya está en ${ESTADOS_LEAD[estado].label}.` };
    const motivo = str(i.motivo_perdida, 200);
    return {
      datos: { lead_id: l.id, nombre_lead: l.nombre, estado, motivo },
      resumen: `Pasar el lead de ${l.nombre} de ${ESTADOS_LEAD[l.estado]?.label || l.estado} a ${ESTADOS_LEAD[estado].label}` +
        (estado === "perdido" && motivo ? ` (motivo: ${motivo})` : ""),
    };
  },
  async ejecutar(usr, d) {
    const r = d.estado === "perdido" ? await marcarLeadPerdido(usr, d.lead_id, d.motivo) : await cambiarEstadoLead(usr, d.lead_id, d.estado);
    return "error" in r ? r : { ok: true, texto: `Lead de ${d.nombre_lead}: ${ESTADOS_LEAD[d.estado].label}`, ruta: `/leads/${d.lead_id}` };
  },
};

const camposCliente = {
  cliente_id: { type: "integer", description: "Si ya está cargado (id de buscar_clientes). Lo demás, solo para completar o corregir." },
  nombre: { type: "string" },
  apellido: { type: "string" },
  dni_cuit: { type: "string" },
  telefono: { type: "string" },
  email: { type: "string" },
  direccion: { type: "string" },
  localidad: { type: "string" },
} as const;

/** Los datos de un comprador como los espera lib/clientes (campos cli_*), y cómo se leen. */
async function leerCliente(i: any) {
  const c = i || {};
  const campos: [string, string][] = [];
  let nombre = "";
  const id = ent(c.cliente_id);
  if (id) {
    const [ya] = await sql`SELECT id, nombre, apellido FROM clientes WHERE id = ${id}`;
    if (!ya) return { error: "No hay un cliente con ese cliente_id." };
    campos.push(["cli_id", String(id)]);
    nombre = persona(ya);
  }
  const pares: [string, string, number][] = [
    ["cli_nombre", "nombre", 80], ["cli_apellido", "apellido", 80], ["cli_dni", "dni_cuit", 20],
    ["cli_telefono", "telefono", 40], ["cli_email", "email", 120], ["cli_direccion", "direccion", 160],
    ["cli_localidad", "localidad", 80],
  ];
  const d: Record<string, string> = {};
  for (const [campo, clave, max] of pares) {
    const v = str(c[clave], max);
    if (v) { campos.push([campo, v]); d[clave] = v; }
  }
  if (!id) nombre = [d.nombre, d.apellido].filter(Boolean).join(" ");
  if (!nombre) return { error: "Falta el nombre del comprador." };
  const extras = [
    d.dni_cuit ? "DNI/CUIT " + d.dni_cuit : null, d.telefono ? "tel. " + d.telefono : null,
    [d.direccion, d.localidad].filter(Boolean).join(", ") || null, d.email || null,
  ].filter(Boolean);
  return { campos, nombre, texto: nombre + (id ? " (ya cargado)" : " (cliente nuevo)") + (extras.length ? " · " + extras.join(" · ") : "") };
}

const aFormulario = (campos: [string, string][]) => {
  const fd = new FormData();
  for (const [k, v] of campos) fd.append(k, v);
  return fd;
};

const guardar_cliente: Cambio = {
  def: {
    name: "guardar_cliente",
    description:
      "Carga un cliente nuevo o completa los datos de uno que ya está (DNI, domicilio, teléfono), que son los que " +
      "salen en el boleto. Al cargar una venta no hace falta: crear_venta ya guarda al comprador.",
    input_schema: { type: "object", properties: camposCliente },
  },
  async preparar(ctx, i) {
    if (!puede(ctx.usr, "clientes.editar")) return { error: SIN_PERMISO };
    const c = await leerCliente(i);
    if ("error" in c) return { error: c.error };
    if (!ent(i.cliente_id) && digitos(i.dni_cuit).length < 7) {
      const iguales = await sql`SELECT id, nombre, apellido FROM clientes
                                WHERE ${sinAcentos(sql`concat_ws(' ', nombre, apellido)`)} = ${plano(c.nombre)} LIMIT 1`;
      if (iguales.length) return { error: `Ya hay un cliente con ese nombre (cliente_id ${iguales[0].id}). Si es el mismo, mandá su cliente_id.` };
    }
    return { datos: { campos: c.campos, nombre: c.nombre }, resumen: `Guardar cliente: ${c.texto}` };
  },
  async ejecutar(usr, d) {
    if (!puede(usr, "clientes.editar")) return fallo(SIN_PERMISO);
    const id = await guardarCliente(sql, aFormulario(d.campos));
    if (!id) return fallo("No se pudo guardar el cliente.");
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'cliente', ${id}, 'guardar', ${"Por Telegram: " + d.nombre})`;
    return { ok: true, texto: `Cliente guardado: ${d.nombre}`, ruta: "/clientes" };
  },
};

/** Valida un pago y lo deja listo: en qué cuenta entra y a qué cotización. */
async function leerPago(p: any, cotizacion: number | null) {
  const medio = str(p?.medio) || "";
  if (!MEDIOS_PAGO[medio]) return { error: `Medio de pago desconocido («${medio}»).` };
  const m = monto(p?.monto);
  if (!m) return { error: "A un pago le falta el monto." };
  const mon = moneda(p?.moneda);
  if (mon === "USD" && !cotizacion) return { error: "Hay un pago en dólares y no hay cotización: pasá `cotizacion`." };
  const cot = mon === "USD" ? Number(cotizacion) : 1;

  let cuenta: any = null;
  if (MEDIOS_A_CAJA.includes(medio) && !p?.sin_caja) {
    const cid = ent(p?.cuenta_id);
    if (!cid) {
      return { error: `Falta la cuenta de caja a la que entra el pago en ${MEDIOS_PAGO[medio]} (cuenta_id de datos_de_referencia). ` +
        "Si el usuario dijo que no se registre en caja, mandá sin_caja en true." };
    }
    [cuenta] = await sql`SELECT id, nombre, moneda FROM caja_cuentas WHERE id = ${cid} AND activa`;
    if (!cuenta) return { error: "No hay una cuenta de caja activa con ese cuenta_id." };
    if (cuenta.moneda !== mon) {
      return { error: `La cuenta ${cuenta.nombre} es en ${cuenta.moneda} y el pago es en ${mon}: elegí una cuenta de esa moneda.` };
    }
  }
  const ref = str(p?.referencia, 120);
  const texto = `${MEDIOS_PAGO[medio]} ${plata(m, mon)}` +
    (mon === "USD" ? ` a ${plata(cot)} = ${plata(m * cot)}` : "") +
    (cuenta ? ` → cuenta ${cuenta.nombre}` : MEDIOS_A_CAJA.includes(medio) ? " (sin registrar en caja)" : "") +
    (ref ? ` · ref. ${ref}` : "");
  return { medio, monto: m, moneda: mon, cot, cuenta_id: cuenta?.id ?? null, referencia: ref, enPesos: m * cot, texto };
}

const pagoSchema = {
  type: "object",
  properties: {
    medio: { type: "string", enum: Object.keys(MEDIOS_PAGO) },
    monto: { type: "number", description: "En la moneda del pago. «Dos palos» son 2000000; «500 lucas», 500000." },
    moneda: { type: "string", enum: ["ARS", "USD"] },
    cuenta_id: { type: "integer", description: "Cuenta de caja a la que entra (de datos_de_referencia), de la misma moneda. No va en permuta, financiación ni otro." },
    sin_caja: { type: "boolean", description: "true solo si el usuario pidió no registrarlo en caja (porque ya lo anotó)." },
    referencia: { type: "string", description: "N° de comprobante, de cheque, etc." },
  },
  required: ["medio", "monto"],
} as const;

const crear_venta: Cambio = {
  def: {
    name: "crear_venta",
    description:
      "Carga una operación sobre una unidad: una reserva con seña, una venta en proceso o una venta cerrada. " +
      "Marca la unidad, registra los cobros en la caja, deja el saldo a cobrar y, si entra un usado en permuta, lo da " +
      "de alta en el stock. Antes necesitás el id de la unidad (buscar_vehiculos) y las cuentas de caja " +
      "(datos_de_referencia). Si el comprador ya es cliente o hay un lead, buscalos y pasá sus ids.",
    input_schema: {
      type: "object",
      properties: {
        vehiculo_id: { type: "integer" },
        operacion: {
          type: "string", enum: ["reserva", "en_proceso", "completada"],
          description: "reserva = deja una seña y la unidad queda señada; en_proceso = venta acordada que se está pagando o tramitando; completada = venta cerrada y entregada.",
        },
        precio: { type: "number", description: "Precio acordado de la unidad, antes del descuento." },
        moneda_precio: { type: "string", enum: ["ARS", "USD"], description: "Si se pactó en dólares se convierte a pesos con la cotización." },
        descuento: { type: "number", description: "En la misma moneda que el precio." },
        cotizacion: { type: "number", description: "Pesos por dólar para lo que esté en dólares. Si falta, se usa la de hoy." },
        cliente: { type: "object", properties: camposCliente, description: "El comprador. Sale así en el boleto." },
        lead_id: { type: "integer", description: "El lead del que sale la venta, si hay: pasa solo a reservado o vendido." },
        pagos: { type: "array", items: pagoSchema, description: "Lo que paga ahora. En una reserva, es la seña. El usado va en `permuta`, no acá." },
        permuta: {
          type: "object",
          properties: {
            marca: { type: "string" }, modelo: { type: "string" }, anio: { type: "integer" },
            dominio: { type: "string" }, km: { type: "integer" },
            valor: { type: "number", description: "En cuánto se toma, en pesos." },
          },
          required: ["marca", "valor"],
          description: "El usado que se toma como parte de pago.",
        },
        financiacion: {
          type: "object",
          properties: {
            entidad: { type: "string" }, monto: { type: "number" }, cuotas: { type: "integer" },
            tasa: { type: "number" }, primera_cuota: { type: "string", description: "AAAA-MM-DD" },
          },
          required: ["entidad", "monto"],
          description: "Crédito o prenda. Queda anotado; no cuenta como plata cobrada hasta que se acredite.",
        },
        sena_vence: { type: "string", description: "Hasta cuándo vale la reserva, AAAA-MM-DD. Por defecto, 7 días." },
        saldo_en_dolares: { type: "boolean", description: "true si lo que queda a cobrar se pactó en dólares." },
        vencimiento_saldo: { type: "string", description: "Cuándo vence el saldo, AAAA-MM-DD." },
        observaciones: { type: "string" },
      },
      required: ["vehiculo_id", "operacion", "precio"],
    },
  },
  async preparar(ctx, i) {
    if (!puede(ctx.usr, "ventas.crear")) return { error: SIN_PERMISO };
    const [v] = await sql`SELECT id, marca, modelo, version, anio, dominio, estado, precio_minimo, moneda_venta, sucursal_id
                          FROM vehiculos WHERE id = ${ent(i.vehiculo_id)}`;
    if (!v) return { error: "No hay una unidad con ese vehiculo_id." };
    if (!["disponible", "reservado"].includes(v.estado)) {
      return { error: `Esa unidad está en «${ESTADOS_VEHICULO[v.estado]?.label || v.estado}»: no se puede vender desde acá.` };
    }
    const otra = await ventaActiva(v.id);
    if (otra) {
      return { error: `Esa unidad ya tiene la venta #${otra.id} (${ESTADOS_VENTA[otra.estado]?.label || otra.estado}). ` +
        "Si hay que cobrarle o cerrarla, usá registrar_cobro o cambiar_estado_venta sobre esa venta." };
    }
    const operacion = str(i.operacion) || "";
    if (!["reserva", "en_proceso", "completada"].includes(operacion)) return { error: "operacion tiene que ser reserva, en_proceso o completada." };

    // Todo lo que esté en dólares usa una sola cotización: la que pasaron o la de hoy.
    const pagosCrudos: any[] = Array.isArray(i.pagos) ? i.pagos : [];
    const hayDolares = moneda(i.moneda_precio) === "USD" || !!i.saldo_en_dolares || pagosCrudos.some((p) => moneda(p?.moneda) === "USD");
    let cot = monto(i.cotizacion);
    let cotDeHoy = false;
    if (hayDolares && !cot) {
      const c = await cotizacionDeHoy();
      if (!c) return { error: "Hay montos en dólares y no hay cotización cargada: preguntale a qué valor se toma el dólar." };
      cot = Number(c.valor); cotDeHoy = true;
    }

    const precioDicho = monto(i.precio);
    if (!precioDicho) return { error: "Falta el precio." };
    const enDolares = moneda(i.moneda_precio) === "USD";
    const precio = Math.round(enDolares ? precioDicho * Number(cot) : precioDicho);
    const descuento = Math.round((monto(i.descuento) || 0) * (enDolares ? Number(cot) : 1));
    const total = precio - descuento;
    if (total <= 0) return { error: "El descuento no puede ser mayor al precio." };

    // El comprador: el que viene, o el del lead.
    let lead: any = null;
    if (ent(i.lead_id)) {
      if (!(await puedeVerLead(ctx.usr, ent(i.lead_id)!))) return { error: "No hay un lead con ese id entre los que podés ver." };
      [lead] = await sql`SELECT id, nombre, telefono, email, cliente_id FROM leads WHERE id = ${ent(i.lead_id)}`;
    }
    let datosCliente = i.cliente && Object.keys(i.cliente).length ? i.cliente : null;
    if (!datosCliente && lead) {
      datosCliente = lead.cliente_id ? { cliente_id: lead.cliente_id } : { nombre: lead.nombre, telefono: lead.telefono, email: lead.email };
    }
    if (!datosCliente) return { error: "Falta el comprador: preguntá a nombre de quién va la operación." };
    const cli = await leerCliente(datosCliente);
    if ("error" in cli) return { error: cli.error };

    const pagos = [];
    for (const p of pagosCrudos) {
      if (str(p?.medio) === "permuta") return { error: "El usado va en `permuta`, con marca y valor, no como un pago." };
      const r = await leerPago(p, cot);
      if ("error" in r) return { error: r.error };
      pagos.push(r);
    }
    let cobrado = pagos.reduce((a, p) => a + p.enPesos, 0);

    const campos: [string, string][] = [
      ["vehiculo_id", String(v.id)], ["precio", String(precio)], ["descuento", String(descuento)],
      ["fecha", ctx.hoy], ["estado", operacion], ["vendedor_id", String(ctx.usr.id)],
      ["sucursal_id", String(ctx.usr.sucursal_id ?? v.sucursal_id ?? "")], ["lead_id", lead ? String(lead.id) : ""],
      ...cli.campos,
    ];
    for (const p of pagos) {
      campos.push(["pago_medio", p.medio], ["pago_monto", String(p.monto)], ["pago_moneda", p.moneda],
        ["pago_cotizacion", String(p.cot)], ["pago_referencia", p.referencia || ""], ["pago_cuenta", String(p.cuenta_id || "")]);
    }

    const lineas = [
      "Comprador: " + cli.texto,
      "Precio: " + (enDolares ? `${plata(precioDicho, "USD")} a ${plata(cot)} = ` : "") + plata(precio) +
        (descuento ? ` − ${plata(descuento)} de descuento = ${plata(total)}` : ""),
    ];
    if (lead) lineas.push(`Sale del lead de ${lead.nombre}, que pasa a ${operacion === "completada" ? "Vendido" : "Reservado"}`);
    for (const p of pagos) lineas.push((operacion === "reserva" ? "Seña: " : "Cobro: ") + p.texto);

    const pm = i.permuta;
    if (pm && (str(pm.marca) || monto(pm.valor))) {
      const valor = monto(pm.valor);
      if (!str(pm.marca) || !valor) return { error: "De la permuta hacen falta al menos la marca y el valor en que se toma." };
      const dom = str(pm.dominio, 12)?.toUpperCase().replace(/\s+/g, "") || "";
      campos.push(["permuta_marca", str(pm.marca, 60)!], ["permuta_modelo", str(pm.modelo, 80) || ""],
        ["permuta_anio", ent(pm.anio) ? String(ent(pm.anio)) : ""], ["permuta_dominio", dom],
        ["permuta_km", ent(pm.km) ? String(ent(pm.km)) : ""], ["permuta_valor", String(valor)]);
      cobrado += valor;
      lineas.push(`Permuta: ${[str(pm.marca), str(pm.modelo), ent(pm.anio), dom].filter(Boolean).join(" ")} tomado en ${plata(valor)} ` +
        "(entra al stock, en revisión)");
    }
    const fin = i.financiacion;
    if (fin && (str(fin.entidad) || monto(fin.monto))) {
      if (!str(fin.entidad) || !monto(fin.monto)) return { error: "De la financiación hacen falta la entidad y el monto." };
      if (fin.primera_cuota && !fechaIso(fin.primera_cuota)) return { error: "primera_cuota tiene que ser AAAA-MM-DD." };
      campos.push(["fin_entidad", str(fin.entidad, 80)!], ["fin_monto", String(monto(fin.monto))],
        ["fin_cuotas", String(ent(fin.cuotas) || 1)], ["fin_tasa", monto(fin.tasa) ? String(monto(fin.tasa)) : ""],
        ["fin_primera", fechaIso(fin.primera_cuota) || ""]);
      lineas.push(`Financiación: ${str(fin.entidad)} ${plata(monto(fin.monto))}` + (ent(fin.cuotas) ? ` en ${ent(fin.cuotas)} cuotas` : "") +
        " (en trámite: no cuenta como cobrado)");
    }

    if (cobrado > total + 1) return { error: `Los pagos suman ${plata(cobrado)} y el total es ${plata(total)}: revisá los montos.` };
    const saldo = Math.round(total - cobrado);
    if (saldo > 0) {
      if (i.vencimiento_saldo && !fechaIso(i.vencimiento_saldo)) return { error: "vencimiento_saldo tiene que ser AAAA-MM-DD." };
      const usd = !!i.saldo_en_dolares;
      campos.push(["moneda_saldo", usd ? "USD" : "ARS"], ["cotizacion_saldo", String(usd ? cot : 1)],
        ["vencimiento_saldo", fechaIso(i.vencimiento_saldo) || ""]);
      lineas.push("Saldo a cobrar: " + (usd ? `${plata(Math.round(saldo / Number(cot)), "USD")} (${plata(saldo)} a ${plata(cot)})` : plata(saldo)) +
        (fechaIso(i.vencimiento_saldo) ? `, vence el ${dm(i.vencimiento_saldo)}` : ""));
    } else {
      lineas.push("Queda saldada: no hay saldo a cobrar");
    }
    if (operacion === "reserva") {
      if (i.sena_vence && !fechaIso(i.sena_vence)) return { error: "sena_vence tiene que ser AAAA-MM-DD." };
      const vence = fechaIso(i.sena_vence) || enDias(ctx.hoy, 7);
      campos.push(["sena_vence", vence]);
      lineas.push(pagos.length ? `La reserva vale hasta el ${dm(vence)}` : "⚠️ Reserva sin seña: no entra plata ahora");
    }
    const obs = str(i.observaciones, 500);
    if (obs) { campos.push(["observaciones", obs]); lineas.push("Observaciones: " + obs); }
    if (cotDeHoy) lineas.push(`Dólar tomado a ${plata(cot)} (cotización de hoy)`);
    if (v.precio_minimo && v.moneda_venta !== "USD" && total < Number(v.precio_minimo)) {
      lineas.push(`⚠️ Queda por debajo del mínimo autorizado para esta unidad (${plata(v.precio_minimo)})`);
    }
    lineas.push(operacion === "completada" ? "La unidad sale del stock y de la web" : "La unidad queda señada y sale de la web");

    const titulo = { reserva: "Cargar una RESERVA", en_proceso: "Cargar una VENTA en proceso", completada: "Cargar una VENTA CERRADA" }[operacion];
    return {
      datos: { campos, unidad: unidad(v) },
      resumen: `${titulo} de ${unidad(v)}${v.dominio ? " · " + String(v.dominio).toUpperCase() : ""}\n` + sangria(lineas),
    };
  },
  async ejecutar(usr, d) {
    const r = await crearVenta(usr, aFormulario(d.campos));
    return "error" in r ? r : { ok: true, texto: `Venta #${r.id} de ${d.unidad}. ${r.mensaje}`, ruta: `/ventas/${r.id}` };
  },
};

/** La venta con su saldo, para las herramientas que la tocan. */
async function ventaParaOperar(id: unknown) {
  const [v]: any[] = await ventasConSaldo(sql`vt.id = ${ent(id)}`, 1);
  if (!v) return null;
  return { ...v, saldo: Math.max(0, Number(v.total) - Number(v.cobrado)), nombre: `la venta #${v.id} (${unidad(v)}${persona(v) ? " — " + persona(v) : ""})` };
}

const registrar_cobro: Cambio = {
  def: {
    name: "registrar_cobro",
    description:
      "Registra plata que entra por una venta o reserva que ya existe: un refuerzo de seña, una cuota del saldo, el " +
      "pago final. Baja el saldo, entra a la cuenta de caja y genera el recibo. Buscá antes la venta con buscar_ventas.",
    input_schema: {
      type: "object",
      properties: {
        venta_id: { type: "integer" },
        ...pagoSchema.properties,
        cotizacion: { type: "number", description: "Pesos por dólar, si el pago es en dólares. Si falta, la de hoy." },
        fecha: { type: "string", description: "AAAA-MM-DD. Por defecto, hoy." },
      },
      required: ["venta_id", "medio", "monto"],
    },
  },
  async preparar(ctx, i) {
    if (!puede(ctx.usr, "ventas")) return { error: SIN_PERMISO };
    const v = await ventaParaOperar(i.venta_id);
    if (!v) return { error: "No hay una venta con ese número." };
    if (v.estado === "cancelada") return { error: "Esa operación está cancelada: no se le pueden cargar cobros." };
    let cot = monto(i.cotizacion);
    let cotDeHoy = false;
    if (moneda(i.moneda) === "USD" && !cot) {
      const c = await cotizacionDeHoy();
      if (!c) return { error: "El pago es en dólares y no hay cotización cargada: preguntale a qué valor se toma." };
      cot = Number(c.valor); cotDeHoy = true;
    }
    const p = await leerPago(i, cot);
    if ("error" in p) return { error: p.error };
    if (i.fecha && !fechaIso(i.fecha)) return { error: "fecha tiene que ser AAAA-MM-DD." };
    const fecha = fechaIso(i.fecha) || ctx.hoy;
    const queda = v.saldo - p.enPesos;
    const lineas = [
      p.texto + (fecha !== ctx.hoy ? ` · con fecha ${dm(fecha)}` : ""),
      `Saldo de la operación: ${plata(v.saldo)} → ${plata(Math.max(0, queda))}`,
    ];
    if (cotDeHoy) lineas.push(`Dólar tomado a ${plata(cot)} (cotización de hoy)`);
    if (queda < -1) lineas.push(`⚠️ Es más que lo que falta cobrar: se pasa por ${plata(-queda)}`);
    return {
      datos: {
        venta_id: v.id, nombre: v.nombre,
        campos: [["medio", p.medio], ["monto", String(p.monto)], ["moneda", p.moneda], ["cotizacion", String(p.cot)],
                 ["fecha", fecha], ["cuenta_id", String(p.cuenta_id || "")], ["referencia", p.referencia || ""]],
      },
      resumen: `Registrar ${v.estado === "reserva" ? "una seña" : "un cobro"} en ${v.nombre}:\n` + sangria(lineas),
    };
  },
  async ejecutar(usr, d) {
    const r = await registrarPago(usr, d.venta_id, aFormulario(d.campos));
    return "error" in r ? r
      : { ok: true, texto: `${r.esSena ? "Seña registrada" : "Cobro registrado"} en ${d.nombre}. Abrí el recibo`, ruta: `/documentos/recibo/${r.pagoId}` };
  },
};

const cambiar_estado_venta: Cambio = {
  def: {
    name: "cambiar_estado_venta",
    description:
      "Mueve una operación: de reserva a en proceso, a completada (venta cerrada: la unidad sale del stock y se abre " +
      "la postventa) o a cancelada (la unidad vuelve al stock).",
    input_schema: {
      type: "object",
      properties: { venta_id: { type: "integer" }, estado: { type: "string", enum: Object.keys(ESTADOS_VENTA) } },
      required: ["venta_id", "estado"],
    },
  },
  async preparar(ctx, i) {
    if (!puede(ctx.usr, "ventas")) return { error: SIN_PERMISO };
    const v = await ventaParaOperar(i.venta_id);
    if (!v) return { error: "No hay una venta con ese número." };
    const estado = str(i.estado) || "";
    if (!ESTADOS_VENTA[estado]) return { error: "Ese estado no existe." };
    if (estado === v.estado) return { error: `La operación ya está en ${ESTADOS_VENTA[estado].label}.` };
    const lineas: string[] = [];
    if (estado === "completada") {
      lineas.push("La unidad sale del stock y de la web, y se abre el seguimiento de postventa");
      if (v.saldo > 1) lineas.push(`⚠️ Todavía hay ${plata(v.saldo)} sin cobrar: queda como saldo en Cobranzas`);
    } else if (estado === "cancelada") {
      lineas.push("La unidad vuelve al stock y a la web");
      if (Number(v.cobrado) > 0) {
        lineas.push(`⚠️ Tiene ${plata(v.cobrado)} cobrados que no se tocan: si hay que devolver plata, se carga aparte en Caja`);
      }
    }
    return {
      datos: { venta_id: v.id, estado, nombre: v.nombre },
      resumen: `Pasar ${v.nombre} de ${ESTADOS_VENTA[v.estado]?.label || v.estado} a ${ESTADOS_VENTA[estado].label.toUpperCase()}` +
        (lineas.length ? "\n" + sangria(lineas) : ""),
    };
  },
  async ejecutar(usr, d) {
    const r = await cambiarEstadoVenta(usr, d.venta_id, d.estado);
    return "error" in r ? r : { ok: true, texto: `${d.nombre}: ${r.mensaje}`, ruta: `/ventas/${d.venta_id}` };
  },
};

const extender_sena: Cambio = {
  def: {
    name: "extender_sena",
    description: "Cambia la fecha hasta la que vale una reserva.",
    input_schema: {
      type: "object",
      properties: { venta_id: { type: "integer" }, fecha: { type: "string", description: "AAAA-MM-DD" } },
      required: ["venta_id", "fecha"],
    },
  },
  async preparar(ctx, i) {
    if (!puede(ctx.usr, "ventas")) return { error: SIN_PERMISO };
    const v = await ventaParaOperar(i.venta_id);
    if (!v) return { error: "No hay una venta con ese número." };
    if (v.estado !== "reserva") return { error: "Esa operación no está en reserva: no tiene seña que venza." };
    const fecha = fechaIso(i.fecha);
    if (!fecha) return { error: "fecha tiene que ser AAAA-MM-DD." };
    return {
      datos: { venta_id: v.id, fecha, nombre: v.nombre },
      resumen: `Extender la seña de ${v.nombre}: vence el ${dm(dia(v.sena_vence))} → ${dm(fecha)}`,
    };
  },
  async ejecutar(usr, d) {
    const r = await extenderSena(usr, d.venta_id, d.fecha);
    return "error" in r ? r : { ok: true, texto: `La seña de ${d.nombre} ahora vence el ${dm(d.fecha)}`, ruta: `/ventas/${d.venta_id}` };
  },
};

const actualizar_vehiculo: Cambio = {
  def: {
    name: "actualizar_vehiculo",
    description:
      "Corrige datos sueltos de una unidad del stock: kilómetros, color, precio de venta u observaciones. " +
      "El alta de unidades, los costos y las fotos se cargan desde el sistema.",
    input_schema: {
      type: "object",
      properties: {
        vehiculo_id: { type: "integer" },
        km: { type: "integer" },
        color: { type: "string" },
        precio_venta: { type: "number", description: "En la moneda en que está publicada la unidad." },
        observaciones: { type: "string", description: "Reemplaza las observaciones actuales." },
      },
      required: ["vehiculo_id"],
    },
  },
  async preparar(ctx, i) {
    if (!puede(ctx.usr, "vehiculos.editar")) return { error: SIN_PERMISO };
    const [v] = await sql`SELECT id, marca, modelo, version, anio, km, color, precio_venta, moneda_venta, observaciones
                          FROM vehiculos WHERE id = ${ent(i.vehiculo_id)}`;
    if (!v) return { error: "No hay una unidad con ese vehiculo_id." };
    const cambios: Record<string, any> = {};
    const lineas: string[] = [];
    const km = Number(i.km);
    if (i.km != null && Number.isInteger(km) && km >= 0 && km !== Number(v.km)) {
      cambios.km = km; lineas.push(`Km: ${Number(v.km).toLocaleString("es-AR")} → ${km.toLocaleString("es-AR")}`);
    }
    if (str(i.color) && str(i.color) !== v.color) { cambios.color = str(i.color, 40); lineas.push(`Color: ${v.color || "—"} → ${cambios.color}`); }
    if (monto(i.precio_venta) && monto(i.precio_venta) !== Number(v.precio_venta)) {
      cambios.precio_venta = monto(i.precio_venta);
      lineas.push(`Precio de venta: ${plata(v.precio_venta, v.moneda_venta)} → ${plata(cambios.precio_venta, v.moneda_venta)}`);
    }
    if (str(i.observaciones)) { cambios.observaciones = str(i.observaciones, 1000); lineas.push("Observaciones: " + cambios.observaciones); }
    if (!lineas.length) return { error: "No vino ningún dato distinto del que ya tiene la unidad." };
    return { datos: { vehiculo_id: v.id, cambios, unidad: unidad(v) }, resumen: `Corregir ${unidad(v)}:\n` + sangria(lineas) };
  },
  async ejecutar(usr, d) {
    if (!puede(usr, "vehiculos.editar")) return fallo(SIN_PERMISO);
    const [v] = await sql`UPDATE vehiculos SET ${sql(d.cambios)} WHERE id = ${d.vehiculo_id} RETURNING id`;
    if (!v) return fallo("Esa unidad ya no existe.");
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'vehiculo', ${d.vehiculo_id}, 'edicion', ${"Por Telegram: " + Object.keys(d.cambios).join(", ")})`;
    return { ok: true, texto: `${d.unidad} actualizada`, ruta: `/vehiculos/${d.vehiculo_id}` };
  },
};

/* ================================================================ el tablero */

const CONSULTAS: Record<string, Consulta> = {
  buscar_vehiculos, ver_vehiculo, buscar_leads, ver_lead, buscar_clientes, buscar_ventas, ver_venta, datos_de_referencia,
};
const CAMBIOS: Record<string, Cambio> = {
  crear_lead, actualizar_lead, registrar_seguimiento, cambiar_estado_lead, guardar_cliente,
  crear_venta, registrar_cobro, cambiar_estado_venta, extender_sena, actualizar_vehiculo,
};

/** Las definiciones que ve el modelo. El orden no cambia: es parte de lo que se cachea. */
export const DEFINICIONES: Definicion[] = [...Object.values(CONSULTAS), ...Object.values(CAMBIOS)].map((h) => h.def);

/**
 * Atiende una llamada del modelo. Una consulta devuelve sus datos; un cambio
 * no se ejecuta: se valida, se suma a `pendientes` y el modelo se entera de
 * que quedó a la espera de la confirmación.
 */
export async function atender(ctx: Contexto, nombre: string, entrada: unknown, pendientes: Accion[]) {
  const i = entrada && typeof entrada === "object" ? entrada : {};
  try {
    if (CONSULTAS[nombre]) return { contenido: JSON.stringify(await CONSULTAS[nombre].leer(ctx, i)), error: false };
    const cambio = CAMBIOS[nombre];
    if (!cambio) return { contenido: `No existe la herramienta ${nombre}.`, error: true };
    const p = await cambio.preparar(ctx, i);
    if ("error" in p) return { contenido: p.error, error: true };
    pendientes.push({ tipo: nombre, datos: p.datos, resumen: p.resumen });
    return {
      contenido: "Preparado, todavía SIN ejecutar. Al terminar tu respuesta el usuario va a ver este detalle con los " +
        "botones Confirmar y Cancelar:\n" + p.resumen,
      error: false,
    };
  } catch (err: any) {
    console.error(`Asistente: falló ${nombre}:`, err?.message);
    return { contenido: "La herramienta falló por un error interno del sistema. No se cambió nada.", error: true };
  }
}

/** Corre un cambio ya confirmado. */
export async function ejecutar(usr: Usuario, a: Accion): Promise<Hecho> {
  const cambio = CAMBIOS[a.tipo];
  if (!cambio) return fallo("Esa acción ya no existe en el sistema.");
  try {
    return await cambio.ejecutar(usr, a.datos);
  } catch (err: any) {
    console.error(`Asistente: falló la ejecución de ${a.tipo}:`, err?.message);
    return fallo("Error interno del sistema. Revisá en la pantalla si llegó a cargarse algo.");
  }
}
