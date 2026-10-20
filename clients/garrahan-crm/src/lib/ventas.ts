import { sql } from "@/lib/db";

// La conexión o la transacción en curso: las dos se usan igual.
type Tx = any;

/** La venta que sigue viva para una unidad, si hay. Una cancelada no cuenta. */
export async function ventaActiva(vehiculoId: number, salvo = 0, tx: Tx = sql) {
  const [v] = await tx`SELECT id, estado FROM ventas
                       WHERE vehiculo_id = ${vehiculoId} AND estado <> 'cancelada' AND id <> ${salvo}
                       ORDER BY (estado = 'completada') DESC, id DESC LIMIT 1`;
  return v as { id: number; estado: string } | undefined;
}

/**
 * El estado del auto sale de sus ventas, no de la última que se tocó: si se
 * cancela o se borra una venta repetida, el auto sigue vendido por la otra
 * y no vuelve a la web.
 */
export async function sincronizarAuto(vehiculoId: number, tx: Tx = sql) {
  const viva = await ventaActiva(vehiculoId, 0, tx);
  const estado = !viva ? "disponible" : viva.estado === "completada" ? "vendido" : "reservado";
  await tx`UPDATE vehiculos SET estado = ${estado}
           WHERE id = ${vehiculoId} AND estado IN ('disponible','reservado','vendido')`;
  return estado;
}

/**
 * Deja el saldo a cobrar de acuerdo con el precio y los cobros actuales.
 * Se llama después de corregir el precio o de quitar un cobro.
 */
export async function recalcularSaldo(ventaId: number, tx: Tx = sql) {
  const [v] = await tx`SELECT precio, descuento, cliente_id, fecha FROM ventas WHERE id = ${ventaId}`;
  if (!v) return;
  const [p] = await tx`SELECT COALESCE(SUM(monto * CASE WHEN moneda = 'USD' THEN COALESCE(cotizacion, 1) ELSE 1 END), 0) AS cobrado
                       FROM venta_pagos WHERE venta_id = ${ventaId}`;
  const saldo = Number(v.precio) - Number(v.descuento) - Number(p.cobrado);

  const [c] = await tx`SELECT * FROM cobranzas WHERE venta_id = ${ventaId} ORDER BY id DESC LIMIT 1`;
  if (!c) {
    if (saldo > 0.5) {
      await tx`INSERT INTO cobranzas (venta_id, cliente_id, concepto, monto, moneda, cotizacion, vencimiento, estado)
               VALUES (${ventaId}, ${v.cliente_id}, ${"Saldo venta #" + ventaId}, ${Math.round(saldo)}, 'ARS', 1,
                       ${v.fecha}, 'pendiente')`;
    }
    return;
  }
  // Lo que falta, en la moneda en que se pactó el saldo.
  const falta = c.moneda === "USD" ? saldo / Number(c.cotizacion || 1) : saldo;
  const monto = Math.max(Number(c.cobrado), Math.round(Number(c.cobrado) + falta));
  const saldada = monto - Number(c.cobrado) <= 0.5;
  await tx`UPDATE cobranzas SET monto = ${monto}, cliente_id = ${v.cliente_id},
             estado = ${saldada ? "cobrado" : c.estado === "vencido" ? "vencido" : "pendiente"},
             fecha_cobro = ${saldada ? c.fecha_cobro ?? new Date().toISOString().slice(0, 10) : null}
           WHERE id = ${c.id}`;
}
