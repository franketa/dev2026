import Link from "next/link";
import { sql } from "@/lib/db";
import type { Usuario } from "@/lib/auth";
import { veCostos } from "@/lib/auth";

/**
 * Semáforo de la operación en la barra superior. Responde a la única pregunta
 * que alguien se hace al abrir el sistema: ¿hay algo que se me esté pasando?
 *
 * Solo cuenta lo que ya está vencido, no lo que falta hacer. Si mostrara todo
 * lo pendiente nunca diría "al día" y se volvería ruido que se aprende a ignorar.
 */
export default async function EstadoOperacion({ usuario }: { usuario: Usuario }) {
  const verPlata = veCostos(usuario);

  const [leads, cobranzas, demoradas] = await Promise.all([
    sql`SELECT count(*)::int AS n FROM leads
        WHERE fecha_proxima < current_date
          AND estado NOT IN ('vendido','perdido','postergado')`,
    verPlata
      ? sql`SELECT count(*)::int AS n FROM cobranzas
            WHERE estado <> 'cobrado' AND vencimiento < current_date`
      : Promise.resolve([{ n: 0 }]),
    sql`SELECT count(*)::int AS n FROM v_vehiculos
        WHERE estado NOT IN ('vendido','baja') AND dias_stock > 90`,
  ]);

  const items = [
    { n: Number(leads[0]?.n || 0), texto: "leads sin contactar a tiempo", href: "/leads" },
    { n: Number(cobranzas[0]?.n || 0), texto: "cobranzas vencidas", href: "/cobranzas" },
    { n: Number(demoradas[0]?.n || 0), texto: "unidades con más de 90 días", href: "/vehiculos?alerta=rojo" },
  ].filter((x) => x.n > 0);

  const total = items.reduce((a, x) => a + x.n, 0);

  if (total === 0) {
    return (
      <div className="hidden md:flex items-center gap-2 rounded-lg border border-[var(--c-verde-borde)]
        bg-[var(--c-verde-fondo)] px-3 py-1.5" title="No hay nada vencido">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--c-verde)]" />
        <span className="text-[12px] font-semibold text-[var(--c-verde-alto)]">Al día</span>
      </div>
    );
  }

  // Se linkea a lo más urgente: el número solo, sin dónde mirar, no sirve.
  const principal = items.sort((a, b) => b.n - a.n)[0];

  return (
    <Link href={principal.href} title={items.map((x) => `${x.n} ${x.texto}`).join(" · ")}
      className="hidden md:flex items-center gap-2 rounded-lg border border-[var(--c-amarillo-borde)]
        bg-[var(--c-amarillo-fondo)] px-3 py-1.5 hover:border-[var(--c-amarillo)] transition-colors">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--c-amarillo)]" />
      <span className="text-[12px] font-semibold text-[var(--c-amarillo)]">
        {total} {total === 1 ? "pendiente" : "pendientes"}
      </span>
    </Link>
  );
}
