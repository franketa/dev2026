import { CATEGORIAS, TIPOS_COSTO } from "@/lib/constantes";
import { registrarCosto, repartir } from "@/lib/costos";

/** Lo que se carga a mano en Caja, ya validado. */
export type DatosMovimiento = {
  fecha: string;
  tipo: "ingreso" | "egreso" | "transferencia";
  cuenta: number;
  destino: number | null;
  categoria: string | null;
  descripcion: string;
  contraparte: string;
  monto: number;
  moneda: "ARS" | "USD";
  cotizacion: number;
  equivalente: number;
  forma_pago: string;
  /** Con Prep. de unidades: los autos a los que se suma, en partes iguales. */
  vehiculos: number[];
  tipoCosto: string;
};

/**
 * Lee el formulario de un movimiento. Devuelve el texto del error si algo no
 * cierra: un gasto cargado como ingreso suma en vez de restar en la caja.
 */
export function leerMovimiento(fd: FormData): DatosMovimiento | string {
  const tipo = String(fd.get("tipo") || "");
  if (!["ingreso", "egreso", "transferencia"].includes(tipo)) return "Elegí si es ingreso, egreso o transferencia.";
  const monto = Number(fd.get("monto") || 0);
  if (!(monto > 0)) return "Falta el monto.";
  const cuenta = Number(fd.get("cuenta") || 0);
  if (!cuenta) return "Elegí la cuenta.";
  const fecha = String(fd.get("fecha") || "");
  if (!fecha) return "Falta la fecha.";
  const descripcion = String(fd.get("descripcion") || "").trim();
  if (!descripcion) return "Falta la descripción.";

  const destino = tipo === "transferencia" ? Number(fd.get("destino") || 0) : 0;
  if (tipo === "transferencia" && !destino) return "Elegí la cuenta destino.";
  if (destino && destino === cuenta) return "La cuenta destino tiene que ser otra.";

  const categoria = tipo === "transferencia" ? "" : String(fd.get("categoria") || "");
  const cat = CATEGORIAS.find((c) => c.valor === categoria);
  if (cat && (cat.tipo === "gasto") !== (tipo === "egreso")) {
    return `"${cat.label}" es ${cat.tipo === "gasto" ? "un gasto: va como Egreso" : "un ingreso: va como Ingreso"}.`;
  }

  const vehiculos = categoria === "prep_unidad"
    ? [...new Set(fd.getAll("vehiculos").map(Number).filter(Boolean))] : [];
  if (categoria === "prep_unidad" && tipo === "egreso" && vehiculos.length === 0) {
    return "Elegí de qué auto es la preparación: se suma a su costo.";
  }
  const tipoCosto = String(fd.get("tipo_costo") || "");

  const moneda = fd.get("moneda") === "USD" ? "USD" : "ARS";
  const cotizacion = moneda === "USD" ? Number(fd.get("cotizacion") || 0) : 1;
  if (!(cotizacion > 0)) return "Falta la cotización del dólar.";

  return {
    fecha, tipo: tipo as DatosMovimiento["tipo"], cuenta, destino: destino || null,
    categoria: categoria || null, descripcion,
    contraparte: String(fd.get("contraparte") || "").trim(),
    monto, moneda, cotizacion, equivalente: moneda === "USD" ? monto * cotizacion : monto,
    forma_pago: String(fd.get("forma_pago") || "").trim(),
    vehiculos, tipoCosto: TIPOS_COSTO.includes(tipoCosto) ? tipoCosto : "Otro",
  };
}

/**
 * Guarda un movimiento cargado en Caja. Una preparación va a cada auto
 * elegido como costo, con su parte del egreso atada a ese costo: así la
 * unidad suma lo que se gastó en ella y la caja baja lo mismo.
 */
export async function guardarMovimiento(tx: any, d: DatosMovimiento, usuario: number) {
  if (d.vehiculos.length === 0) {
    await tx`
      INSERT INTO caja_movimientos
        (fecha, tipo, cuenta_id, cuenta_destino_id, categoria, descripcion, contraparte,
         monto, moneda, cotizacion, equivalente_ars, forma_pago, usuario_id)
      VALUES (${d.fecha}, ${d.tipo}, ${d.cuenta}, ${d.destino}, ${d.categoria}, ${d.descripcion},
              ${d.contraparte}, ${d.monto}, ${d.moneda}, ${d.cotizacion}, ${d.equivalente},
              ${d.forma_pago}, ${usuario})`;
    return;
  }
  const n = d.vehiculos.length;
  const partes = repartir(d.monto, n);
  for (const [i, vehiculo] of d.vehiculos.entries()) {
    const ars = Math.round(partes[i] * d.cotizacion * 100) / 100;
    await registrarCosto(tx, {
      vehiculo, tipo: d.tipoCosto, proveedor: null, fecha: d.fecha, monto: ars,
      detalle: d.descripcion + (d.contraparte ? ` · ${d.contraparte}` : "") + (n > 1 ? ` (repartido entre ${n} autos)` : ""),
    }, {
      cuenta: d.cuenta, monto: partes[i], moneda: d.moneda, cotizacion: d.cotizacion,
      descripcion: d.descripcion + (n > 1 ? ` (${i + 1} de ${n})` : ""),
      contraparte: d.contraparte, forma_pago: d.forma_pago,
    }, usuario);
  }
}
