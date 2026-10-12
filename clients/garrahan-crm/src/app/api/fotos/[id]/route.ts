import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Sirve una foto de una unidad. Es pública porque la web la muestra. Una foto
 * no cambia nunca (si se reemplaza, cambia el id), así que se cachea fuerte.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return new Response("No encontrada", { status: 404 });

  const [f] = await sql`SELECT tipo, datos FROM vehiculo_fotos WHERE id = ${n}`;
  if (!f) return new Response("No encontrada", { status: 404 });

  return new Response(new Uint8Array(f.datos), {
    headers: {
      "Content-Type": f.tipo,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
