import { sql } from "./db";

/**
 * Cotización del dólar blue, que es la que usan para valuar las unidades.
 * Se guarda una por día en la tabla `cotizaciones`: así los cálculos viejos
 * no cambian solos cuando el dólar se mueve.
 *
 * Si la API no responde, se devuelve la última guardada. Nunca rompe la
 * pantalla por no poder consultar un precio.
 */
export async function cotizacionDeHoy(): Promise<{ valor: number; fecha: any } | null> {
  const hoy = new Date().toISOString().slice(0, 10);

  const [guardada] = await sql`
    SELECT valor, fecha FROM cotizaciones WHERE fecha = ${hoy}`;
  if (guardada) return guardada as any;

  try {
    const r = await fetch("https://dolarapi.com/v1/dolares/blue", {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });
    if (r.ok) {
      const d = await r.json();
      const valor = Number(d?.venta);
      if (valor > 0) {
        await sql`INSERT INTO cotizaciones (fecha, valor) VALUES (${hoy}, ${valor})
                  ON CONFLICT (fecha) DO UPDATE SET valor = EXCLUDED.valor`;
        return { valor, fecha: hoy };
      }
    }
  } catch {
    // Sin internet o API caída: se sigue con la última que haya.
  }

  const [ultima] = await sql`SELECT valor, fecha FROM cotizaciones ORDER BY fecha DESC LIMIT 1`;
  return (ultima as any) ?? null;
}
