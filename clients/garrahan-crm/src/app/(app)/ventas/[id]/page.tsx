import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { FileText, Plus } from "lucide-react";
import { sql } from "@/lib/db";
import { requiereSesion, veCostos } from "@/lib/auth";
import { plata, plataCorta, fecha, porcentaje, dominio as fdom } from "@/lib/format";
import { ESTADOS_VENTA, ESTADOS_TRAMITE, MEDIOS_PAGO } from "@/lib/constantes";
import {
  Encabezado, KPI, GrillaKPI, Panel, PanelTitulo, Chip, Tabla, TH, TD,
  FilaVacia, Boton, Dato, Campo, Monto, Progreso,
} from "@/components/ui";
import SelectEstado from "@/components/select-estado";

export const dynamic = "force-dynamic";

const MEDIOS_A_CAJA = ["efectivo", "transferencia", "tarjeta", "mercadopago", "cheque"];

export default async function Venta({ params }: { params: Promise<any> }) {
  const u = await requiereSesion();
  const verCostos = veCostos(u);
  const { id } = await params;

  const [v] = await sql`
    SELECT vt.*, x.marca, x.modelo, x.anio, x.dominio, x.costo_total, x.km,
           c.nombre AS cliente, c.apellido AS cliente_apellido, c.dni_cuit, c.telefono,
           us.nombre AS vendedor, s.nombre AS sucursal, i.nombre AS inversor,
           pv.marca AS permuta_marca, pv.modelo AS permuta_modelo
    FROM ventas vt
    JOIN v_vehiculos x ON x.id = vt.vehiculo_id
    LEFT JOIN clientes c ON c.id = vt.cliente_id
    LEFT JOIN usuarios us ON us.id = vt.vendedor_id
    LEFT JOIN sucursales s ON s.id = vt.sucursal_id
    LEFT JOIN inversores i ON i.id = vt.inversor_id
    LEFT JOIN vehiculos pv ON pv.id = vt.permuta_vehiculo_id
    WHERE vt.id = ${id}`;
  if (!v) notFound();

  const [pagos, cobranzas, financiaciones, cuentas, postventa] = await Promise.all([
    sql`SELECT * FROM venta_pagos WHERE venta_id = ${id} ORDER BY fecha, id`,
    sql`SELECT * FROM cobranzas WHERE venta_id = ${id} ORDER BY vencimiento`,
    sql`SELECT * FROM financiaciones WHERE venta_id = ${id} ORDER BY id`,
    sql`SELECT id, nombre, moneda FROM caja_cuentas WHERE activa ORDER BY nombre`,
    sql`SELECT * FROM postventa WHERE venta_id = ${id}`,
  ]);

  const total = Number(v.precio) - Number(v.descuento);
  const cobrado = pagos.reduce((a: number, p: any) =>
    a + Number(p.monto) * (p.moneda === "USD" ? Number(p.cotizacion || 1) : 1), 0);
  const saldo = total - cobrado;
  const margen = total - Number(v.costo_total || 0);
  const e = ESTADOS_VENTA[v.estado] || { label: v.estado, tono: "gris" as const };

  /* ------------------------------------------------------------ acciones */
  async function agregarPago(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    const monto = Number(fd.get("monto") || 0);
    if (!monto) return;
    const medio = String(fd.get("medio") || "efectivo");
    const moneda = String(fd.get("moneda") || "ARS") === "USD" ? "USD" : "ARS";
    const cot = moneda === "USD" ? Number(fd.get("cotizacion") || 1) : 1;
    const f = String(fd.get("fecha") || new Date().toISOString().slice(0, 10));

    await sql`INSERT INTO venta_pagos (venta_id, medio, monto, moneda, cotizacion, fecha, referencia)
              VALUES (${id}, ${medio}, ${monto}, ${moneda}, ${cot}, ${f},
                      ${String(fd.get("referencia") || "") || null})`;

    const cuenta = fd.get("cuenta_id") ? Number(fd.get("cuenta_id")) : null;
    if (cuenta && MEDIOS_A_CAJA.includes(medio)) {
      await sql`
        INSERT INTO caja_movimientos (cuenta_id, tipo, categoria, concepto, monto, moneda,
                                      cotizacion, equivalente_ars, fecha, vehiculo_id, usuario_id)
        VALUES (${cuenta}, 'ingreso', 'venta_usado', ${"Cobro venta #" + id}, ${monto},
                ${moneda}, ${cot}, ${monto * cot}, ${f}, ${v.vehiculo_id}, ${usr.id})`;
    }

    // El saldo abierto se va descontando solo: si se salda, la cobranza se cierra.
    const enPesos = monto * cot;
    const [ab] = await sql`SELECT id, monto, cobrado, moneda, cotizacion FROM cobranzas
                           WHERE venta_id = ${id} AND estado <> 'cobrado'
                           ORDER BY vencimiento LIMIT 1`;
    if (ab) {
      // La cobranza lleva su propia moneda: hay que imputar el cobro en esa
      // moneda, no en pesos, o un saldo en dólares se cancelaría con la cifra
      // equivocada apenas se mueva la cotización.
      const monedaDeuda = (ab.moneda || "ARS") as "ARS" | "USD";
      const imputado = monedaDeuda === "USD"
        ? (moneda === "USD" ? monto : enPesos / Number(ab.cotizacion || cot || 1))
        : enPesos;
      const nuevo = Number(ab.cobrado) + imputado;
      await sql`UPDATE cobranzas
                SET cobrado = ${nuevo},
                    estado = ${nuevo >= Number(ab.monto) ? "cobrado" : "pendiente"},
                    fecha_cobro = ${nuevo >= Number(ab.monto) ? f : null},
                    forma_cobro = ${MEDIOS_PAGO[medio] || medio}
                WHERE id = ${ab.id}`;
    }
    revalidatePath(`/ventas/${id}`);
  }

  async function cambiarEstado(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    const nuevo = String(fd.get("estado") || "");
    if (!ESTADOS_VENTA[nuevo]) return;
    await sql`UPDATE ventas SET estado = ${nuevo} WHERE id = ${id}`;

    // El estado del auto sigue al de la venta: cancelarla lo devuelve al stock.
    const estadoAuto = nuevo === "completada" ? "vendido"
      : nuevo === "cancelada" ? "disponible" : "reservado";
    await sql`UPDATE vehiculos SET estado = ${estadoAuto} WHERE id = ${v.vehiculo_id}`;

    // Cerrar la venta abre el seguimiento de postventa, una sola vez.
    if (nuevo === "completada") {
      await sql`INSERT INTO postventa (venta_id)
                SELECT ${id} WHERE NOT EXISTS (SELECT 1 FROM postventa WHERE venta_id = ${id})`;
    }
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'venta', ${id}, 'estado', ${nuevo})`;
    revalidatePath(`/ventas/${id}`);
  }

  async function cambiarTramite(fd: FormData) {
    "use server";
    await requiereSesion();
    const nuevo = String(fd.get("estado") || "");
    if (!ESTADOS_TRAMITE[nuevo]) return;
    await sql`UPDATE ventas SET estado_tramite = ${nuevo},
                fecha_entrega = ${nuevo === "entregado" ? new Date().toISOString().slice(0, 10) : null}
              WHERE id = ${id}`;
    revalidatePath(`/ventas/${id}`);
  }

  const pasosTramite = Object.keys(ESTADOS_TRAMITE);
  const iTramite = pasosTramite.indexOf(v.estado_tramite || "iniciado");

  return (
    <>
      <Encabezado volver="/ventas"
        titulo={<span className="flex items-center gap-3 flex-wrap">
          Venta #{v.id}<Chip tono={e.tono}>{e.label}</Chip>
        </span>}
        detalle={`${v.marca} ${v.modelo} ${v.anio || ""} · ${fecha(v.fecha)}`}
        acciones={
          <>
            <Boton href={`/documentos/boleto/${v.id}`} variante="suave" target="_blank">
              <FileText size={15} /> Boleto de compraventa
            </Boton>
            <Boton href={`/vehiculos/${v.vehiculo_id}`} variante="suave">Ver la unidad</Boton>
          </>
        } />

      <GrillaKPI>
        <KPI label="Total de la operación" valor={plataCorta(total)}
          detalle={Number(v.descuento) > 0 ? `${plata(v.precio)} − ${plata(v.descuento)} de descuento` : undefined} />
        <KPI label="Cobrado" valor={plataCorta(cobrado)} tono={saldo <= 0 ? "verde" : "amarillo"}
          detalle={`${pagos.length} ${pagos.length === 1 ? "pago" : "pagos"}`} />
        <KPI label="Saldo" valor={plataCorta(Math.max(0, saldo))}
          tono={saldo > 0 ? "rojo" : "verde"}
          detalle={saldo > 0 ? "queda por cobrar" : "operación saldada"} />
        {verCostos && (
          <KPI label="Margen de la unidad" valor={<Monto valor={margen} signo />}
            detalle={total > 0 ? porcentaje((margen / total) * 100) + " sobre la venta" : undefined} />
        )}
      </GrillaKPI>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        {/* -------------------------------------------------------- columna 1 */}
        <div className="lg:col-span-2 space-y-4">
          <Panel padding={false}>
            <div className="p-5 pb-0">
              <PanelTitulo titulo="Formas de pago"
                detalle="Cada renglón es plata que entró, con su medio y su fecha." />
            </div>
            <Tabla className="border-0 rounded-none bg-transparent">
              <thead>
                <tr>
                  <TH>Medio</TH><TH>Fecha</TH><TH>Referencia</TH>
                  <TH alinear="right">Monto</TH><TH alinear="right">En pesos</TH><TH></TH>
                </tr>
              </thead>
              <tbody>
                {pagos.length === 0 && <FilaVacia cols={6} mensaje="Todavía no se registró ningún cobro." />}
                {pagos.map((p: any) => (
                  <tr key={p.id} className="hover:bg-[var(--c-hover)]">
                    <TD className="font-medium">{MEDIOS_PAGO[p.medio] || p.medio}</TD>
                    <TD className="text-[var(--c-tinta-media)]">{fecha(p.fecha)}</TD>
                    <TD className="text-[var(--c-tinta-tenue)]">{p.referencia || "—"}</TD>
                    <TD alinear="right">{plata(p.monto, p.moneda)}</TD>
                    <TD alinear="right" className="text-[var(--c-tinta-media)]">
                      {plata(Number(p.monto) * (p.moneda === "USD" ? Number(p.cotizacion || 1) : 1))}
                    </TD>
                    <TD alinear="right">
                      <a href={`/documentos/recibo/${p.id}`} target="_blank" rel="noopener noreferrer"
                        className="text-[12.5px] text-[var(--c-enlace)] hover:underline whitespace-nowrap">
                        Recibo
                      </a>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </Panel>

          {/* ------------------------------------------------------ nuevo pago */}
          {v.estado !== "cancelada" && (
            <Panel>
              <PanelTitulo titulo="Registrar un cobro"
                detalle="Se descuenta del saldo y entra a la cuenta que elijas." />
              <form action={agregarPago} className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
                <Campo label="Medio">
                  <select name="medio" className="campo" defaultValue="efectivo">
                    {Object.entries(MEDIOS_PAGO).map(([k, l]) => (
                      <option key={k} value={k}>{l}</option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Monto">
                  <input name="monto" type="number" step="0.01" min="0" required className="campo" />
                </Campo>
                <Campo label="Moneda">
                  <select name="moneda" className="campo" defaultValue="ARS">
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </select>
                </Campo>
                <Campo label="Cotización">
                  <input name="cotizacion" type="number" step="0.01" min="0" defaultValue={1} className="campo" />
                </Campo>
                <Campo label="Fecha">
                  <input name="fecha" type="date" className="campo"
                    defaultValue={new Date().toISOString().slice(0, 10)} />
                </Campo>
                <Campo label="Cuenta">
                  <select name="cuenta_id" className="campo" defaultValue={cuentas[0]?.id ?? ""}>
                    <option value="">Sin caja</option>
                    {cuentas.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </Campo>
                <Campo label="Referencia" ancho="sm:col-span-2 lg:col-span-4">
                  <input name="referencia" className="campo" placeholder="N° de comprobante, cheque, etc." />
                </Campo>
                <div className="sm:col-span-1 lg:col-span-2">
                  <Boton tipo="submit" className="w-full"><Plus size={15} /> Agregar cobro</Boton>
                </div>
              </form>
            </Panel>
          )}

          {/* ------------------------------------------------------- cobranzas */}
          {cobranzas.length > 0 && (
            <Panel padding={false}>
              <div className="p-5 pb-0">
                <PanelTitulo titulo="Saldo a cobrar"
                  accion={<Link href="/cobranzas" className="text-[12.5px] text-[var(--c-enlace)] hover:underline">Ver cobranzas →</Link>} />
              </div>
              <Tabla className="border-0 rounded-none bg-transparent">
                <thead>
                  <tr>
                    <TH>Concepto</TH><TH>Vence</TH><TH alinear="right">Monto</TH>
                    <TH alinear="right">Cobrado</TH><TH>Estado</TH>
                  </tr>
                </thead>
                <tbody>
                  {cobranzas.map((c: any) => (
                    <tr key={c.id}>
                      <TD>{c.concepto}</TD>
                      <TD className="text-[var(--c-tinta-media)]">{fecha(c.vencimiento)}</TD>
                      <TD alinear="right">{plata(c.monto)}</TD>
                      <TD alinear="right" className="text-[var(--c-verde)]">{plata(c.cobrado)}</TD>
                      <TD><Chip tono={c.estado === "cobrado" ? "verde" : c.estado === "vencido" ? "rojo" : "amarillo"}>
                        {c.estado}</Chip></TD>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            </Panel>
          )}

          {financiaciones.length > 0 && (
            <Panel>
              <PanelTitulo titulo="Financiación" />
              {financiaciones.map((f: any) => (
                <div key={f.id}>
                  <Dato label="Entidad">{f.entidad}</Dato>
                  <Dato label="Monto">{plata(f.monto)}</Dato>
                  <Dato label="Cuotas">{f.cuotas}{f.tasa ? ` · ${porcentaje(f.tasa)}` : ""}</Dato>
                  <Dato label="Primera cuota">{fecha(f.primera_cuota)}</Dato>
                  <Dato label="Estado"><Chip tono={f.estado === "acreditada" ? "verde" : "amarillo"}>{f.estado}</Chip></Dato>
                </div>
              ))}
            </Panel>
          )}
        </div>

        {/* -------------------------------------------------------- columna 2 */}
        <div className="space-y-4">
          <Panel>
            <PanelTitulo titulo="Estado" />
            <div className="space-y-4">
              <div>
                <span className="etiqueta block mb-1.5">Operación</span>
                <SelectEstado id={Number(id)} valor={v.estado} accion={cambiarEstado}
                  opciones={Object.entries(ESTADOS_VENTA).map(([k, x]) => ({ valor: k, label: x.label }))} />
              </div>
              <div>
                <span className="etiqueta block mb-1.5">Trámite de transferencia</span>
                <SelectEstado id={Number(id)} valor={v.estado_tramite || "iniciado"} accion={cambiarTramite}
                  opciones={Object.entries(ESTADOS_TRAMITE).map(([k, l]) => ({ valor: k, label: l }))} />
                <div className="mt-3">
                  <Progreso hechos={iTramite + 1} total={pasosTramite.length}
                    etiqueta={ESTADOS_TRAMITE[v.estado_tramite || "iniciado"]} />
                </div>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelTitulo titulo="Comprador" />
            <Dato label="Nombre">{v.cliente ? `${v.cliente} ${v.cliente_apellido || ""}` : "—"}</Dato>
            <Dato label="DNI / CUIT">{v.dni_cuit || "—"}</Dato>
            <Dato label="Teléfono">{v.telefono || "—"}</Dato>
            <Dato label="Vendedor">{v.vendedor || "Sin asignar"}</Dato>
            <Dato label="Sucursal">{v.sucursal || "—"}</Dato>
          </Panel>

          <Panel>
            <PanelTitulo titulo="La unidad" />
            <Dato label="Vehículo">
              <Link href={`/vehiculos/${v.vehiculo_id}`} className="text-[var(--c-enlace)] hover:underline">
                {v.marca} {v.modelo} {v.anio || ""}
              </Link>
            </Dato>
            <Dato label="Dominio">{fdom(v.dominio)}</Dato>
            {verCostos && <Dato label="Costo total">{plata(v.costo_total)}</Dato>}
            {v.inversor && <Dato label="Inversor">{v.inversor}</Dato>}
            {v.permuta_vehiculo_id && (
              <Dato label="Entró en permuta">
                <Link href={`/vehiculos/${v.permuta_vehiculo_id}`} className="text-[var(--c-enlace)] hover:underline">
                  {v.permuta_marca} {v.permuta_modelo} · {plata(v.permuta_valor)}
                </Link>
              </Dato>
            )}
          </Panel>

          <Panel>
            <PanelTitulo titulo="Administración" />
            <Dato label="Facturado">{v.facturado}</Dato>
            <Dato label="Seña">{plata(v.sena)}</Dato>
            <Dato label="Comisión">{plata(v.comision)}</Dato>
            <Dato label="Entrega">{fecha(v.fecha_entrega)}</Dato>
            {postventa.length > 0 && (
              <Dato label="Postventa">
                <Link href="/postventa" className="text-[var(--c-enlace)] hover:underline">Seguimiento abierto</Link>
              </Dato>
            )}
          </Panel>

          {v.observaciones && (
            <Panel>
              <PanelTitulo titulo="Observaciones" />
              <p className="text-[13px] text-[var(--c-tinta-clara)] leading-relaxed whitespace-pre-line">{v.observaciones}</p>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
