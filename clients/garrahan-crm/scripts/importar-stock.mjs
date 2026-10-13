/**
 * Carga el stock inicial (y los saldos de arranque de las cuentas) desde un
 * JSON armado a partir del Excel de la agencia. Para las unidades que ya
 * estaban publicadas en la web vieja, trae las fotos desde ahí.
 *
 *   node scripts/importar-stock.mjs datos.json              → muestra qué haría
 *   node scripts/importar-stock.mjs datos.json --confirmar  → carga
 *   (o el JSON por entrada estándar: ... < datos.json)
 *
 * Los datos NO están en el repositorio a propósito: tienen costos y nombres.
 *
 * Se puede correr dos veces: cada unidad queda marcada en la auditoría con su
 * clave ("excel:12", "web:30") y la segunda vez se saltea.
 * Una unidad sin fotos entra sin publicar: se publica sola cuando le suben
 * fotos y alguien tilda "Publicar en la web".
 */
import postgres from "postgres";
import { readFileSync } from "fs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("Falta DATABASE_URL."); process.exit(1); }
const confirmar = process.argv.includes("--confirmar");
const archivo = process.argv.slice(2).find((a) => !a.startsWith("--"));
const SITIO = (process.env.SITIO_URL || "https://www.garrahanautomotores.com.ar").replace(/\/$/, "");
const sql = postgres(url, { max: 1, onnotice: () => {} });

const datos = JSON.parse(readFileSync(archivo || 0, "utf8"));
const plata = (n) => "$ " + Math.round(Number(n || 0)).toLocaleString("es-AR");

async function fotosDeLaWeb(webId) {
  const r = await fetch(`${SITIO}/api/vehicles/${webId}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`la web respondió ${r.status} para el auto ${webId}`);
  const v = await r.json();
  const rutas = [v.coverImage, ...(v.images || [])].filter(Boolean);
  const fotos = [];
  for (const ruta of rutas) {
    const f = await fetch(ruta.startsWith("http") ? ruta : SITIO + ruta, { signal: AbortSignal.timeout(30000) });
    if (!f.ok) { console.log(`   ⚠ no se pudo bajar ${ruta} (${f.status})`); continue; }
    const tipo = (f.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!tipo.startsWith("image/")) continue;
    fotos.push({ tipo, datos: Buffer.from(await f.arrayBuffer()) });
  }
  return fotos;
}

async function main() {
  const sucursales = await sql`SELECT id, nombre FROM sucursales`;
  const sucursal = (n) => sucursales.find((s) => s.nombre === n)?.id ?? null;
  const ya = new Set((await sql`SELECT detalle FROM auditoria
                                WHERE entidad = 'vehiculo' AND accion = 'importado'`).map((r) => r.detalle));

  let nuevas = 0, publicadas = 0, totalFotos = 0;
  for (const u of datos.unidades) {
    const nombre = [u.marca, u.modelo, u.version, u.anio].filter(Boolean).join(" ");
    if (ya.has(u.clave)) { console.log(`= ${nombre} (ya estaba)`); continue; }

    const fotos = u.web_id ? await fotosDeLaWeb(u.web_id) : [];
    const publicado = fotos.length > 0;
    console.log(`${confirmar ? "+" : "·"} ${nombre}${u.dominio ? " " + u.dominio : ""} · ` +
      `${u.precio_venta ? plata(u.precio_venta) : "sin precio"} · ` +
      `${fotos.length ? fotos.length + " fotos, en la web" : "sin fotos, no se publica"}`);
    nuevas++; totalFotos += fotos.length; if (publicado) publicadas++;
    if (!confirmar) continue;

    await sql.begin(async (tx) => {
      const fila = {
        dominio: u.dominio, marca: u.marca, modelo: u.modelo, version: u.version, anio: u.anio,
        km: u.km, color: u.color, combustible: u.combustible, transmision: u.transmision,
        condicion: u.condicion, tipo_adquisicion: u.tipo_adquisicion || "compra_directa",
        fecha_ingreso: u.fecha_ingreso, sucursal_id: sucursal(u.sucursal),
        valor_compra: u.valor_compra || 0, precio_venta: u.precio_venta || 0, estado: u.estado || "disponible",
        observaciones: u.observaciones, publicado, destacado: !!u.destacado, carroceria: u.carroceria,
        motor: u.motor, puertas: u.puertas, traccion: u.traccion, equipamiento: u.equipamiento,
        descripcion_web: u.descripcion_web, moneda_venta: u.moneda_venta || "ARS",
        precio_oferta: u.precio_oferta, mostrar_precio: !!u.mostrar_precio,
        acepta_permuta: u.acepta_permuta !== false, acepta_financiacion: u.acepta_financiacion !== false,
      };
      const [v] = await tx`INSERT INTO vehiculos ${tx(fila)} RETURNING id`;
      await tx`INSERT INTO vehiculo_ficha (vehiculo_id) VALUES (${v.id}) ON CONFLICT (vehiculo_id) DO NOTHING`;
      if (Number(u.gastos) > 0) {
        await tx`INSERT INTO vehiculo_costos (vehiculo_id, tipo, detalle, fecha, monto, origen)
                 VALUES (${v.id}, 'Otro', 'Gastos de preparación (del Excel)', ${u.fecha_ingreso}, ${u.gastos}, 'manual')`;
      }
      for (let i = 0; i < fotos.length; i++) {
        await tx`INSERT INTO vehiculo_fotos (vehiculo_id, posicion, tipo, datos)
                 VALUES (${v.id}, ${i}, ${fotos[i].tipo}, ${fotos[i].datos})`;
      }
      await tx`INSERT INTO auditoria (entidad, entidad_id, accion, detalle)
               VALUES ('vehiculo', ${v.id}, 'importado', ${u.clave})`;
    });
  }

  console.log(`\n${nuevas} unidades ${confirmar ? "cargadas" : "para cargar"}: ` +
    `${publicadas} con fotos (van a la web), ${nuevas - publicadas} sin fotos. ${totalFotos} fotos en total.`);

  // -------------------------------------------- saldos de arranque de la caja
  for (const [nombre, saldo] of Object.entries(datos.cuentas || {})) {
    const [c] = await sql`SELECT id, saldo_inicial FROM caja_cuentas WHERE nombre = ${nombre}`;
    if (!c) { console.log(`⚠ No existe la cuenta "${nombre}". No se tocó.`); continue; }
    console.log(`${confirmar ? "✓" : "·"} ${nombre}: saldo inicial ${plata(c.saldo_inicial)} → ${plata(saldo)}`);
    if (confirmar) await sql`UPDATE caja_cuentas SET saldo_inicial = ${saldo} WHERE id = ${c.id}`;
  }

  if (!confirmar) console.log("\nNo se cargó nada. Para cargar, agregá --confirmar.");
}

main()
  .catch((e) => { console.error("\nError:", e.message); process.exitCode = 1; })
  .finally(() => sql.end());
