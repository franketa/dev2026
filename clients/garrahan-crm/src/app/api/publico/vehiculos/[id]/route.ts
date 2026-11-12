import { NextResponse } from "next/server";
import { unidadPublica, basePublica } from "@/lib/publico";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  const v = Number.isInteger(n) && n > 0 ? await unidadPublica(n, basePublica(req)) : null;
  if (!v) return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
  return NextResponse.json(v, {
    headers: { "Cache-Control": "public, max-age=60", "Access-Control-Allow-Origin": "*" },
  });
}
