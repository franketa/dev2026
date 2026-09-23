import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requiereSesion, veCostos } from "@/lib/auth";
import { plata } from "@/lib/format";
import { ESTADOS_VENTA, ESTADOS_TRAMITE } from "@/lib/constantes";
import { Encabezado, Panel, PanelTitulo, Boton, Campo } from "@/components/ui";
import PagosVenta from "@/components/pagos-venta";

export const dynamic = "force-dynamic";

/** Estos medios son plata que entra a una cuenta. Permuta y financiación no. */
const MEDIOS_A_CAJA = ["efectivo", "transferencia", "tarjeta", "mercadopago", "cheque"];

export default async function NuevaVenta({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requiereSesion();
  const p = await searchParams;

  const [vehiculos, clientes, vendedores, sucursales, cuentas, lead] = await Promise.all([
    sql`SELECT id, marca, modelo, anio, dominio, precio_venta, precio_minimo, inversor_id, sucursal_id
        FROM vehiculos WHERE estado IN ('disponible','reservado') OR id = ${p.vehiculo || 0}
        ORDER BY marca, modelo`,
    sql`SELECT id, nombre, apellido, dni_cuit FROM clientes ORDER BY nombre LIMIT 500`,
    sql`SELECT id, nombre, comision_pct FROM usuarios
        WHERE activo AND rol IN ('vendedor','gerente','dueno') ORDER BY nombre`,
    sql`SELECT id, nombre FROM sucursales WHERE activa ORDER BY nombre`,
    sql`SELECT id, nombre, moneda FROM caja_cuentas WHERE activa ORDER BY nombre`,
    p.lead
      ? sql`SELECT id, nombre, telefono, email, cliente_id, vehiculo_id FROM leads WHERE id = ${p.lead}`
      : Promise.resolve([]),
  ]);

  const elegido = p.vehiculo
    ? vehiculos.find((v: any) => String(v.id) === String(p.vehiculo))
    : null;
  const l = lead[0] || null;

  async function crear(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    const txt = (k: string) => {
      const v = String(fd.get(k) ?? "").trim();
      return v === "" ? null : v;
    };
    const num = (k: string) => {
      const v = fd.get(k);
      return v === null || String(v).trim() === "" ? null : Number(v);
    };

    const vehiculoId = num("vehiculo_id");
    const precio = num("precio") ?? 0;
    if (!vehiculoId || !precio) return;

    const descuento = num("descuento") ?? 0;
    const total = precio - descuento;
    const fechaVenta = txt("fecha") ?? new Date().toISOString().slice(0, 10);
    const estado = String(fd.get("estado") || "reserva");

    // Cliente: o se elige uno existente, o se crea al vuelo con lo que se tipeó.
    let clienteId = num("cliente_id");
    const nuevoCliente = txt("cliente_nuevo");
    if (!clienteId && nuevoCliente) {
      const [c] = await sql`
        INSERT INTO clientes (nombre, dni_cuit, telefono, email)
        VALUES (${nuevoCliente}, ${txt("cliente_dni")}, ${txt("cliente_telefono")}, ${txt("cliente_email")})
        RETURNING id`;
      clienteId = c.id;
    }

    const [veh] = await sql`SELECT inversor_id, sucursal_id, marca, modelo FROM vehiculos WHERE id = ${vehiculoId}`;

    const [venta] = await sql`
      INSERT INTO ventas (vehiculo_id, cliente_id, vendedor_id, inversor_id, sucursal_id, lead_id,
                          fecha, estado, precio, descuento, sena, comision,
                          facturado, estado_tramite, observaciones)
      VALUES (${vehiculoId}, ${clienteId}, ${num("vendedor_id")}, ${veh?.inversor_id ?? null},
              ${num("sucursal_id") ?? veh?.sucursal_id ?? null}, ${num("lead_id")},
              ${fechaVenta}, ${estado}, ${precio}, ${descuento}, ${num("sena") ?? 0},
              ${num("comision") ?? 0},
              ${String(fd.get("facturado") || "pendiente")},
              ${String(fd.get("estado_tramite") || "iniciado")}, ${txt("observaciones")})
      RETURNING id`;

    /* ------------------------------------------------------------- pagos
       Los renglones llegan como arrays paralelos: getAll conserva el orden
       del formulario, así que el índice alcanza para reconstruir cada uno. */
    const medios = fd.getAll("pago_medio").map(String);
    const montos = fd.getAll("pago_monto").map((x) => Number(x || 0));
    const monedas = fd.getAll("pago_moneda").map(String);
    const cotiz = fd.getAll("pago_cotizacion").map((x) => Number(x || 1));
    const refs = fd.getAll("pago_referencia").map(String);
    const cuentaId = num("cuenta_id");

    let cobrado = 0;
    for (let i = 0; i < medios.length; i++) {
      const monto = montos[i];
      if (!monto) continue;
      const moneda = monedas[i] === "USD" ? "USD" : "ARS";
      const cot = moneda === "USD" ? (cotiz[i] || 1) : 1;
      const enPesos = monto * cot;
      cobrado += enPesos;

      await sql`
        INSERT INTO venta_pagos (venta_id, medio, monto, moneda, cotizacion, fecha, referencia)
        VALUES (${venta.id}, ${medios[i]}, ${monto}, ${moneda}, ${cot}, ${fechaVenta},
                ${refs[i] || null})`;

      // La plata que entra de verdad impacta en la caja. La permuta y la
      // financiación no son plata en mano, así que no tocan ninguna cuenta.
      if (cuentaId && MEDIOS_A_CAJA.includes(medios[i])) {
        await sql`
          INSERT INTO caja_movimientos (cuenta_id, tipo, categoria, concepto, monto, moneda,
                                        cotizacion, equivalente_ars, fecha, vehiculo_id, usuario_id)
          VALUES (${cuentaId}, 'ingreso', 'venta_usado',
                  ${"Venta " + (veh?.marca || "") + " " + (veh?.modelo || "")},
                  ${monto}, ${moneda}, ${cot}, ${enPesos}, ${fechaVenta}, ${vehiculoId}, ${usr.id})`;
      }
    }

    /* ------------------------------------------------- permuta que entra */
    const permutaMarca = txt("permuta_marca");
    const permutaValor = num("permuta_valor") ?? 0;
    if (permutaMarca && permutaValor > 0) {
      const [nuevo] = await sql`
        INSERT INTO vehiculos (dominio, marca, modelo, anio, km, tipo_adquisicion,
                               fecha_ingreso, sucursal_id, valor_compra, precio_venta, estado,
                               observaciones)
        VALUES (${txt("permuta_dominio")?.toUpperCase() ?? null}, ${permutaMarca},
                ${txt("permuta_modelo") ?? "—"}, ${num("permuta_anio")}, ${num("permuta_km") ?? 0},
                'permuta', ${fechaVenta}, ${num("sucursal_id") ?? veh?.sucursal_id ?? null},
                ${permutaValor}, 0, 'en_revision',
                ${"Recibido en permuta por la venta #" + venta.id})
        RETURNING id`;
      await sql`INSERT INTO vehiculo_ficha (vehiculo_id) VALUES (${nuevo.id})
                ON CONFLICT (vehiculo_id) DO NOTHING`;
      await sql`UPDATE ventas SET permuta_vehiculo_id = ${nuevo.id}, permuta_valor = ${permutaValor}
                WHERE id = ${venta.id}`;
    }

    /* ------------------------------------------------------ financiación */
    const entidad = txt("fin_entidad");
    const finMonto = num("fin_monto") ?? 0;
    if (entidad && finMonto > 0) {
      await sql`
        INSERT INTO financiaciones (venta_id, entidad, monto, cuotas, tasa, primera_cuota, estado)
        VALUES (${venta.id}, ${entidad}, ${finMonto}, ${num("fin_cuotas") ?? 1},
                ${num("fin_tasa")}, ${txt("fin_primera")}, 'en_tramite')`;
    }

    /* ------------------------------------------------------- saldo a cobrar */
    const saldo = Math.round(total - cobrado);
    if (saldo > 0) {
      // El saldo puede quedar pactado en dólares. Se guarda en la moneda en
      // que se pactó, no convertido: es la cifra que el cliente tiene que pagar.
      const monedaSaldo = String(fd.get("moneda_saldo") || "ARS") === "USD" ? "USD" : "ARS";
      const cotSaldo = monedaSaldo === "USD" ? (num("cotizacion_saldo") || 1) : 1;
      const montoSaldo = monedaSaldo === "USD" ? Math.round(saldo / cotSaldo) : saldo;

      await sql`
        INSERT INTO cobranzas (venta_id, cliente_id, concepto, monto, moneda, cotizacion,
                               vencimiento, estado)
        VALUES (${venta.id}, ${clienteId}, ${"Saldo venta #" + venta.id},
                ${montoSaldo}, ${monedaSaldo}, ${cotSaldo},
                ${txt("vencimiento_saldo") ?? fechaVenta}, 'pendiente')`;
    }

    /* ---------------------------------------------------- estado del auto */
    await sql`UPDATE vehiculos SET estado = ${estado === "completada" ? "vendido" : "reservado"}
              WHERE id = ${vehiculoId}`;

    const leadId = num("lead_id");
    if (leadId) {
      await sql`UPDATE leads SET estado = ${estado === "completada" ? "vendido" : "reservado"},
                                 etapa = 'cierre', actualizado_en = now()
                WHERE id = ${leadId}`;
      await sql`INSERT INTO lead_interacciones (lead_id, tipo, detalle, usuario_id)
                VALUES (${leadId}, 'cambio_estado', ${"Se generó la venta #" + venta.id}, ${usr.id})`;
    }

    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'venta', ${venta.id}, 'alta', ${plataSimple(total)})`;

    redirect(`/ventas/${venta.id}`);
  }

  return (
    <>
      <Encabezado volver="/ventas" titulo="Nueva venta"
        detalle="Al guardar se marca la unidad, se registra el cobro en la caja y, si entra un usado, se da de alta en el stock." />

      <form action={crear} className="space-y-4 max-w-5xl">
        <input type="hidden" name="lead_id" value={l?.id ?? ""} />

        {/* ------------------------------------------------------- la unidad */}
        <Panel>
          <PanelTitulo titulo="Unidad y comprador" />
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="Unidad *">
              <select name="vehiculo_id" required className="campo" defaultValue={p.vehiculo || ""}>
                <option value="">Elegí la unidad</option>
                {vehiculos.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.marca} {v.modelo} {v.anio || ""} {v.dominio ? "· " + v.dominio : ""}
                    {v.precio_venta ? " — " + plata(v.precio_venta) : ""}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Fecha">
              <input name="fecha" type="date" className="campo"
                defaultValue={new Date().toISOString().slice(0, 10)} />
            </Campo>
            <Campo label="Cliente">
              <select name="cliente_id" className="campo" defaultValue={l?.cliente_id ?? ""}>
                <option value="">Cargar uno nuevo abajo</option>
                {clientes.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.apellido || ""} {c.dni_cuit ? "· " + c.dni_cuit : ""}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Vendedor">
              <select name="vendedor_id" className="campo" defaultValue={u.id}>
                <option value="">Sin asignar</option>
                {vendedores.map((v: any) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </Campo>
          </div>

          <div className="mt-4 pt-4 border-t border-[#1f2937]">
            <p className="text-[12px] text-[#64748b] mb-3">
              Si el comprador todavía no está cargado, completá estos campos y se crea solo.
            </p>
            <div className="grid sm:grid-cols-4 gap-4">
              <Campo label="Nombre y apellido">
                <input name="cliente_nuevo" className="campo" defaultValue={l?.nombre ?? ""} />
              </Campo>
              <Campo label="DNI / CUIT">
                <input name="cliente_dni" className="campo" />
              </Campo>
              <Campo label="Teléfono">
                <input name="cliente_telefono" className="campo" defaultValue={l?.telefono ?? ""} />
              </Campo>
              <Campo label="Email">
                <input name="cliente_email" type="email" className="campo" defaultValue={l?.email ?? ""} />
              </Campo>
            </div>
          </div>
        </Panel>

        {/* ---------------------------------------------------------- cobro */}
        <Panel>
          <PanelTitulo titulo="Precio y formas de pago"
            detalle={elegido?.precio_minimo
              ? `Mínimo autorizado para esta unidad: ${plata(elegido.precio_minimo)}`
              : "Se puede combinar efectivo, permuta y financiación"} />
          <PagosVenta precioSugerido={Number(elegido?.precio_venta || 0)} />

          <div className="grid sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-[#1f2937]">
            <Campo label="Cuenta de caja donde entra la plata">
              <select name="cuenta_id" className="campo" defaultValue={cuentas[0]?.id ?? ""}>
                <option value="">No registrar en caja</option>
                {cuentas.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>
                ))}
              </select>
            </Campo>
            <Campo label="Seña">
              <input name="sena" type="number" step="0.01" min="0" className="campo" defaultValue={0} />
            </Campo>
            <Campo label="Vencimiento del saldo">
              <input name="vencimiento_saldo" type="date" className="campo" />
            </Campo>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mt-4">
            <Campo label="¿En qué moneda queda el saldo?">
              <select name="moneda_saldo" className="campo" defaultValue="ARS">
                <option value="ARS">Pesos</option>
                <option value="USD">Dólares</option>
              </select>
            </Campo>
            <Campo label="Cotización del saldo (si es en USD)">
              <input name="cotizacion_saldo" type="number" step="0.01" min="0" className="campo" defaultValue={1} />
            </Campo>
            <p className="text-[11.5px] text-[#64748b] leading-relaxed self-end pb-2">
              Si el saldo se pactó en dólares se guarda en dólares, no convertido:
              es la cifra que el cliente tiene que pagar.
            </p>
          </div>
        </Panel>

        {/* -------------------------------------------------------- permuta */}
        <Panel>
          <PanelTitulo titulo="Usado que entra en permuta"
            detalle="Se da de alta como unidad nueva en el stock, en revisión, con el valor tomado como costo." />
          <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Campo label="Marca"><input name="permuta_marca" className="campo" /></Campo>
            <Campo label="Modelo"><input name="permuta_modelo" className="campo" /></Campo>
            <Campo label="Año"><input name="permuta_anio" type="number" min="1950" max="2035" className="campo" /></Campo>
            <Campo label="Dominio"><input name="permuta_dominio" className="campo uppercase" /></Campo>
            <Campo label="Km"><input name="permuta_km" type="number" min="0" className="campo" /></Campo>
            <Campo label="Valor tomado">
              <input name="permuta_valor" type="number" step="0.01" min="0" className="campo" />
            </Campo>
          </div>
        </Panel>

        {/* --------------------------------------------------- financiación */}
        <Panel>
          <PanelTitulo titulo="Financiación" detalle="Si hay prenda o crédito de por medio" />
          <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <Campo label="Entidad">
              <input name="fin_entidad" className="campo" placeholder="Banco / financiera" />
            </Campo>
            <Campo label="Monto">
              <input name="fin_monto" type="number" step="0.01" min="0" className="campo" />
            </Campo>
            <Campo label="Cuotas">
              <input name="fin_cuotas" type="number" min="1" className="campo" />
            </Campo>
            <Campo label="Tasa %">
              <input name="fin_tasa" type="number" step="0.01" min="0" className="campo" />
            </Campo>
            <Campo label="Primera cuota">
              <input name="fin_primera" type="date" className="campo" />
            </Campo>
          </div>
        </Panel>

        {/* ---------------------------------------------------------- cierre */}
        <Panel>
          <PanelTitulo titulo="Estado de la operación" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Campo label="Estado">
              <select name="estado" className="campo" defaultValue="reserva">
                {Object.entries(ESTADOS_VENTA)
                  .filter(([v]) => v !== "cancelada")
                  .map(([v, e]) => <option key={v} value={v}>{e.label}</option>)}
              </select>
            </Campo>
            <Campo label="Trámite">
              <select name="estado_tramite" className="campo" defaultValue="iniciado">
                {Object.entries(ESTADOS_TRAMITE).map(([v, lb]) => (
                  <option key={v} value={v}>{lb}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Facturado">
              <select name="facturado" className="campo" defaultValue="pendiente">
                <option value="pendiente">Pendiente</option>
                <option value="si">Sí</option>
                <option value="no">No</option>
                <option value="exento">Exento</option>
              </select>
            </Campo>
            <Campo label="Comisión del vendedor">
              <input name="comision" type="number" step="0.01" min="0" className="campo" defaultValue={0} />
            </Campo>
            <Campo label="Sucursal">
              <select name="sucursal_id" className="campo" defaultValue={u.sucursal_id ?? ""}>
                <option value="">—</option>
                {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Observaciones" ancho="sm:col-span-2 lg:col-span-3">
              <input name="observaciones" className="campo" />
            </Campo>
          </div>
        </Panel>

        <div className="flex gap-2">
          <Boton tipo="submit">Registrar la venta</Boton>
          <Boton href="/ventas" variante="suave">Cancelar</Boton>
        </div>
      </form>
    </>
  );
}

function plataSimple(n: number) {
  return "$ " + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}
