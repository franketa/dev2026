import { sql } from "@/lib/db";
import { usuarioActual, veCostos } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Exportación a CSV que Excel abre bien en castellano: separador punto y coma,
 * coma decimal y BOM al principio. Sin el BOM, Excel rompe los acentos.
 */
function csv(filas: any[]): string {
  if (filas.length === 0) return "﻿";
  const cols = Object.keys(filas[0]);
  const celda = (v: any) => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toLocaleDateString("es-AR");
    if (typeof v === "number") return String(v).replace(".", ",");
    const s = String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const encabezado = cols.map((c) => c.replace(/_/g, " ")).join(";");
  const cuerpo = filas.map((f) => cols.map((c) => celda(f[c])).join(";"));
  return "﻿" + [encabezado, ...cuerpo].join("\r\n");
}

export async function GET(req: Request, { params }: { params: Promise<{ que: string }> }) {
  const u = await usuarioActual();
  if (!u) return new Response("No autorizado", { status: 401 });
  const { que } = await params;
  const verCostos = veCostos(u);
  const qs = new URL(req.url).searchParams;

  let filas: any[] = [];

  if (que === "vehiculos") {
    filas = verCostos
      ? await sql`SELECT dominio, marca, modelo, version, anio, km, color, estado,
                         sucursal, propiedad, inversor, fecha_ingreso, dias_stock, alerta,
                         valor_compra, costos, costo_total, capital,
                         precio_venta, margen, margen_pct
                  FROM v_vehiculos ORDER BY marca, modelo`
      : await sql`SELECT dominio, marca, modelo, version, anio, km, color, estado,
                         sucursal, fecha_ingreso, dias_stock, precio_venta
                  FROM v_vehiculos ORDER BY marca, modelo`;
  } else if (que === "ventas") {
    filas = await sql`
      SELECT v.id AS venta, v.fecha, x.dominio, x.marca, x.modelo, x.anio,
             c.nombre AS cliente, c.dni_cuit, us.nombre AS vendedor,
             v.precio, v.descuento, (v.precio - v.descuento) AS total,
             v.sena, v.comision, v.estado, v.estado_tramite, v.facturado
      FROM ventas v
      JOIN vehiculos x ON x.id = v.vehiculo_id
      LEFT JOIN clientes c ON c.id = v.cliente_id
      LEFT JOIN usuarios us ON us.id = v.vendedor_id
      ORDER BY v.fecha DESC`;
  } else if (que === "leads") {
    filas = await sql`
      SELECT l.id, l.nombre, l.telefono, l.email, l.origen, l.etapa, l.estado,
             us.nombre AS asesor, (x.marca || ' ' || x.modelo) AS interesado_en,
             l.presupuesto, l.entrega_usado, l.tasacion,
             l.proxima_accion, l.fecha_proxima, l.motivo_perdida, l.creado_en
      FROM leads l
      LEFT JOIN usuarios us ON us.id = l.asesor_id
      LEFT JOIN vehiculos x ON x.id = l.vehiculo_id
      ORDER BY l.creado_en DESC`;
  } else if (que === "caja") {
    if (!verCostos) return new Response("Sin permiso", { status: 403 });
    filas = await sql`
      SELECT m.fecha, cu.nombre AS cuenta, m.tipo, m.categoria, m.concepto,
             m.monto, m.moneda, m.cotizacion, m.equivalente_ars,
             (x.marca || ' ' || x.modelo) AS vehiculo
      FROM caja_movimientos m
      LEFT JOIN caja_cuentas cu ON cu.id = m.cuenta_id
      LEFT JOIN vehiculos x ON x.id = m.vehiculo_id
      ORDER BY m.fecha DESC, m.id DESC`;
  } else if (que === "clientes") {
    filas = await sql`SELECT nombre, apellido, dni_cuit, telefono, email,
                             direccion, localidad, creado_en
                      FROM clientes ORDER BY nombre`;
  } else if (que === "cobranzas") {
    if (!verCostos) return new Response("Sin permiso", { status: 403 });
    filas = await sql`
      SELECT co.vencimiento, c.nombre AS cliente, co.concepto, co.cuota,
             co.moneda, co.monto, co.cobrado, (co.monto - co.cobrado) AS saldo,
             co.estado, co.forma_cobro, co.fecha_cobro
      FROM cobranzas co LEFT JOIN clientes c ON c.id = co.cliente_id
      ORDER BY co.moneda, co.vencimiento`;
  } else if (que === "reporte") {
    if (!verCostos) return new Response("Sin permiso", { status: 403 });
    const mes = Number(qs.get("mes")) || new Date().getMonth() + 1;
    const anio = Number(qs.get("anio")) || new Date().getFullYear();
    const suc = qs.get("sucursal") ? Number(qs.get("sucursal")) : null;
    const porSuc = suc ? sql`AND v.sucursal_id = ${suc}` : sql``;

    // Una fila por unidad vendida, con de quién era y qué dejó. Es el detalle
    // que respalda el resumen de Reportes: el contador quiere ver el renglón.
    filas = await sql`
      SELECT v.fecha, v.id AS venta, x.dominio, x.marca, x.modelo, x.anio,
             x.propiedad,
             CASE WHEN x.propiedad = 'consignacion' THEN 'Comisión' ELSE 'Margen' END AS deja,
             COALESCE(i.nombre, '') AS inversor,
             COALESCE(s.nombre, '') AS sucursal,
             COALESCE(us.nombre, '') AS vendedor,
             (v.precio - v.descuento) AS total_operacion,
             x.costo_total,
             (v.precio - v.descuento - x.costo_total) AS resultado,
             v.comision AS comision_vendedor
      FROM ventas v
      JOIN v_vehiculos x ON x.id = v.vehiculo_id
      LEFT JOIN inversores i ON i.id = v.inversor_id
      LEFT JOIN sucursales s ON s.id = v.sucursal_id
      LEFT JOIN usuarios us ON us.id = v.vendedor_id
      WHERE v.estado = 'completada'
        AND extract(month FROM v.fecha) = ${mes}
        AND extract(year FROM v.fecha) = ${anio} ${porSuc}
      ORDER BY v.fecha`;
  } else {
    return new Response("No sé exportar eso", { status: 404 });
  }

  const hoy = new Date().toISOString().slice(0, 10);
  return new Response(csv(filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="garrahan-${que}-${hoy}.csv"`,
    },
  });
}
