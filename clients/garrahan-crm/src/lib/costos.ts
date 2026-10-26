// La conexión o la transacción en curso: las dos se usan igual.
type Tx = any;

/** La salida de plata de un costo ya pagado, en la moneda en que se pagó. */
export type PagoCosto = {
  cuenta: number;
  monto: number;
  moneda: "ARS" | "USD";
  cotizacion: number;
  descripcion: string;
  contraparte: string;
  forma_pago: string;
};

/**
 * Un costo de la unidad y, si ya se pagó, su egreso en Caja atado al costo.
 * Van juntos para que el costo del auto y el saldo de la caja no queden
 * distintos: cargar solo uno de los dos es lo que descuadra los números.
 */
export async function registrarCosto(tx: Tx, c: {
  vehiculo: number; tipo: string; detalle: string; proveedor: number | null; fecha: string; monto: number;
}, pago: PagoCosto | null, usuario: number) {
  const [costo] = await tx`
    INSERT INTO vehiculo_costos (vehiculo_id, tipo, detalle, proveedor_id, fecha, monto, origen)
    VALUES (${c.vehiculo}, ${c.tipo}, ${c.detalle}, ${c.proveedor}, ${c.fecha}, ${c.monto}, 'manual')
    RETURNING id`;
  if (pago) {
    await tx`
      INSERT INTO caja_movimientos
        (fecha, tipo, cuenta_id, categoria, descripcion, contraparte, monto, moneda, cotizacion,
         equivalente_ars, forma_pago, vehiculo_id, costo_id, usuario_id)
      VALUES (${c.fecha}, 'egreso', ${pago.cuenta}, 'prep_unidad', ${pago.descripcion}, ${pago.contraparte},
              ${pago.monto}, ${pago.moneda}, ${pago.cotizacion}, ${c.monto}, ${pago.forma_pago},
              ${c.vehiculo}, ${costo.id}, ${usuario})`;
  }
  return Number(costo.id);
}

/** Un monto en partes iguales, al centavo. La última lleva lo que sobra del redondeo. */
export function repartir(monto: number, partes: number): number[] {
  const parte = Math.floor((monto * 100) / partes) / 100;
  return Array.from({ length: partes }, (_, i) =>
    i < partes - 1 ? parte : Math.round((monto - parte * (partes - 1)) * 100) / 100);
}

/** Los autos a los que se le puede cargar una preparación: el stock y lo vendido hace poco. */
export const vehiculosParaCostos = (sql: Tx) => sql`
  SELECT id, marca, modelo, anio, dominio FROM vehiculos
  WHERE estado NOT IN ('vendido','baja','promocion')
     OR id IN (SELECT vehiculo_id FROM ventas WHERE estado = 'completada' AND fecha > current_date - 60)
  ORDER BY marca, modelo, anio`;
