import { NextResponse } from "next/server";
import { stockPublico, basePublica } from "@/lib/publico";

export const dynamic = "force-dynamic";

/** El stock publicado, para garrahanautomotores.com.ar. Público y de solo lectura. */
export async function GET(req: Request) {
  const vehicles = await stockPublico(basePublica(req));
  return NextResponse.json({ vehicles }, {
    headers: {
      // Un minuto alcanza: un auto vendido desaparece de la web casi enseguida.
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
