/** Formatos argentinos. Un solo lugar para que todo el sistema hable igual. */

const AR = "es-AR";

export function plata(v: any, moneda: "ARS" | "USD" = "ARS"): string {
  const n = Number(v ?? 0);
  const simbolo = moneda === "USD" ? "USD " : "$ ";
  return simbolo + n.toLocaleString(AR, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Version corta para tarjetas: $ 28,5 M */
export function plataCorta(v: any, moneda: "ARS" | "USD" = "ARS"): string {
  const n = Number(v ?? 0);
  const simbolo = moneda === "USD" ? "USD " : "$ ";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return simbolo + (n / 1_000_000).toLocaleString(AR, { maximumFractionDigits: 1 }) + " M";
  if (abs >= 1_000) return simbolo + (n / 1_000).toLocaleString(AR, { maximumFractionDigits: 0 }) + " K";
  return simbolo + n.toLocaleString(AR, { maximumFractionDigits: 0 });
}

export function numero(v: any, decimales = 0): string {
  return Number(v ?? 0).toLocaleString(AR, {
    minimumFractionDigits: decimales, maximumFractionDigits: decimales,
  });
}

export function porcentaje(v: any, decimales = 1): string {
  return Number(v ?? 0).toLocaleString(AR, {
    minimumFractionDigits: decimales, maximumFractionDigits: decimales,
  }) + " %";
}

export function fecha(v: any): string {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(AR, { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fechaLarga(v: any): string {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(v);
  return d.toLocaleDateString(AR, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function km(v: any): string {
  return numero(v) + " km";
}

export function dominio(v: any): string {
  return v ? String(v).toUpperCase() : "—";
}

export function iniciales(nombre: string): string {
  return (nombre || "")
    .split(" ").filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "").join("");
}

export function saludo(): string {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buen día";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}
