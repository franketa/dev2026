/**
 * Borra los datos de ejemplo que carga setup-db.mjs (autos, clientes, leads,
 * ventas, caja, inversores y proveedores inventados) para arrancar en limpio.
 *
 *   node scripts/limpiar-demo.mjs              → solo muestra qué hay, no borra nada
 *   node scripts/limpiar-demo.mjs --confirmar  → borra
 *
 * Quedan: usuarios, empresa, sucursales, cuentas de caja (con sus saldos
 * iniciales), catálogo de marcas, cotizaciones y el historial de usuarios.
 *
 * Si encuentra algo que no es de los datos de ejemplo —un auto, un cliente o
 * una venta que alguien cargó de verdad— no borra nada y lo muestra. Para
 * borrar igual hay que agregar --incluso-reales.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}
const confirmar = process.argv.includes("--confirmar");
const inclusoReales = process.argv.includes("--incluso-reales");
const sql = postgres(url, { max: 1, onnotice: () => {} });

// Lo que carga setup-db.mjs, tal cual.
const DEMO = {
  dominios: ["AA123CD", "AD456EF", "AB789GH", "AC321JK", "AA654LM", "AE987NP",
             "AB246QR", "AC135ST", "AD802UV", "AA579WX"],
  clientes: ["Marina Álvarez", "Carlos Suárez", "Daniel Britos", "Luis Gómez",
             "Ana Fernández", "Rubén Peralta", "Silvina Ledesma", "Marcela Villalba"],
  leads: ["Marcela Villalba", "Daniel Britos", "Ana Fernández", "Silvina Ledesma",
          "Luis Gómez", "Rubén Peralta"],
  proveedores: ["Chapista Aldo", "Lubricentro Centro", "Gomería del Sur",
                "Registro Automotor Chivilcoy", "Detailing Premium"],
  caja: ["Seña venta Honda HR-V", "Saldo venta Honda HR-V", "Alquiler del local",
         "Reparación caja VW Suran a tercero", "Sueldo Felipe", "Pauta en redes",
         "IIBB del mes", "Chapa y pintura a tercero", "Seña Peugeot 208",
         "Retiro de Mercado Pago a caja"],
  cobranzas: ["Saldo Peugeot 208 AE987NP", "Service de flota — 3 unidades",
              "Anticipo pactado en dólares"],
  deudas: ["Inmobiliaria Pons", "ARBA", "Chapista Aldo"],
  inversores: ["Fondo Chivilcoy"],
};

// Todo lo operativo: se vacía entero y la numeración vuelve a 1 (así la
// primera venta real es la #1 y no la #3).
const TABLAS = [
  "venta_pagos", "financiaciones", "postventa", "cobranzas", "caja_movimientos", "caja_cierres",
  "ventas", "lead_interacciones", "leads", "orden_items", "ordenes_taller",
  "vehiculo_costos", "vehiculo_documentos", "vehiculo_ficha", "vehiculo_fotos", "vehiculos",
  "clientes", "deudas", "inversor_movimientos", "presupuestos",
];

async function main() {
  console.log("\nQué hay hoy en la base:");
  let total = 0;
  for (const t of TABLAS) {
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM ${sql(t)}`;
    total += n;
    if (n) console.log(`  ${t.padEnd(22)} ${n}`);
  }
  if (!total) {
    console.log("  nada: la base ya está limpia.");
    return;
  }

  // ------------------------------------------- lo que NO es de ejemplo
  const reales = {
    autos: await sql`SELECT id, marca, modelo, dominio FROM vehiculos
                     WHERE NOT (COALESCE(dominio, '') = ANY(${DEMO.dominios})
                                OR (dominio IS NULL AND marca = 'Fiat' AND modelo = 'Cronos' AND anio = 2026))`,
    clientes: await sql`SELECT id, nombre, apellido FROM clientes
                        WHERE NOT (trim(nombre || ' ' || COALESCE(apellido, '')) = ANY(${DEMO.clientes}))`,
    leads: await sql`SELECT id, nombre FROM leads WHERE NOT (nombre = ANY(${DEMO.leads}))`,
    ventas: await sql`SELECT v.id FROM ventas v LEFT JOIN vehiculos x ON x.id = v.vehiculo_id
                      WHERE NOT (COALESCE(x.dominio, '') = ANY(${DEMO.dominios}) OR x.dominio IS NULL)`,
    caja: await sql`SELECT id, descripcion FROM caja_movimientos
                    WHERE NOT (COALESCE(descripcion, '') = ANY(${DEMO.caja}))`,
    cobranzas: await sql`SELECT id, concepto FROM cobranzas WHERE NOT (concepto = ANY(${DEMO.cobranzas}))`,
    deudas: await sql`SELECT id, acreedor FROM deudas WHERE NOT (acreedor = ANY(${DEMO.deudas}))`,
    proveedores: await sql`SELECT id, nombre FROM proveedores WHERE NOT (nombre = ANY(${DEMO.proveedores}))`,
  };
  const etiqueta = (r) => r.descripcion || r.concepto || r.acreedor ||
    [r.marca, r.modelo, r.dominio, r.nombre, r.apellido].filter(Boolean).join(" ") || "";
  let hayReales = false;
  for (const [k, filas] of Object.entries(reales)) {
    if (!filas.length) continue;
    if (k === "proveedores") continue; // los proveedores reales se conservan siempre
    hayReales = true;
    console.log(`\n⚠  ${k}: ${filas.length} que no son de ejemplo`);
    for (const f of filas.slice(0, 15)) console.log(`   #${f.id} ${etiqueta(f)}`);
    if (filas.length > 15) console.log(`   …y ${filas.length - 15} más`);
  }
  if (reales.proveedores.length) {
    console.log(`\nProveedores cargados por ustedes (se conservan): ${reales.proveedores.map((p) => p.nombre).join(", ")}`);
  }

  if (!confirmar) {
    console.log(hayReales
      ? "\nHay datos que parecen reales (arriba). No se borró nada."
      : "\nTodo es de ejemplo. Para borrarlo:  node scripts/limpiar-demo.mjs --confirmar");
    return;
  }
  if (hayReales && !inclusoReales) {
    console.log("\nNo se borró nada: hay datos que parecen reales (arriba).");
    console.log("Si igual hay que borrarlos:  node scripts/limpiar-demo.mjs --confirmar --incluso-reales");
    return;
  }

  // ------------------------------------------------------------ borrar
  await sql.begin(async (tx) => {
    await tx`TRUNCATE ${tx(TABLAS)} RESTART IDENTITY CASCADE`;
    await tx`DELETE FROM proveedores WHERE nombre = ANY(${DEMO.proveedores})`;
    await tx`DELETE FROM inversores WHERE nombre = ANY(${DEMO.inversores})`;
    // El historial de lo borrado apuntaría a números que se van a reusar.
    await tx`DELETE FROM auditoria
             WHERE entidad IN ('vehiculo','venta','lead','orden_taller','cliente','cobranza','deuda')`;
  });
  console.log("\n✓ Datos de ejemplo borrados. Usuarios, cuentas de caja, sucursales y configuración quedan como estaban.");
}

main()
  .catch((e) => { console.error("\nError:", e.message); process.exitCode = 1; })
  .finally(() => sql.end());
