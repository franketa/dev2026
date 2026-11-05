import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { sql } from "@/lib/db";
import { usuarioActual, puede } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO",
  "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

const AZUL = "FF1F3A68";
const CELESTE = "FFE9EEF8";
const VERDE = "FFDCEFD9";
const BORDE = { style: "thin" as const, color: { argb: "FFB7C3D6" } };

const mayus = (s: any) => (s ? String(s).trim().toUpperCase() : "");

/**
 * La lista de precios de las unidades disponibles, en Excel, como la que la
 * agencia arma a mano para mandar: marca, modelo, versión, año, km, si es 0 km
 * o usado, color y precio de venta al público. Sin costos ni nada interno.
 */
export async function GET() {
  const u = await usuarioActual();
  if (!u) return new Response("No autorizado", { status: 401 });
  if (!puede(u, "vehiculos")) return new Response("Sin permiso", { status: 403 });

  const autos = await sql`
    SELECT marca, modelo, version, anio, km, condicion, color,
           precio_venta, moneda_venta, mostrar_precio
    FROM vehiculos
    WHERE estado = 'disponible'
    ORDER BY (condicion = '0km') DESC, marca, modelo, anio DESC NULLS LAST, version`;

  const libro = new ExcelJS.Workbook();
  libro.creator = "Garrahan Automotores";
  const hoja = libro.addWorksheet("Lista de precios", {
    views: [{ state: "frozen", ySplit: 3 }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  });
  hoja.columns = [
    { width: 16 }, { width: 18 }, { width: 30 }, { width: 8 },
    { width: 13 }, { width: 10 }, { width: 16 }, { width: 17 },
  ];

  // Membrete: el logo centrado arriba y el mes a la derecha.
  hoja.getRow(1).height = 46;
  hoja.getRow(2).height = 18;
  try {
    const logo = await readFile(join(process.cwd(), "public", "logo-horizontal.png"));
    const id = libro.addImage({ buffer: logo as any, extension: "png" });
    hoja.addImage(id, { tl: { col: 2.1, row: 0.12 }, ext: { width: 360, height: 54 } });
  } catch { /* sin logo, la lista sale igual */ }
  const ahora = new Date(Date.now() - 3 * 3600e3);
  const mes = hoja.getCell("H2");
  mes.value = MESES[ahora.getUTCMonth()];
  mes.font = { bold: true, size: 10 };
  mes.alignment = { horizontal: "center" };

  const titulos = ["MARCA", "MODELO", "VERSIÓN", "AÑO", "KMS", "ESTADO", "COLOR", "PRECIO\nVENTA ($)"];
  const enc = hoja.getRow(3);
  enc.values = titulos;
  enc.height = 30;
  enc.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = { top: BORDE, left: BORDE, bottom: BORDE, right: BORDE };
  });

  for (const a of autos) {
    const es0km = a.condicion === "0km";
    const precio = Number(a.precio_venta || 0);
    const conPrecio = precio > 0 && a.mostrar_precio !== false;
    const fila = hoja.addRow([
      mayus(a.marca), mayus(a.modelo), mayus(a.version), a.anio ?? "",
      es0km ? "0 KM" : `${Number(a.km || 0).toLocaleString("es-AR")} KM`,
      es0km ? "0km" : "Usado",
      mayus(a.color),
      conPrecio ? precio : "CONSULTAR",
    ]);
    fila.height = 18;
    fila.eachCell({ includeEmpty: true }, (c, n) => {
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = { top: BORDE, left: BORDE, bottom: BORDE, right: BORDE };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: n === 8 ? VERDE : CELESTE } };
      c.font = { size: 11 };
    });
    if (conPrecio) {
      fila.getCell(8).numFmt = a.moneda_venta === "USD" ? '#,##0" USD"' : '"$ "#,##0';
    }
  }

  const buffer = await libro.xlsx.writeBuffer();
  const nombre = `Lista de precios Garrahan - ${MESES[ahora.getUTCMonth()].toLowerCase()} ${ahora.getUTCFullYear()}.xlsx`;
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="lista-precios-garrahan.xlsx"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
