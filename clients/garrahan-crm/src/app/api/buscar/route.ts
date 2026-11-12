import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { usuarioActual, veCostos } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Buscador global. Una sola caja para todo: dominio, cliente, teléfono,
 * marca, modelo o número de venta. Si hay que adivinar en qué listado
 * buscar, la búsqueda no sirve.
 */
export async function GET(req: Request) {
  const u = await usuarioActual();
  if (!u) return NextResponse.json({ resultados: [] }, { status: 401 });

  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ resultados: [] });

  const like = `%${q}%`;
  const comoNumero = /^\d+$/.test(q) ? Number(q) : 0;

  const [vehiculos, clientes, leads, ventas] = await Promise.all([
    sql`SELECT id, marca, modelo, anio, dominio, estado, precio_venta
        FROM vehiculos
        WHERE dominio ILIKE ${like} OR marca ILIKE ${like} OR modelo ILIKE ${like}
           OR (marca || ' ' || modelo) ILIKE ${like} OR nro_chasis ILIKE ${like}
        ORDER BY (estado = 'disponible') DESC, marca LIMIT 6`,
    sql`SELECT id, nombre, apellido, telefono, dni_cuit FROM clientes
        WHERE nombre ILIKE ${like} OR apellido ILIKE ${like}
           OR telefono ILIKE ${like} OR dni_cuit ILIKE ${like}
        ORDER BY nombre LIMIT 5`,
    sql`SELECT id, nombre, telefono, estado FROM leads
        WHERE nombre ILIKE ${like} OR telefono ILIKE ${like} OR email ILIKE ${like}
        ORDER BY actualizado_en DESC LIMIT 5`,
    sql`SELECT v.id, v.fecha, v.precio, v.descuento, v.estado,
               x.marca, x.modelo, c.nombre AS cliente
        FROM ventas v
        JOIN vehiculos x ON x.id = v.vehiculo_id
        LEFT JOIN clientes c ON c.id = v.cliente_id
        WHERE v.id = ${comoNumero} OR c.nombre ILIKE ${like}
           OR x.dominio ILIKE ${like} OR (x.marca || ' ' || x.modelo) ILIKE ${like}
        ORDER BY v.fecha DESC LIMIT 5`,
  ]);

  const verPrecios = veCostos(u);
  const pesos = (n: any) => "$ " + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });

  const resultados = [
    ...vehiculos.map((v: any) => ({
      grupo: "Vehículos",
      titulo: `${v.marca} ${v.modelo} ${v.anio || ""}`.trim(),
      detalle: [v.dominio, v.estado, v.precio_venta ? pesos(v.precio_venta) : null]
        .filter(Boolean).join(" · "),
      href: `/vehiculos/${v.id}`,
    })),
    ...clientes.map((c: any) => ({
      grupo: "Clientes",
      titulo: `${c.nombre} ${c.apellido || ""}`.trim(),
      detalle: [c.telefono, c.dni_cuit].filter(Boolean).join(" · "),
      href: `/clientes?q=${encodeURIComponent(c.nombre)}`,
    })),
    ...leads.map((l: any) => ({
      grupo: "Leads",
      titulo: l.nombre,
      detalle: [l.telefono, l.estado].filter(Boolean).join(" · "),
      href: `/leads/${l.id}`,
    })),
    ...ventas.map((v: any) => ({
      grupo: "Ventas",
      titulo: `Venta #${v.id} — ${v.marca} ${v.modelo}`,
      detalle: [v.cliente, v.estado, verPrecios ? pesos(Number(v.precio) - Number(v.descuento)) : null]
        .filter(Boolean).join(" · "),
      href: `/ventas/${v.id}`,
    })),
  ];

  return NextResponse.json({ resultados });
}
