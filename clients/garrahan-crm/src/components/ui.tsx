import Link from "next/link";
import type { ReactNode } from "react";
import type { Tono } from "@/lib/constantes";

/* ------------------------------------------------------------------- tonos */
const TONOS: Record<Tono, string> = {
  verde:    "text-[var(--c-verde)] bg-[var(--c-verde-fondo)] border-[var(--c-verde-borde)]",
  azul:     "text-[var(--c-enlace)] bg-[var(--c-azul-fondo)] border-[var(--c-azul-borde)]",
  celeste:  "text-[var(--c-celeste)] bg-[var(--c-celeste-fondo)] border-[var(--c-celeste-borde)]",
  violeta:  "text-[var(--c-violeta-alto)] bg-[var(--c-violeta-fondo)] border-[var(--c-violeta-borde)]",
  naranja:  "text-[var(--c-naranja-alto)] bg-[var(--c-naranja-fondo)] border-[var(--c-naranja-borde)]",
  amarillo: "text-[var(--c-amarillo)] bg-[var(--c-amarillo-fondo)] border-[var(--c-amarillo-borde)]",
  rojo:     "text-[var(--c-rojo-alto)] bg-[var(--c-rojo-fondo)] border-[var(--c-rojo-borde)]",
  gris:     "text-[var(--c-tinta-gris)] bg-[var(--c-gris-fondo)] border-[var(--c-borde-alto)]",
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
    verde: "bg-[var(--c-verde)]", azul: "bg-[var(--c-azul)]", celeste: "bg-[var(--c-celeste)]",
    violeta: "bg-[var(--c-violeta)]", naranja: "bg-[var(--c-naranja)]", amarillo: "bg-[var(--c-amarillo)]",
    rojo: "bg-[var(--c-rojo)]", gris: "bg-[var(--c-tinta-tenue)]",
  };
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${c[tono]}`} />;
}

/* ------------------------------------------------------------------ paneles */
export function Panel({ children, className = "", padding = true }:
  { children: ReactNode; className?: string; padding?: boolean }) {
  return (
    <div className={`bg-[var(--c-panel)] border border-[var(--c-borde)] rounded-xl ${padding ? "p-5" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function PanelTitulo({ titulo, detalle, accion }:
  { titulo: string; detalle?: string; accion?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h3 className="text-[15px] font-semibold text-[var(--c-tinta)]">{titulo}</h3>
        {detalle && <p className="text-[12.5px] text-[var(--c-tinta-tenue)] mt-0.5">{detalle}</p>}
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
    <div className={`bg-[var(--c-panel)] border rounded-xl px-5 py-4 h-full transition-colors
      ${tono ? TONOS[tono].split(" ")[2] : "border-[var(--c-borde)]"} ${href ? "hover:border-[var(--c-primario)]" : ""}`}>
      <div className="etiqueta flex items-center gap-1.5">
        {tono && <Punto tono={tono} />}
        {label}
      </div>
      <div className="mt-2 text-[27px] leading-none font-semibold tabular text-[var(--c-tinta)]">{valor}</div>
      <div className="mt-1.5 flex items-center gap-2 min-h-[18px]">
        {delta && (
          <span className={`text-[11.5px] font-semibold ${delta.positivo ? "text-[var(--c-verde)]" : "text-[var(--c-rojo-alto)]"}`}>
            {delta.positivo ? "↑" : "↓"} {delta.valor}
          </span>
        )}
        {detalle && <span className="text-[11.5px] text-[var(--c-tinta-tenue)]">{detalle}</span>}
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
    primario: "bg-[var(--c-primario)] hover:bg-[var(--c-primario-alto)] text-white",
    suave:    "bg-[var(--c-activo)] hover:bg-[var(--c-activo-alto)] text-[var(--c-tinta-clara)] border border-[var(--c-borde)]",
    fantasma: "hover:bg-[var(--c-activo)] text-[var(--c-tinta-media)]",
    peligro:  "bg-[var(--c-rojo-fondo)] hover:bg-[var(--c-rojo-fondo-alto)] text-[var(--c-rojo-alto)] border border-[var(--c-rojo-borde)]",
    exito:    "bg-[var(--c-verde-fondo)] hover:bg-[var(--c-verde-fondo-alto)] text-[var(--c-verde-alto)] border border-[var(--c-verde-borde)]",
  };
  const cls = `${base} ${v[variante] || v.primario} ${className}`;
  if (href) return <Link href={href} className={cls} {...rest}>{children}</Link>;
  return <button type={tipo} onClick={onClick} className={cls} {...rest}>{children}</button>;
}

/* --------------------------------------------------------------------- tabla */
export function Tabla({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto bg-[var(--c-panel)] border border-[var(--c-borde)] rounded-xl ${className}`}>
      <table className="w-full text-[13px]">{children}</table>
    </div>
  );
}

export function TH({ children, alinear = "left", className = "" }:
  { children?: ReactNode; alinear?: "left" | "right" | "center"; className?: string }) {
  return (
    <th className={`etiqueta px-4 py-3 border-b border-[var(--c-borde)] whitespace-nowrap
      ${alinear === "right" ? "text-right" : alinear === "center" ? "text-center" : "text-left"} ${className}`}>
      {children}
    </th>
  );
}

export function TD({ children, alinear = "left", className = "" }:
  { children?: ReactNode; alinear?: "left" | "right" | "center"; className?: string }) {
  return (
    <td className={`px-4 py-3 border-b border-[var(--c-borde-suave)] align-middle
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
        className={`inline-flex items-center gap-1 hover:text-[var(--c-tinta-clara)] transition-colors
          ${activo ? "text-[var(--c-tinta)]" : ""}`}>
        {children}
        <span className={`text-[10px] ${activo ? "text-[var(--c-primario)]" : "text-[var(--c-borde-alto)]"}`}>
          {flecha || "↕"}
        </span>
      </Link>
    </TH>
  );
}

export function FilaVacia({ cols, mensaje = "No hay registros todavía." }: { cols: number; mensaje?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-14 text-center text-[var(--c-tinta-tenue)] text-[13px]">{mensaje}</td>
    </tr>
  );
}

/* ------------------------------------------------------------------- estados */
export function Vacio({ titulo, detalle, accion, icono }:
  { titulo: string; detalle?: string; accion?: ReactNode; icono?: ReactNode }) {
  return (
    <div className="bg-[var(--c-panel)] border border-[var(--c-borde)] rounded-xl py-16 px-6 text-center">
      {icono && <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[var(--c-activo)] grid place-items-center text-[var(--c-tinta-tenue)]">{icono}</div>}
      <h3 className="text-[15px] font-semibold text-[var(--c-tinta)]">{titulo}</h3>
      {detalle && <p className="text-[13px] text-[var(--c-tinta-tenue)] mt-1.5 max-w-md mx-auto leading-relaxed">{detalle}</p>}
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
            hover:bg-[var(--c-activo)] text-[var(--c-tinta-media)] shrink-0">←</Link>
        )}
        <div>
          <h1 className="text-[23px] font-semibold text-[var(--c-tinta)] leading-tight">{titulo}</h1>
          {detalle && <p className="text-[13px] text-[var(--c-tinta-tenue)] mt-1">{detalle}</p>}
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
        <div className="h-1.5 flex-1 rounded-full bg-[var(--c-borde)] overflow-hidden">
          <div className="h-full rounded-full bg-[var(--c-verde)] transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11.5px] text-[var(--c-tinta-media)] tabular shrink-0">{hechos}/{total}</span>
      </div>
      {etiqueta && <div className="text-[11px] text-[var(--c-tinta-tenue)] mt-1">{etiqueta}</div>}
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
          <span key={i} className={`h-1.5 w-5 rounded-full ${i <= indice ? "bg-[var(--c-primario)]" : "bg-[var(--c-borde)]"}`} />
        ))}
      </div>
      {etiqueta && <div className="text-[11px] text-[var(--c-tinta-tenue)] mt-1">{etiqueta}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- monto */
export function Monto({ valor, signo = false, className = "" }:
  { valor: number; signo?: boolean; className?: string }) {
  const n = Number(valor || 0);
  const color = !signo ? "" : n > 0 ? "text-[var(--c-verde)]" : n < 0 ? "text-[var(--c-rojo-alto)]" : "";
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
    <div className="flex items-baseline justify-between gap-6 py-2 border-b border-[var(--c-borde-suave)] last:border-0">
      <span className="text-[12.5px] text-[var(--c-tinta-tenue)] shrink-0">{label}</span>
      <span className="text-[13px] text-[var(--c-tinta)] text-right font-medium">{children}</span>
    </div>
  );
}
