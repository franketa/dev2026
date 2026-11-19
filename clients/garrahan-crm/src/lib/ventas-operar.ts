import { sql } from "./db";
import { puede, type Usuario } from "./auth";
import { ESTADOS_VENTA, MEDIOS_PAGO } from "./constantes";
import { avisar, enlace, plataAviso, t } from "./telegram";
import { ventaActiva, sincronizarAuto, tomarNroBoleto } from "./ventas";
import { guardarCliente } from "./clientes";
import { SIN_PERMISO } from "./aviso";
import { fallo, type Res } from "./resultado";

/**
 * Cargar una venta, cobrarla y moverla de estado. Lo usan las pantallas de
 * ventas y el asistente de Telegram: la plata tiene una sola versión de sus
 * reglas, se entre por donde se entre.
 *
 * Los datos llegan como FormData con los nombres del formulario de la venta
 * (vehiculo_id, precio, pago_medio…, cli_*, permuta_*, fin_*).
 */

/** Estos medios son plata que entra a una cuenta. Permuta y financiación no. */
export const MEDIOS_A_CAJA = ["efectivo", "transferencia", "tarjeta", "mercadopago", "cheque"];

/** Fecha ISO corrida n días. Se trabaja con strings para no pelear con husos. */
export function enDias(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fechaCorta(d: any) {
  if (!d) return "—";
  const x = new Date(d);
  return x.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

function plataSimple(n: number) {
  return "$ " + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

export async function crearVenta(usr: Usuario, fd: FormData): Promise<Res<{ id: number; mensaje: string }>> {
  if (!puede(usr, "ventas.crear")) return fallo(SIN_PERMISO);
  const txt = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const num = (k: string) => {
    const v = fd.get(k);
    return v === null || String(v).trim() === "" ? null : Number(v);
  };

  const vehiculoId = num("vehiculo_id");
  const precio = num("precio") ?? 0;
  if (!vehiculoId) return fallo("Elegí la unidad.");
  if (!precio) return fallo("Falta el precio.");
  // Dos ventas vivas del mismo auto descuadran la caja y el stock: la que ya
  // existe se completa o se corrige desde su ficha.
  const otra = await ventaActiva(vehiculoId);
  if (otra) {
    return fallo(`Esta unidad ya tiene la venta #${otra.id} (${ESTADOS_VENTA[otra.estado]?.label || otra.estado}). ` +
      "Completala o corregila desde ahí.");
  }

  const descuento = num("descuento") ?? 0;
  const total = precio - descuento;
  const fechaVenta = txt("fecha") ?? new Date().toISOString().slice(0, 10);
  const estado = String(fd.get("estado") || "reserva");
  // En una reserva, la plata que entra es la seña. Vence: si no se completa
  // a tiempo hay que decidir qué pasa con la unidad, y el sistema lo avisa.
  const esReserva = estado === "reserva";

  // Cliente: uno ya cargado (con lo que se le haya corregido) o uno nuevo.
  const clienteId = await guardarCliente(sql, fd);

  const [veh] = await sql`SELECT inversor_id, sucursal_id, marca, modelo FROM vehiculos WHERE id = ${vehiculoId}`;

  const [venta] = await sql`
    INSERT INTO ventas (vehiculo_id, cliente_id, vendedor_id, inversor_id, sucursal_id, lead_id,
                        fecha, estado, precio, descuento, sena, comision,
                        facturado, estado_tramite, observaciones, nro_boleto)
    VALUES (${vehiculoId}, ${clienteId}, ${num("vendedor_id")}, ${veh?.inversor_id ?? null},
            ${num("sucursal_id") ?? veh?.sucursal_id ?? null}, ${num("lead_id")},
            ${fechaVenta}, ${estado}, ${precio}, ${descuento}, 0,
            ${num("comision") ?? 0},
            ${String(fd.get("facturado") || "pendiente")},
            ${String(fd.get("estado_tramite") || "iniciado")}, ${txt("observaciones")},
            ${await tomarNroBoleto()})
    RETURNING id`;

  /* ------------------------------------------------------------- pagos
     Los renglones llegan como arrays paralelos: getAll conserva el orden
     del formulario, así que el índice alcanza para reconstruir cada uno. */
  const medios = fd.getAll("pago_medio").map(String);
  const montos = fd.getAll("pago_monto").map((x) => Number(x || 0));
  const monedas = fd.getAll("pago_moneda").map(String);
  const cotiz = fd.getAll("pago_cotizacion").map((x) => Number(x || 1));
  const refs = fd.getAll("pago_referencia").map(String);
  // El formulario manda una sola cuenta para todos los renglones. El asistente
  // manda además la de cada renglón (pago_cuenta): pesos y dólares en efectivo
  // no entran a la misma caja.
  const cuentasPago = fd.getAll("pago_cuenta").map((x) => Number(x || 0));
  const cuentaGeneral = num("cuenta_id");

  let cobrado = 0;
  for (let i = 0; i < medios.length; i++) {
    const monto = montos[i];
    if (!monto) continue;
    const moneda = monedas[i] === "USD" ? "USD" : "ARS";
    const cot = moneda === "USD" ? (cotiz[i] || 1) : 1;
    const enPesos = monto * cot;
    cobrado += enPesos;
    const cuentaId = cuentasPago[i] || cuentaGeneral;

    const [pago] = await sql`
      INSERT INTO venta_pagos (venta_id, medio, monto, moneda, cotizacion, fecha, referencia, es_sena)
      VALUES (${venta.id}, ${medios[i]}, ${monto}, ${moneda}, ${cot}, ${fechaVenta},
              ${refs[i] || null}, ${esReserva})
      RETURNING id`;

    // La plata que entra de verdad impacta en la caja. La permuta y la
    // financiación no son plata en mano, así que no tocan ninguna cuenta.
    if (cuentaId && MEDIOS_A_CAJA.includes(medios[i])) {
      await sql`
        INSERT INTO caja_movimientos (cuenta_id, tipo, categoria, descripcion, monto, moneda,
                                      cotizacion, equivalente_ars, fecha, vehiculo_id, venta_id,
                                      venta_pago_id, usuario_id)
        VALUES (${cuentaId}, 'ingreso', 'venta_usado',
                ${"Venta " + (veh?.marca || "") + " " + (veh?.modelo || "")},
                ${monto}, ${moneda}, ${cot}, ${enPesos}, ${fechaVenta}, ${vehiculoId}, ${venta.id},
                ${pago.id}, ${usr.id})`;
    }
  }

  if (esReserva && cobrado > 0) {
    await sql`UPDATE ventas SET sena = ${cobrado},
                sena_vence = ${txt("sena_vence") ?? enDias(fechaVenta, 7)}
              WHERE id = ${venta.id}`;
  }

  /* ------------------------------------------------- permuta que entra */
  const permutaMarca = txt("permuta_marca");
  const permutaValor = num("permuta_valor") ?? 0;
  if (permutaMarca && permutaValor > 0) {
    const [nuevo] = await sql`
      INSERT INTO vehiculos (dominio, marca, modelo, anio, km, tipo_adquisicion,
                             fecha_ingreso, sucursal_id, valor_compra, precio_venta, estado,
                             observaciones)
      VALUES (${txt("permuta_dominio")?.toUpperCase() ?? null}, ${permutaMarca},
              ${txt("permuta_modelo") ?? "—"}, ${num("permuta_anio")}, ${num("permuta_km") ?? 0},
              'permuta', ${fechaVenta}, ${num("sucursal_id") ?? veh?.sucursal_id ?? null},
              ${permutaValor}, 0, 'en_revision',
              ${"Recibido en permuta por la venta #" + venta.id})
      RETURNING id`;
    await sql`INSERT INTO vehiculo_ficha (vehiculo_id) VALUES (${nuevo.id})
              ON CONFLICT (vehiculo_id) DO NOTHING`;
    await sql`UPDATE ventas SET permuta_vehiculo_id = ${nuevo.id}, permuta_valor = ${permutaValor}
              WHERE id = ${venta.id}`;

    // El usado que se toma es parte del pago: si no se lo cargó también como
    // renglón «Permuta», se agrega solo. Sin esto el valor del usado quedaba
    // como saldo que el cliente debía.
    if (!medios.includes("permuta")) {
      const ref = [permutaMarca, txt("permuta_modelo"), num("permuta_anio"), txt("permuta_dominio")?.toUpperCase()]
        .filter(Boolean).join(" ");
      await sql`
        INSERT INTO venta_pagos (venta_id, medio, monto, moneda, cotizacion, fecha, referencia, es_sena)
        VALUES (${venta.id}, 'permuta', ${permutaValor}, 'ARS', 1, ${fechaVenta}, ${ref || null}, false)`;
      cobrado += permutaValor;
    }
  }

  /* ------------------------------------------------------ financiación */
  const entidad = txt("fin_entidad");
  const finMonto = num("fin_monto") ?? 0;
  if (entidad && finMonto > 0) {
    await sql`
      INSERT INTO financiaciones (venta_id, entidad, monto, cuotas, tasa, primera_cuota, estado)
      VALUES (${venta.id}, ${entidad}, ${finMonto}, ${num("fin_cuotas") ?? 1},
              ${num("fin_tasa")}, ${txt("fin_primera")}, 'en_tramite')`;
  }

  /* ------------------------------------------------------- saldo a cobrar */
  const saldo = Math.round(total - cobrado);
  if (saldo > 0) {
    // El saldo puede quedar pactado en dólares. Se guarda en la moneda en
    // que se pactó, no convertido: es la cifra que el cliente tiene que pagar.
    const monedaSaldo = String(fd.get("moneda_saldo") || "ARS") === "USD" ? "USD" : "ARS";
    const cotSaldo = monedaSaldo === "USD" ? (num("cotizacion_saldo") || 1) : 1;
    const montoSaldo = monedaSaldo === "USD" ? Math.round(saldo / cotSaldo) : saldo;

    await sql`
      INSERT INTO cobranzas (venta_id, cliente_id, concepto, monto, moneda, cotizacion,
                             vencimiento, estado)
      VALUES (${venta.id}, ${clienteId}, ${"Saldo venta #" + venta.id},
              ${montoSaldo}, ${monedaSaldo}, ${cotSaldo},
              ${txt("vencimiento_saldo") ?? fechaVenta}, 'pendiente')`;
  }

  /* ---------------------------------------------------- estado del auto */
  await sql`UPDATE vehiculos SET estado = ${estado === "completada" ? "vendido" : "reservado"}
            WHERE id = ${vehiculoId}`;

  const leadId = num("lead_id");
  if (leadId) {
    await sql`UPDATE leads SET estado = ${estado === "completada" ? "vendido" : "reservado"},
                               etapa = 'cierre', actualizado_en = now(),
                               cliente_id = COALESCE(cliente_id, ${clienteId})
              WHERE id = ${leadId}`;
    await sql`INSERT INTO lead_interacciones (lead_id, tipo, detalle, usuario_id)
              VALUES (${leadId}, 'cambio_estado', ${"Se generó la venta #" + venta.id}, ${usr.id})`;
  }

  // Una venta que se carga ya cerrada abre la postventa igual que si se
  // cerrara después desde la ficha.
  if (estado === "completada") {
    await sql`INSERT INTO postventa (venta_id, vtv_vence)
              SELECT ${venta.id}, (SELECT vtv_vence FROM vehiculo_ficha WHERE vehiculo_id = ${vehiculoId})
              WHERE NOT EXISTS (SELECT 1 FROM postventa WHERE venta_id = ${venta.id})`;
  }

  await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
            VALUES (${usr.id}, 'venta', ${venta.id}, 'alta', ${plataSimple(total)})`;

  const unidad = `${veh?.marca || ""} ${veh?.modelo || ""}`.trim();
  if (estado === "completada") {
    await avisar(`✅ <b>Venta cerrada</b> · ${enlace("/ventas/" + venta.id, "#" + venta.id)}\n` +
      `${t(unidad)} por ${plataAviso(total)}\n` +
      `La unidad sale del stock y de la web. Vendió ${t(usr.nombre)}.`);
  } else if (esReserva && cobrado > 0) {
    const [vt] = await sql`SELECT sena_vence FROM ventas WHERE id = ${venta.id}`;
    await avisar(`💰 <b>Seña registrada</b> · ${enlace("/ventas/" + venta.id, "#" + venta.id)}\n` +
      `${t(unidad)} · ${plataAviso(cobrado)}\n` +
      `Vence el ${fechaCorta(vt?.sena_vence)}. Cargó ${t(usr.nombre)}.`);
  }

  return {
    ok: true,
    id: Number(venta.id),
    mensaje: estado === "completada" ? "Venta cerrada. La unidad salió del stock y de la web."
      : esReserva ? "Reserva cargada. La unidad quedó señada y salió de la web." : "Operación cargada",
  };
}

/** Un cobro sobre una venta que ya existe. En reserva, lo que entra es seña. */
export async function registrarPago(
  usr: Usuario, ventaId: number, fd: FormData,
): Promise<Res<{ pagoId: number; esSena: boolean }>> {
  if (!puede(usr, "ventas")) return fallo(SIN_PERMISO);
  const id = ventaId;
  const [v] = await sql`SELECT vt.estado, vt.vehiculo_id, x.marca, x.modelo
                        FROM ventas vt JOIN vehiculos x ON x.id = vt.vehiculo_id WHERE vt.id = ${id}`;
  if (!v) return fallo("Esa venta no existe.");
  if (v.estado === "cancelada") return fallo("Esa operación está cancelada: no se le pueden cargar cobros.");

  const monto = Number(fd.get("monto") || 0);
  if (!monto) return fallo("Falta el monto.");
  const medio = String(fd.get("medio") || "efectivo");
  const moneda = String(fd.get("moneda") || "ARS") === "USD" ? "USD" : "ARS";
  const cot = moneda === "USD" ? Number(fd.get("cotizacion") || 1) : 1;
  const f = String(fd.get("fecha") || new Date().toISOString().slice(0, 10));

  // Mientras la operación está en reserva, lo que entra es seña (o refuerzo).
  const esSena = v.estado === "reserva";
  const [pago] = await sql`
    INSERT INTO venta_pagos (venta_id, medio, monto, moneda, cotizacion, fecha, referencia, es_sena)
    VALUES (${id}, ${medio}, ${monto}, ${moneda}, ${cot}, ${f},
            ${String(fd.get("referencia") || "") || null}, ${esSena})
    RETURNING id`;
  if (esSena) {
    await sql`UPDATE ventas SET sena = sena + ${monto * cot},
                sena_vence = COALESCE(sena_vence, ${f}::date + 7)
              WHERE id = ${id}`;
  }

  const cuenta = fd.get("cuenta_id") ? Number(fd.get("cuenta_id")) : null;
  if (cuenta && MEDIOS_A_CAJA.includes(medio)) {
    await sql`
      INSERT INTO caja_movimientos (cuenta_id, tipo, categoria, descripcion, monto, moneda,
                                    cotizacion, equivalente_ars, fecha, vehiculo_id, venta_id,
                                    venta_pago_id, usuario_id)
      VALUES (${cuenta}, 'ingreso', 'venta_usado', ${"Cobro venta #" + id}, ${monto},
              ${moneda}, ${cot}, ${monto * cot}, ${f}, ${v.vehiculo_id}, ${id}, ${pago.id}, ${usr.id})`;
  }

  // El saldo abierto se va descontando solo: si se salda, la cobranza se cierra.
  const enPesos = monto * cot;
  const [ab] = await sql`SELECT id, monto, cobrado, moneda, cotizacion FROM cobranzas
                         WHERE venta_id = ${id} AND estado <> 'cobrado'
                         ORDER BY vencimiento LIMIT 1`;
  if (ab) {
    // La cobranza lleva su propia moneda: hay que imputar el cobro en esa
    // moneda, no en pesos, o un saldo en dólares se cancelaría con la cifra
    // equivocada apenas se mueva la cotización.
    const monedaDeuda = (ab.moneda || "ARS") as "ARS" | "USD";
    const imputado = monedaDeuda === "USD"
      ? (moneda === "USD" ? monto : enPesos / Number(ab.cotizacion || cot || 1))
      : enPesos;
    const nuevo = Number(ab.cobrado) + imputado;
    await sql`UPDATE cobranzas
              SET cobrado = ${nuevo},
                  estado = ${nuevo >= Number(ab.monto) ? "cobrado" : "pendiente"},
                  fecha_cobro = ${nuevo >= Number(ab.monto) ? f : null},
                  forma_cobro = ${MEDIOS_PAGO[medio] || medio}
              WHERE id = ${ab.id}`;
  }
  await avisar(`💵 <b>${esSena ? "Seña registrada" : "Cobro registrado"}</b> · ` +
    `${enlace("/ventas/" + id, "venta #" + id)}\n` +
    `${t(v.marca)} ${t(v.modelo)} · ${plataAviso(monto, moneda)} en ${t(MEDIOS_PAGO[medio] || medio)}. ` +
    `Cargó ${t(usr.nombre)}.`);
  return { ok: true, pagoId: Number(pago.id), esSena };
}

export async function extenderSena(usr: Usuario, ventaId: number, nueva: string): Promise<Res> {
  if (!puede(usr, "ventas")) return fallo(SIN_PERMISO);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nueva)) return fallo("Elegí la fecha nueva.");
  const [v] = await sql`UPDATE ventas SET sena_vence = ${nueva} WHERE id = ${ventaId} RETURNING id`;
  if (!v) return fallo("Esa venta no existe.");
  await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
            VALUES (${usr.id}, 'venta', ${ventaId}, 'sena_vence', ${nueva})`;
  return { ok: true };
}

/** Reserva → en proceso → completada, o cancelada. El auto sigue a sus ventas. */
export async function cambiarEstadoVenta(usr: Usuario, ventaId: number, nuevo: string): Promise<Res<{ mensaje: string }>> {
  if (!puede(usr, "ventas")) return fallo(SIN_PERMISO);
  const id = ventaId;
  if (!ESTADOS_VENTA[nuevo]) return fallo("Ese estado no existe.");
  const [v] = await sql`SELECT vt.estado, vt.vehiculo_id, vt.precio, vt.descuento, x.marca, x.modelo
                        FROM ventas vt JOIN vehiculos x ON x.id = vt.vehiculo_id WHERE vt.id = ${id}`;
  if (!v) return fallo("Esa venta no existe.");
  const total = Number(v.precio) - Number(v.descuento);

  const otra = await ventaActiva(v.vehiculo_id, id);
  if (nuevo !== "cancelada" && otra) {
    return fallo(`La unidad ya tiene la venta #${otra.id}: no puede haber dos ventas vivas del mismo auto.`);
  }
  await sql`UPDATE ventas SET estado = ${nuevo} WHERE id = ${id}`;

  // El estado del auto sigue a sus ventas: cancelar esta lo devuelve al
  // stock, salvo que haya otra venta del mismo auto.
  const estadoAuto = await sincronizarAuto(v.vehiculo_id);

  // Cerrar la venta abre el seguimiento de postventa, una sola vez.
  if (nuevo === "completada") {
    await sql`INSERT INTO postventa (venta_id, vtv_vence)
              SELECT ${id}, (SELECT vtv_vence FROM vehiculo_ficha WHERE vehiculo_id = ${v.vehiculo_id})
              WHERE NOT EXISTS (SELECT 1 FROM postventa WHERE venta_id = ${id})`;
  }
  if (nuevo !== v.estado && nuevo === "completada") {
    await avisar(`✅ <b>Venta cerrada</b> · ${enlace("/ventas/" + id, "#" + id)}\n` +
      `${t(v.marca)} ${t(v.modelo)} por ${plataAviso(total)}\n` +
      `La unidad sale del stock y de la web. Cerró ${t(usr.nombre)}.`);
  } else if (nuevo !== v.estado && nuevo === "cancelada" && estadoAuto === "disponible") {
    await avisar(`↩️ <b>Operación cancelada</b> · ${enlace("/ventas/" + id, "#" + id)}\n` +
      `${t(v.marca)} ${t(v.modelo)} vuelve a estar disponible (y a la web).`);
  }
  await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
            VALUES (${usr.id}, 'venta', ${id}, 'estado', ${nuevo})`;
  return {
    ok: true,
    mensaje: nuevo === "completada" ? "Venta cerrada. La unidad salió del stock y de la web."
      : nuevo === "cancelada" ? (estadoAuto === "disponible" ? "Operación cancelada. La unidad volvió al stock y a la web."
        : `Operación cancelada. La unidad sigue en la venta #${otra?.id}.`)
      : `Operación: ${ESTADOS_VENTA[nuevo].label}`,
  };
}
