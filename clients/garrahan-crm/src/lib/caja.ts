import { CATEGORIAS } from "@/lib/constantes";

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

  const moneda = fd.get("moneda") === "USD" ? "USD" : "ARS";
  const cotizacion = moneda === "USD" ? Number(fd.get("cotizacion") || 0) : 1;
  if (!(cotizacion > 0)) return "Falta la cotización del dólar.";

  return {
    fecha, tipo: tipo as DatosMovimiento["tipo"], cuenta, destino: destino || null,
    categoria: categoria || null, descripcion,
    contraparte: String(fd.get("contraparte") || "").trim(),
    monto, moneda, cotizacion, equivalente: moneda === "USD" ? monto * cotizacion : monto,
    forma_pago: String(fd.get("forma_pago") || "").trim(),
  };
}
