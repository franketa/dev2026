import Link from "next/link";
import type { ReactNode } from "react";
import type { Tono } from "@/lib/constantes";

/* ------------------------------------------------------------------- tonos */
const TONOS: Record<Tono, string> = {
  verde:    "text-[#22c55e] bg-[#052e1a] border-[#14532d]",
  azul:     "text-[#60a5fa] bg-[#0a1b3d] border-[#1e3a8a]",
  celeste:  "text-[#38bdf8] bg-[#052232] border-[#075985]",
  violeta:  "text-[#c084fc] bg-[#210a33] border-[#6b21a8]",
  naranja:  "text-[#fb923c] bg-[#2c1405] border-[#9a3412]",
  amarillo: "text-[#eab308] bg-[#2a2205] border-[#854d0e]",
  rojo:     "text-[#f87171] bg-[#2e0a0a] border-[#991b1b]",
  gris:     "text-[#94a3b8] bg-[#171d27] border-[#334155]",
};

export function Chip({ tono = "gris", children, className = "" }:
  { tono?: Tono; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px]
      text-[11.5px] font-semibold whitespace-nowrap ${TONOS[tono]} ${className}`}>
      {children}
    </span>
  );
}

export function Punto({ tono = "gris" }: { tono?: Tono }) {
  const c: Record<Tono, string> = {
    verde: "bg-[#22c55e]", azul: "bg-[#3b82f6]", celeste: "bg-[#38bdf8]",
    violeta: "bg-[#a855f7]", naranja: "bg-[#f97316]", amarillo: "bg-[#eab308]",
    rojo: "bg-[#ef4444]", gris: "bg-[#64748b]",
  };
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${c[tono]}`} />;
}

