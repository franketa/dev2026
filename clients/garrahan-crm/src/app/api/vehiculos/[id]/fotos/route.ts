import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { usuarioActual, puede } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const MAX = 4 * 1024 * 1024; // llegan achicadas; esto es solo un tope de seguridad

/** Sube una foto. El navegador ya la mandó achicada (ver subir-fotos.tsx). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await usuarioActual();
  if (!u || !puede(u, "vehiculos.editar")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const { id } = await params;
  const vehiculoId = Number(id);
  const [v] = await sql`SELECT id FROM vehiculos WHERE id = ${vehiculoId}`;
  if (!v) return NextResponse.json({ error: "No existe la unidad" }, { status: 404 });

  const fd = await req.formData();
  const archivo = fd.get("foto");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta la foto" }, { status: 400 });
  if (!TIPOS.includes(archivo.type)) return NextResponse.json({ error: "Formato no admitido" }, { status: 400 });
  if (archivo.size > MAX) return NextResponse.json({ error: "La foto es demasiado grande" }, { status: 400 });

  const datos = Buffer.from(await archivo.arrayBuffer());
  const [f] = await sql`
    INSERT INTO vehiculo_fotos (vehiculo_id, posicion, tipo, datos, ancho, alto)
    VALUES (${vehiculoId},
            (SELECT COALESCE(MAX(posicion) + 1, 0) FROM vehiculo_fotos WHERE vehiculo_id = ${vehiculoId}),
            ${archivo.type}, ${datos},
            ${Number(fd.get("ancho")) || null}, ${Number(fd.get("alto")) || null})
    RETURNING id`;
  return NextResponse.json({ id: f.id });
}
