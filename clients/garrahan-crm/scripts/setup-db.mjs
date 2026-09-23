/**
 * Crea el esquema y carga los datos de arranque de Garrahan.
 *
 *   DATABASE_URL=postgres://... ADMIN_PASSWORD=... node scripts/setup-db.mjs
 *
 * Es idempotente: se puede correr varias veces sin duplicar nada.
 * La contraseña inicial NO está en el código: viene por variable de entorno.
 */
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const aqui = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const hoy = new Date();
const diasAtras = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

async function main() {
  // ------------------------------------------------------------- esquema
  console.log("→ Creando el esquema…");
  await sql.unsafe(readFileSync(join(aqui, "..", "db", "schema.sql"), "utf8"));

  // ------------------------------------------------------------- empresa
  await sql`INSERT INTO empresa (id, razon_social, cuit, domicilio, localidad, provincia)
            VALUES (1, 'Garrahan Automotores', '', 'Av. Villarino', 'Chivilcoy', 'Buenos Aires')
            ON CONFLICT (id) DO NOTHING`;

  // ----------------------------------------------------------- sucursales
  const predios = ["Salón Principal", "Playa Norte", "Playa Sur", "Taller"];
  for (const p of predios) {
    await sql`INSERT INTO sucursales (nombre) SELECT ${p}
              WHERE NOT EXISTS (SELECT 1 FROM sucursales WHERE nombre = ${p})`;
  }
  const sucursales = await sql`SELECT id, nombre FROM sucursales ORDER BY id`;
  const suc = (n) => sucursales.find((s) => s.nombre === n)?.id ?? null;

  // -------------------------------------------------------------- usuarios
  const pass = process.env.ADMIN_PASSWORD;
  const yaHay = await sql`SELECT count(*)::int AS n FROM usuarios`;
  if (yaHay[0].n === 0) {
    if (!pass) {
      console.log("\n⚠  No hay usuarios y no se pasó ADMIN_PASSWORD.");
      console.log("   Volvé a correr con:  ADMIN_PASSWORD='tu-clave' node scripts/setup-db.mjs\n");
    } else {
      const h = await bcrypt.hash(pass, 10);
      await sql`INSERT INTO usuarios (nombre, email, password_hash, rol, sucursal_id, meta_unidades, comision_pct)
                VALUES ('Lolo', 'lolo@garrahanautomotores.com.ar', ${h}, 'dueno', ${suc("Salón Principal")}, 0, 0)`;
      await sql`INSERT INTO usuarios (nombre, email, password_hash, rol, sucursal_id, meta_unidades, comision_pct)
                VALUES ('Felipe', 'felipe@garrahanautomotores.com.ar', ${h}, 'vendedor', ${suc("Salón Principal")}, 4, 1.5)`;
      console.log("→ Usuarios creados: lolo@ y felipe@garrahanautomotores.com.ar");
      console.log("   Ambos con la contraseña que pasaste. Cambiala al entrar.");
    }
  }
  const usuarios = await sql`SELECT id, nombre, rol FROM usuarios ORDER BY id`;
  const lolo = usuarios.find((u) => u.rol === "dueno")?.id ?? null;
  const feli = usuarios.find((u) => u.rol === "vendedor")?.id ?? null;

  // ------------------------------------------------------------ inversores
  for (const [n, t] of [["Capital propio", "propio"], ["Fondo Chivilcoy", "externo"]]) {
    await sql`INSERT INTO inversores (nombre, tipo) SELECT ${n}, ${t}
              WHERE NOT EXISTS (SELECT 1 FROM inversores WHERE nombre = ${n})`;
  }
  const inversores = await sql`SELECT id, nombre FROM inversores`;
  const inv = (n) => inversores.find((i) => i.nombre === n)?.id ?? null;

  // ------------------------------------------------------ cuentas de caja
  const cuentas = [
    ["Efectivo", "efectivo", "ARS", 1], ["Cuenta Lolo", "banco", "ARS", 2],
    ["Cuenta Feli", "banco", "ARS", 3], ["Mercado Pago", "billetera", "ARS", 4],
    ["Efectivo USD", "efectivo", "USD", 5],
  ];
  for (const [n, t, m, p] of cuentas) {
    await sql`INSERT INTO caja_cuentas (nombre, tipo, moneda, posicion) SELECT ${n}, ${t}, ${m}, ${p}
              WHERE NOT EXISTS (SELECT 1 FROM caja_cuentas WHERE nombre = ${n})`;
  }
  const ctas = await sql`SELECT id, nombre FROM caja_cuentas`;
  const cta = (n) => ctas.find((c) => c.nombre === n)?.id ?? null;

  // ----------------------------------------------------------- proveedores
  const provs = [
    ["Chapista Aldo", "Chapa y pintura"], ["Lubricentro Centro", "Mecánica"],
    ["Gomería del Sur", "Neumáticos"], ["Registro Automotor Chivilcoy", "Gestoría"],
    ["Detailing Premium", "Detailing"],
  ];
  for (const [n, r] of provs) {
    await sql`INSERT INTO proveedores (nombre, rubro) SELECT ${n}, ${r}
              WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE nombre = ${n})`;
  }
  const proveedores = await sql`SELECT id, nombre FROM proveedores`;
  const pro = (n) => proveedores.find((p) => p.nombre === n)?.id ?? null;

  // -------------------------------------------------------------- catálogo
  const catalogo = {
    Volkswagen: ["Gol Trend", "Amarok", "Suran", "Polo"],
    Fiat: ["Cronos", "Toro", "Palio"], Chevrolet: ["Onix", "Tracker", "S10"],
    Toyota: ["Etios", "Hilux", "Corolla"], Ford: ["Ka", "Ranger", "EcoSport"],
    Renault: ["Sandero Stepway", "Kangoo", "Duster"], Peugeot: ["208", "2008", "Partner"],
    Honda: ["HR-V", "Civic"], Jeep: ["Renegade", "Compass"], Citroën: ["C3", "C4 Cactus"],
  };
  for (const [marca, modelos] of Object.entries(catalogo)) {
    await sql`INSERT INTO catalogo_marcas (nombre) VALUES (${marca}) ON CONFLICT (nombre) DO NOTHING`;
    const [m] = await sql`SELECT id FROM catalogo_marcas WHERE nombre = ${marca}`;
    for (const mod of modelos) {
      await sql`INSERT INTO catalogo_modelos (marca_id, nombre) VALUES (${m.id}, ${mod})
                ON CONFLICT (marca_id, nombre) DO NOTHING`;
    }
  }

  // ------------------------------------------------------------ cotización
  await sql`INSERT INTO cotizaciones (fecha, valor) VALUES (current_date, 1628)
            ON CONFLICT (fecha) DO NOTHING`;

  // ------------------------------------------------------------- vehículos
  const yaAutos = await sql`SELECT count(*)::int AS n FROM vehiculos`;
  if (yaAutos[0].n === 0) {
    console.log("→ Cargando stock de arranque…");
    const autos = [
      // dominio, marca, modelo, version, año, km, color, comb, transm, condicion, adq, dias, sucursal, compra, venta, estado, inversor
      ["AA123CD","Volkswagen","Gol Trend","Trendline 1.6",2016,98000,"Blanco","Nafta","Manual","usado","compra_directa",133,"Playa Norte",17500000,21900000,"disponible","Capital propio"],
      ["AD456EF","Fiat","Cronos","Drive 1.3 GSE",2020,52000,"Gris","Nafta","Manual","usado","permuta",81,"Salón Principal",24000000,29500000,"disponible","Capital propio"],
      ["AB789GH","Chevrolet","Onix","LT 1.4",2018,71000,"Rojo","Nafta","Manual","usado","compra_directa",20,"Taller",20000000,24900000,"en_taller","Capital propio"],
      ["AC321JK","Toyota","Etios","XLS 1.5",2019,64000,"Plata","Nafta","Manual","usado","consignacion",39,"Playa Sur",21500000,26500000,"disponible","Fondo Chivilcoy"],
      ["AA654LM","Ford","Ka","SE 1.5",2017,85000,"Azul","Nafta","Manual","usado","compra_directa",186,"Playa Norte",16800000,20900000,"disponible","Capital propio"],
      ["AE987NP","Peugeot","208","Allure 1.6 Tiptronic",2021,38000,"Negro","Nafta","Automática","usado","permuta",25,"Salón Principal",28500000,34900000,"reservado","Capital propio"],
      ["AB246QR","Renault","Sandero Stepway","Privilege 1.6",2018,77000,"Blanco","Nafta","Manual","usado","compra_directa",105,"Playa Sur",19500000,24500000,"disponible","Capital propio"],
      ["AC135ST","Volkswagen","Amarok","Highline 2.0 TDI 4x4",2019,112000,"Gris Oscuro","Diésel","Automática","usado","compra_directa",158,"Salón Principal",45000000,54900000,"disponible","Fondo Chivilcoy"],
      ["AD802UV","Toyota","Hilux","SRV 2.8 TDI 4x4",2020,96000,"Blanco","Diésel","Automática","usado","consignacion",59,"Playa Norte",52000000,63900000,"disponible","Fondo Chivilcoy"],
      [null,"Fiat","Cronos","Drive 1.3 GSE MT",2026,0,"Blanco","Nafta","Manual","0km","compra_directa",7,"Salón Principal",31000000,35900000,"disponible","Capital propio"],
      ["AA579WX","Honda","HR-V","EXL 1.8 CVT",2017,89000,"Marrón","Nafta","Automática","usado","compra_directa",223,"Salón Principal",26000000,31000000,"vendido","Capital propio"],
    ];
    for (const a of autos) {
      const [dom, ma, mo, ve, an, km, co, cb, tr, cond, adq, dias, sc, compra, venta, est, invn] = a;
      await sql`
        INSERT INTO vehiculos (dominio, marca, modelo, version, anio, km, color, combustible,
          transmision, condicion, tipo_adquisicion, fecha_ingreso, sucursal_id, inversor_id,
          valor_compra, precio_venta, precio_minimo, estado, nro_motor, nro_chasis)
        VALUES (${dom}, ${ma}, ${mo}, ${ve}, ${an}, ${km}, ${co}, ${cb}, ${tr}, ${cond}, ${adq},
                ${diasAtras(dias)}, ${suc(sc)}, ${inv(invn)}, ${compra}, ${venta},
                ${Math.round(venta * 0.94)}, ${est},
                ${dom ? "MOT" + Math.random().toString(36).slice(2, 10).toUpperCase() : null},
                ${dom ? "CHS" + Math.random().toString(36).slice(2, 12).toUpperCase() : null})`;
    }

    const autosDb = await sql`SELECT id, dominio FROM vehiculos`;
    const vid = (d) => autosDb.find((v) => v.dominio === d)?.id ?? null;

    // costos por unidad — la puerta de entrada natural
    const costos = [
      ["AA579WX","Chapa y pintura","Retoque paragolpes delantero","Chapista Aldo",850000],
      ["AA579WX","Mecánica","Service completo más correa","Lubricentro Centro",420000],
      ["AA579WX","Gestoría","Transferencia a nombre del comprador","Registro Automotor Chivilcoy",380000],
      ["AA654LM","Gestoría","Informe de dominio y libre deuda","Registro Automotor Chivilcoy",310000],
      ["AC135ST","Mecánica","Service 4x4 y cubiertas","Gomería del Sur",1150000],
      ["AB246QR","Chapa y pintura","Puerta trasera izquierda","Chapista Aldo",640000],
      ["AB789GH","Detailing","Pulido general y óptica","Detailing Premium",720000],
      ["AE987NP","Mecánica","Service previo a entrega","Lubricentro Centro",290000],
      ["AD802UV","Mecánica","Service 50.000 km y cubiertas","Gomería del Sur",1200000],
    ];
    for (const [d, tipo, det, prov, monto] of costos) {
      await sql`INSERT INTO vehiculo_costos (vehiculo_id, tipo, detalle, proveedor_id, fecha, monto, origen)
                VALUES (${vid(d)}, ${tipo}, ${det}, ${pro(prov)}, ${diasAtras(30)}, ${monto}, 'manual')`;
    }

    // ficha técnica de un par
    for (const d of ["AA123CD", "AC135ST", "AA654LM"]) {
      await sql`INSERT INTO vehiculo_ficha (vehiculo_id, titulo, cedula, vtv, form_08, informe_dominio,
                  deuda_patentes, prenda)
                VALUES (${vid(d)}, true, true, ${d !== "AA654LM"}, ${d === "AE987NP"}, true,
                        ${d === "AA654LM" ? 180000 : 0}, false)
                ON CONFLICT (vehiculo_id) DO NOTHING`;
    }

    // orden de taller en curso, con checklist
    const CHECK = ["Revisión mecánica general","Cambio de aceite y filtros","Frenos y neumáticos",
      "Chapa y pintura","Tapizado e interior","Detailing / pulido","Documentación y VTV","Control final"];
    const [orden] = await sql`
      INSERT INTO ordenes_taller (vehiculo_id, estado, fecha_ingreso, creada_por, notas)
      VALUES (${vid("AB789GH")}, 'en_taller', ${diasAtras(6)}, ${lolo},
              'Entró para preparación antes de publicar.') RETURNING id`;
    for (let i = 0; i < CHECK.length; i++) {
      await sql`INSERT INTO orden_items (orden_id, tarea, hecho, costo, proveedor_id, posicion)
                VALUES (${orden.id}, ${CHECK[i]}, ${i < 3}, ${i === 5 ? 720000 : 0},
                        ${i === 5 ? pro("Detailing Premium") : null}, ${i})`;
    }

    // clientes
    const clientes = [
      ["Marina","Álvarez","27-33987654-1","2346-441208","marina.alvarez@gmail.com","Chivilcoy"],
      ["Carlos","Suárez","20-28456789-3","2346-415577",null,"Chivilcoy"],
      ["Daniel","Britos",null,"2346-402199","dbritos@hotmail.com","Chivilcoy"],
      ["Luis","Gómez",null,"2346-448830",null,"Chivilcoy"],
      ["Ana","Fernández",null,"2346-433021","ana.fernandez@yahoo.com.ar","Suipacha"],
      ["Rubén","Peralta",null,"2346-427764",null,"Chivilcoy"],
      ["Silvina","Ledesma",null,"2346-409912","sledesma@gmail.com","Chivilcoy"],
      ["Marcela","Villalba",null,"2346-418205",null,"Alberti"],
    ];
    for (const [n, ap, doc, tel, mail, loc] of clientes) {
      await sql`INSERT INTO clientes (nombre, apellido, dni_cuit, telefono, email, localidad)
                VALUES (${n}, ${ap}, ${doc}, ${tel}, ${mail}, ${loc})`;
    }
    const cl = await sql`SELECT id, apellido FROM clientes`;
    const cli = (a) => cl.find((c) => c.apellido === a)?.id ?? null;

    // leads
    const leads = [
      ["Marcela Villalba","2346-418205","telefono","negociacion","en_negociacion",feli,"AD802UV",64000000,"Reunión con el esposo",2],
      ["Daniel Britos","2346-402199","whatsapp","negociacion","visita_agendada",feli,"AC135ST",55000000,"Coordinar test drive",0],
      ["Ana Fernández","2346-433021","web","calificacion","calificado",feli,null,36000000,"Pasar cotización del 0km",0],
      ["Silvina Ledesma","2346-409912","whatsapp","captacion","contactado",feli,"AB789GH",25000000,"Avisar cuando salga del taller",3],
      ["Luis Gómez","2346-448830","referido","captacion","nuevo",feli,"AA123CD",22000000,"Primer llamado",-1],
      ["Rubén Peralta","2346-427764","facebook","cerrado","perdido",feli,"AC321JK",26000000,null,null],
    ];
    for (const [n, tel, org, et, es, as_, dom, pres, acc, dias] of leads) {
      await sql`INSERT INTO leads (nombre, telefono, origen, etapa, estado, asesor_id, vehiculo_id,
                  presupuesto, proxima_accion, fecha_proxima, sucursal_id)
                VALUES (${n}, ${tel}, ${org}, ${et}, ${es}, ${as_}, ${dom ? vid(dom) : null},
                        ${pres}, ${acc}, ${dias === null ? null : diasAtras(-dias)}, ${suc("Salón Principal")})`;
    }

    // venta cerrada del HR-V, con pagos combinados
    const [venta] = await sql`
      INSERT INTO ventas (vehiculo_id, cliente_id, vendedor_id, sucursal_id, fecha, estado,
        precio, descuento, sena, comision, facturado, estado_tramite, fecha_entrega, observaciones)
      VALUES (${vid("AA579WX")}, ${cli("Suárez")}, ${feli}, ${suc("Salón Principal")},
              ${diasAtras(48)}, 'completada', 31000000, 0, 2000000, 465000, 'si', 'entregado',
              ${diasAtras(33)}, 'Operación cerrada y entregada.') RETURNING id`;
    await sql`INSERT INTO venta_pagos (venta_id, medio, monto, fecha)
              VALUES (${venta.id}, 'mercadopago', 2000000, ${diasAtras(54)}),
                     (${venta.id}, 'transferencia', 29000000, ${diasAtras(48)})`;
    await sql`INSERT INTO postventa (venta_id, contacto_30, resultado_30, nps, referido, nombre_referido, estado_referido)
              VALUES (${venta.id}, ${diasAtras(18)}, 'Conforme', 9, true, 'Luis Gómez', 'tibio')`;

    // venta en proceso del 208, con permuta + financiación
    const [venta2] = await sql`
      INSERT INTO ventas (vehiculo_id, cliente_id, vendedor_id, sucursal_id, fecha, estado,
        precio, descuento, sena, comision, facturado, estado_tramite, observaciones)
      VALUES (${vid("AE987NP")}, ${cli("Álvarez")}, ${feli}, ${suc("Salón Principal")},
              ${diasAtras(2)}, 'en_proceso', 34900000, 400000, 1500000, 517500, 'pendiente',
              'cert_08', 'Señado. Crédito en trámite.') RETURNING id`;
    await sql`INSERT INTO venta_pagos (venta_id, medio, monto, fecha)
              VALUES (${venta2.id}, 'efectivo', 1500000, ${diasAtras(2)}),
                     (${venta2.id}, 'permuta', 13400000, ${diasAtras(2)}),
                     (${venta2.id}, 'financiacion', 20000000, ${diasAtras(2)})`;
    await sql`INSERT INTO financiaciones (venta_id, entidad, monto, cuotas, primera_cuota, estado)
              VALUES (${venta2.id}, 'Banco Nación', 20000000, 24, ${diasAtras(-28)}, 'en_tramite')`;
    await sql`INSERT INTO cobranzas (cliente_id, venta_id, concepto, vencimiento, monto, cobrado, estado)
              VALUES (${cli("Álvarez")}, ${venta2.id}, 'Saldo Peugeot 208 AE987NP',
                      ${diasAtras(-18)}, 33000000, 0, 'pendiente')`;

    // cobranza vencida del taller a terceros
    await sql`INSERT INTO cobranzas (concepto, vencimiento, monto, cobrado, estado, observaciones)
              VALUES ('Service de flota — 3 unidades', ${diasAtras(7)}, 850000, 300000, 'vencido',
                      'Transporte Chivilcoy SRL. Pagó la primera, reclamar el saldo.')`;

    // deudas
    await sql`INSERT INTO deudas (acreedor, concepto, tipo, monto, pagado, vencimiento, estado)
              VALUES ('Inmobiliaria Pons','Alquiler del local','gasto_fijo',2400000,0,${diasAtras(-12)},'pendiente'),
                     ('ARBA','Ingresos Brutos','impuesto',1100000,0,${diasAtras(-22)},'pendiente'),
                     ('Chapista Aldo','Trabajos del mes','proveedor',480000,0,${diasAtras(-4)},'pendiente')`;

    // movimientos de caja
    const movs = [
      [54,"ingreso","Mercado Pago","venta_usado","Seña venta Honda HR-V","Suárez Carlos",2000000,"AA579WX"],
      [48,"ingreso","Cuenta Lolo","venta_usado","Saldo venta Honda HR-V","Suárez Carlos",29000000,"AA579WX"],
      [40,"egreso","Cuenta Lolo","alquiler","Alquiler del local","Inmobiliaria Pons",2400000,null],
      [35,"ingreso","Efectivo","servicios_taller","Reparación caja VW Suran a tercero","Fernández Ana",950000,null],
      [28,"egreso","Cuenta Feli","sueldos","Sueldo Felipe","Felipe",4200000,null],
      [20,"egreso","Mercado Pago","publicidad","Pauta en redes","Meta Platforms",220000,null],
      [12,"egreso","Cuenta Feli","impuestos","IIBB del mes","ARBA",1100000,null],
      [5,"ingreso","Efectivo","servicios_taller","Chapa y pintura a tercero","Britos Daniel",540000,null],
      [2,"ingreso","Efectivo","venta_usado","Seña Peugeot 208","Álvarez Marina",1500000,"AE987NP"],
    ];
    for (const [d, tipo, cuenta, cat, desc, contra, monto, dom] of movs) {
      await sql`INSERT INTO caja_movimientos (fecha, tipo, cuenta_id, categoria, descripcion,
                  contraparte, monto, moneda, cotizacion, equivalente_ars, vehiculo_id, usuario_id)
                VALUES (${diasAtras(d)}, ${tipo}, ${cta(cuenta)}, ${cat}, ${desc}, ${contra},
                        ${monto}, 'ARS', 1, ${monto}, ${dom ? vid(dom) : null}, ${lolo})`;
    }
    // una transferencia interna, para que se vea que no ensucia el resultado
    await sql`INSERT INTO caja_movimientos (fecha, tipo, cuenta_id, cuenta_destino_id, descripcion,
                monto, moneda, cotizacion, equivalente_ars, usuario_id)
              VALUES (${diasAtras(9)}, 'transferencia', ${cta("Mercado Pago")}, ${cta("Efectivo")},
                      'Retiro de Mercado Pago a caja', 1800000, 'ARS', 1, 1800000, ${lolo})`;

    // presupuesto del mes
    const presu = [
      ["venta_usado","ingreso",40000000],["servicios_taller","ingreso",2000000],
      ["sueldos","gasto",4200000],["alquiler","gasto",2400000],
      ["publicidad","gasto",300000],["impuestos","gasto",1100000],
    ];
    for (const [c, t, m] of presu) {
      await sql`INSERT INTO presupuestos (categoria, tipo, anio, mes, monto)
                VALUES (${c}, ${t}, ${hoy.getFullYear()}, ${hoy.getMonth() + 1}, ${m})
                ON CONFLICT (categoria, anio, mes) DO NOTHING`;
    }

    // inversores: aportes
    await sql`INSERT INTO inversor_movimientos (inversor_id, tipo, monto, descripcion, fecha)
              VALUES (${inv("Fondo Chivilcoy")}, 'aporte', 118500000,
                      'Aporte para compra de Etios, Amarok e Hilux', ${diasAtras(160)})`;
    await sql`INSERT INTO inversor_movimientos (inversor_id, tipo, monto, descripcion, fecha, contraparte_id)
              VALUES (${inv("Fondo Chivilcoy")}, 'prestamo', 8500000,
                      'Préstamo para cerrar la compra de la Hilux', ${diasAtras(59)}, ${inv("Capital propio")})`;

    console.log("→ Stock, ventas, leads, caja e inversores cargados.");
  } else {
    console.log("→ Ya había datos. No toco nada.");
  }

  const resumen = await sql`
    SELECT (SELECT count(*) FROM vehiculos)::int AS vehiculos,
           (SELECT count(*) FROM leads)::int AS leads,
           (SELECT count(*) FROM ventas)::int AS ventas,
           (SELECT count(*) FROM caja_movimientos)::int AS movimientos,
           (SELECT count(*) FROM usuarios)::int AS usuarios`;
  console.log("\nListo:", resumen[0]);
  await sql.end();
}

main().catch(async (e) => {
  console.error("\nError:", e.message);
  await sql.end();
  process.exit(1);
});