/* ------------------------------------------------------------------ paneles */
export function Panel({ children, className = "", padding = true }:
  { children: ReactNode; className?: string; padding?: boolean }) {
  return (
    <div className={`bg-[#111721] border border-[#1f2937] rounded-xl ${padding ? "p-5" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function PanelTitulo({ titulo, detalle, accion }:
  { titulo: string; detalle?: string; accion?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h3 className="text-[15px] font-semibold text-[#e8edf5]">{titulo}</h3>
        {detalle && <p className="text-[12.5px] text-[#64748b] mt-0.5">{detalle}</p>}
      </div>
      {accion}
    </div>
  );
}

/* ---------------------------------------------------------------------- KPI
   La tarjeta que falta en nuestro CRM viejo y que AutoGestion pone arriba de
   CADA listado. Un numero grande, su etiqueta, y opcionalmente una variacion. */
export function KPI({ label, valor, detalle, delta, tono, href }: {
  label: string; valor: ReactNode; detalle?: string;
  delta?: { valor: string; positivo: boolean }; tono?: Tono; href?: string;
}) {
  const cuerpo = (
    <div className={`bg-[#111721] border rounded-xl px-5 py-4 h-full transition-colors
      ${tono ? TONOS[tono].split(" ")[2] : "border-[#1f2937]"} ${href ? "hover:border-[#2f6bff]" : ""}`}>
      <div className="etiqueta flex items-center gap-1.5">
        {tono && <Punto tono={tono} />}
        {label}
      </div>
      <div className="mt-2 text-[27px] leading-none font-semibold tabular text-[#e8edf5]">{valor}</div>
      <div className="mt-1.5 flex items-center gap-2 min-h-[18px]">
        {delta && (
          <span className={`text-[11.5px] font-semibold ${delta.positivo ? "text-[#22c55e]" : "text-[#f87171]"}`}>
            {delta.positivo ? "↑" : "↓"} {delta.valor}
          </span>
        )}
        {detalle && <span className="text-[11.5px] text-[#64748b]">{detalle}</span>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{cuerpo}</Link> : cuerpo;
}

export function GrillaKPI({ children, cols = 4 }: { children: ReactNode; cols?: number }) {
  const c = cols === 3 ? "lg:grid-cols-3" : cols === 2 ? "lg:grid-cols-2" : "lg:grid-cols-4";
  return <div className={`grid gap-3 sm:grid-cols-2 ${c}`}>{children}</div>;
}

/* -------------------------------------------------------------------- botones */
export function Boton({ children, href, onClick, variante = "primario", tipo = "button", className = "", ...rest }: any) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50";
  const v: Record<string, string> = {
    primario: "bg-[#2f6bff] hover:bg-[#4d81ff] text-white",
    suave:    "bg-[#1b2433] hover:bg-[#232e40] text-[#cbd5e1] border border-[#1f2937]",
    fantasma: "hover:bg-[#1b2433] text-[#9aa7b8]",
    peligro:  "bg-[#2e0a0a] hover:bg-[#3d0f0f] text-[#f87171] border border-[#991b1b]",
    exito:    "bg-[#052e1a] hover:bg-[#08401f] text-[#4ade80] border border-[#14532d]",
  };
  const cls = `${base} ${v[variante] || v.primario} ${className}`;
  if (href) return <Link href={href} className={cls} {...rest}>{children}</Link>;
  return <button type={tipo} onClick={onClick} className={cls} {...rest}>{children}</button>;
}

/* --------------------------------------------------------------------- tabla */
export function Tabla({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto bg-[#111721] border border-[#1f2937] rounded-xl ${className}`}>
      <table className="w-full text-[13px]">{children}</table>
    </div>
  );
}

export function TH({ children, alinear = "left", className = "" }:
  { children?: ReactNode; alinear?: "left" | "right" | "center"; className?: string }) {
  return (
    <th className={`etiqueta px-4 py-3 border-b border-[#1f2937] whitespace-nowrap
      ${alinear === "right" ? "text-right" : alinear === "center" ? "text-center" : "text-left"} ${className}`}>
      {children}
    </th>
  );
}

export function TD({ children, alinear = "left", className = "" }:
  { children?: ReactNode; alinear?: "left" | "right" | "center"; className?: string }) {
  return (
    <td className={`px-4 py-3 border-b border-[#172033] align-middle
      ${alinear === "right" ? "text-right tabular" : alinear === "center" ? "text-center" : "text-left"} ${className}`}>
      {children}
    </td>
  );
}

/**
 * Encabezado que ordena la tabla. El primer clic ordena descendente, que es
 * lo que casi siempre se quiere mirar primero: los más caros, los más viejos,
 * los de más días. El segundo clic da vuelta el orden.
 */
export function THOrden({ campo, actual, dir, href, alinear = "left", children }: {
  campo: string; actual: string; dir: string;
  href: (campo: string, dir: string) => string;
  alinear?: "left" | "right" | "center"; children: ReactNode;
}) {
  const activo = actual === campo;
  const proxima = activo && dir === "desc" ? "asc" : "desc";
  const flecha = !activo ? "" : dir === "asc" ? "↑" : "↓";

  return (
    <TH alinear={alinear}>
      <Link href={href(campo, proxima)}
        className={`inline-flex items-center gap-1 hover:text-[#cbd5e1] transition-colors
          ${activo ? "text-[#e8edf5]" : ""}`}>
        {children}
        <span className={`text-[10px] ${activo ? "text-[#2f6bff]" : "text-[#334155]"}`}>
          {flecha || "↕"}
        </span>
      </Link>
    </TH>
  );
}

export function FilaVacia({ cols, mensaje = "No hay registros todavía." }: { cols: number; mensaje?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-14 text-center text-[#64748b] text-[13px]">{mensaje}</td>
    </tr>
  );
}

/* ------------------------------------------------------------------- estados */
export function Vacio({ titulo, detalle, accion, icono }:
  { titulo: string; detalle?: string; accion?: ReactNode; icono?: ReactNode }) {
  return (
    <div className="bg-[#111721] border border-[#1f2937] rounded-xl py-16 px-6 text-center">
      {icono && <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[#1b2433] grid place-items-center text-[#64748b]">{icono}</div>}
      <h3 className="text-[15px] font-semibold text-[#e8edf5]">{titulo}</h3>
      {detalle && <p className="text-[13px] text-[#64748b] mt-1.5 max-w-md mx-auto leading-relaxed">{detalle}</p>}
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  );
}

/* ------------------------------------------------------------- encabezado */
export function Encabezado({ titulo, detalle, acciones, volver }:
  { titulo: ReactNode; detalle?: string; acciones?: ReactNode; volver?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div className="flex items-start gap-3">
        {volver && (
          <Link href={volver} className="mt-1 h-7 w-7 grid place-items-center rounded-lg
            hover:bg-[#1b2433] text-[#9aa7b8] shrink-0">←</Link>
        )}
        <div>
          <h1 className="text-[23px] font-semibold text-[#e8edf5] leading-tight">{titulo}</h1>
          {detalle && <p className="text-[13px] text-[#64748b] mt-1">{detalle}</p>}
        </div>
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- progreso */
export function Progreso({ hechos, total, etiqueta }:
  { hechos: number; total: number; etiqueta?: string }) {
  const pct = total > 0 ? (hechos / total) * 100 : 0;
  return (
    <div className="min-w-[130px]">
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-[#1f2937] overflow-hidden">
          <div className="h-full rounded-full bg-[#22c55e] transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11.5px] text-[#9aa7b8] tabular shrink-0">{hechos}/{total}</span>
      </div>
      {etiqueta && <div className="text-[11px] text-[#64748b] mt-1">{etiqueta}</div>}
    </div>
  );
}

/** Barra de etapas del lead: cinco segmentos que se van llenando. */
export function Etapas({ indice, total = 5, etiqueta }:
  { indice: number; total?: number; etiqueta?: string }) {
  return (
    <div className="min-w-[110px]">
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={`h-1.5 w-5 rounded-full ${i <= indice ? "bg-[#2f6bff]" : "bg-[#1f2937]"}`} />
        ))}
      </div>
      {etiqueta && <div className="text-[11px] text-[#64748b] mt-1">{etiqueta}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- monto */
export function Monto({ valor, signo = false, className = "" }:
  { valor: number; signo?: boolean; className?: string }) {
  const n = Number(valor || 0);
  const color = !signo ? "" : n > 0 ? "text-[#22c55e]" : n < 0 ? "text-[#f87171]" : "";
  const prefijo = signo && n > 0 ? "+" : "";
  return (
    <span className={`tabular ${color} ${className}`}>
      {prefijo}$ {Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
    </span>
  );
}

/* ------------------------------------------------------------------ campos */
export function Campo({ label, children, ancho = "" }:
  { label: string; children: ReactNode; ancho?: string }) {
  return (
    <label className={`block ${ancho}`}>
      <span className="etiqueta block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export function Dato({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2 border-b border-[#172033] last:border-0">
      <span className="text-[12.5px] text-[#64748b] shrink-0">{label}</span>
      <span className="text-[13px] text-[#e8edf5] text-right font-medium">{children}</span>
    </div>
  );
}
