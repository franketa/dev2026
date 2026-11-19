import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { FileText, Plus, Pencil, HandCoins } from "lucide-react";
import { avisoOk, avisoError } from "@/lib/aviso";
import { sql } from "@/lib/db";
import { requierePermiso, veCostos } from "@/lib/auth";
import { plata, plataCorta, fecha, porcentaje, dominio as fdom } from "@/lib/format";
import { ESTADOS_VENTA, ESTADOS_TRAMITE, MEDIOS_PAGO } from "@/lib/constantes";
import {
  Encabezado, KPI, GrillaKPI, Panel, PanelTitulo, Chip, Tabla, TH, TD,
  FilaVacia, Boton, Dato, Campo, Monto, Progreso,
} from "@/components/ui";
import SelectEstado from "@/components/select-estado";
import { registrarPago, cambiarEstadoVenta, extenderSena as extenderSenaVenta } from "@/lib/ventas-operar";
import { clientesParaVenta, guardarCliente } from "@/lib/clientes";
import CamposCliente from "@/components/campos-cliente";

export const dynamic = "force-dynamic";



export default async function Venta({ params }: { params: Promise<any> }) {
  const u = await requierePermiso("ventas");
  const verCostos = veCostos(u);
  const { id } = await params;

  const [v] = await sql`
    SELECT vt.*, x.marca, x.modelo, x.anio, x.dominio, x.costo_total, x.km,
           c.nombre AS cliente, c.apellido AS cliente_apellido, c.dni_cuit, c.telefono,
           c.direccion AS cliente_direccion, c.localidad AS cliente_localidad,
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

  const [pagos, cobranzas, financiaciones, cuentas, postventa, clientes] = await Promise.all([
    sql`SELECT * FROM venta_pagos WHERE venta_id = ${id} ORDER BY fecha, id`,
    sql`SELECT * FROM cobranzas WHERE venta_id = ${id} ORDER BY vencimiento`,
    sql`SELECT * FROM financiaciones WHERE venta_id = ${id} ORDER BY id`,
    sql`SELECT id, nombre, moneda FROM caja_cuentas WHERE activa ORDER BY nombre`,
    sql`SELECT * FROM postventa WHERE venta_id = ${id}`,
    clientesParaVenta(sql),
  ]);

  const total = Number(v.precio) - Number(v.descuento);
  const cobrado = pagos.reduce((a: number, p: any) =>
    a + Number(p.monto) * (p.moneda === "USD" ? Number(p.cotizacion || 1) : 1), 0);
  const saldo = total - cobrado;
  const margen = total - Number(v.costo_total || 0);
  const e = ESTADOS_VENTA[v.estado] || { label: v.estado, tono: "gris" as const };
  const hoyIso = new Date().toISOString().slice(0, 10);
  const senaVencida = !!v.sena_vence && new Date(v.sena_vence).toISOString().slice(0, 10) < hoyIso;

  /* ------------------------------------------------------------ acciones */
  async function agregarPago(fd: FormData) {
    "use server";
    const usr = await requierePermiso("ventas");
    const r = await registrarPago(usr, Number(id), fd);
    if ("error" in r) return avisoError(r.error);
    revalidatePath(`/ventas/${id}`);
    await avisoOk(r.esSena ? "Seña registrada" : "Cobro registrado");
    // Lo que sigue a cobrar es darle el recibo al cliente: se abre directo.
    redirect(`/documentos/recibo/${r.pagoId}`);
  }

  /** Completar o corregir el comprador: lo que falte (DNI, domicilio) sale después en el boleto. */
  async function guardarComprador(fd: FormData) {
    "use server";
    const usr = await requierePermiso("ventas");
    const clienteId = await guardarCliente(sql, fd);
    if (!clienteId) return avisoError("Completá al menos el nombre del comprador.");
    await sql`UPDATE ventas SET cliente_id = ${clienteId} WHERE id = ${id}`;
    await sql`UPDATE cobranzas SET cliente_id = ${clienteId} WHERE venta_id = ${id}`;
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'venta', ${id}, 'comprador',
                      ${`cliente #${v.cliente_id ?? "—"} → #${clienteId}`})`;
    revalidatePath(`/ventas/${id}`);
    await avisoOk("Datos del comprador guardados");
  }

  async function extenderSena(fd: FormData) {
    "use server";
    const usr = await requierePermiso("ventas");
    const nueva = String(fd.get("sena_vence") || "");
    const r = await extenderSenaVenta(usr, Number(id), nueva);
    if ("error" in r) return avisoError(r.error);
    revalidatePath(`/ventas/${id}`);
    await avisoOk(`La seña ahora vence el ${nueva.split("-").reverse().join("/")}`);
  }

  async function cambiarEstado(fd: FormData) {
    "use server";
    const usr = await requierePermiso("ventas");
    const r = await cambiarEstadoVenta(usr, Number(id), String(fd.get("estado") || ""));
    if ("error" in r) return avisoError(r.error);
    revalidatePath(`/ventas/${id}`);
    await avisoOk(r.mensaje);
  }

  async function cambiarTramite(fd: FormData) {
    "use server";
    await requierePermiso("ventas");
    const nuevo = String(fd.get("estado") || "");
    if (!ESTADOS_TRAMITE[nuevo]) return avisoError("Ese estado de trámite no existe.");
    await sql`UPDATE ventas SET estado_tramite = ${nuevo},
                fecha_entrega = ${nuevo === "entregado" ? new Date().toISOString().slice(0, 10) : null}
              WHERE id = ${id}`;
    revalidatePath(`/ventas/${id}`);
    await avisoOk(`Trámite: ${ESTADOS_TRAMITE[nuevo]}`);
  }

  const pasosTramite = Object.keys(ESTADOS_TRAMITE);
  const iTramite = pasosTramite.indexOf(v.estado_tramite || "iniciado");

  return (
    <>
      <Encabezado volver="/ventas"
        titulo={<span className="flex items-center gap-3 flex-wrap">
          Venta #{v.id}<Chip tono={e.tono}>{e.label}</Chip>
          {v.estado === "reserva" && v.sena_vence && (
            <Chip tono={senaVencida ? "rojo" : "amarillo"}>
              {senaVencida ? "Seña vencida el " : "Seña vence el "}{fecha(v.sena_vence)}
            </Chip>
          )}
        </span>}
        detalle={`${v.marca} ${v.modelo} ${v.anio || ""} · ${fecha(v.fecha)}`}
        acciones={
          <>
            <Boton href={`/documentos/boleto/${v.id}`} variante="suave" target="_blank">
              <FileText size={15} /> Boleto de compraventa
            </Boton>
            {v.estado !== "cancelada" && (
              <Boton href="#cobrar" variante="suave"><HandCoins size={15} /> Registrar un cobro</Boton>
            )}
            <Boton href={`/vehiculos/${v.vehiculo_id}`} variante="suave">Ver la unidad</Boton>
            {u.rol === "dueno" && (
              <Boton href={`/ventas/${v.id}/editar`} variante="suave"><Pencil size={15} /> Corregir</Boton>
            )}
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
                detalle="Cada renglón es plata que entró. De cada uno se imprime su recibo." />
            </div>
            <Tabla className="border-0 rounded-none bg-transparent">
              <thead>
                <tr>
                  <TH>Medio</TH><TH>Fecha</TH><TH>Referencia</TH>
                  <TH alinear="right">Monto</TH><TH alinear="right">En pesos</TH><TH alinear="right">Comprobante</TH>
                </tr>
              </thead>
              <tbody>
                {pagos.length === 0 && <FilaVacia cols={6} mensaje="Todavía no se registró ningún cobro." />}
                {pagos.map((p: any) => (
                  <tr key={p.id} className="hover:bg-[var(--c-hover)]">
                    <TD className="font-medium">
                      {MEDIOS_PAGO[p.medio] || p.medio}
                      {p.es_sena && <span className="ml-2"><Chip tono="azul">Seña</Chip></span>}
                    </TD>
                    <TD className="text-[var(--c-tinta-media)]">{fecha(p.fecha)}</TD>
                    <TD className="text-[var(--c-tinta-tenue)]">{p.referencia || "—"}</TD>
                    <TD alinear="right">{plata(p.monto, p.moneda)}</TD>
                    <TD alinear="right" className="text-[var(--c-tinta-media)]">
                      {plata(Number(p.monto) * (p.moneda === "USD" ? Number(p.cotizacion || 1) : 1))}
                    </TD>
                    <TD alinear="right">
                      {/* Botón y no link de texto: estaba, pero al final de la
                          fila y en letra chica nadie lo encontraba. */}
                      <a href={`/documentos/recibo/${p.id}`} target="_blank" rel="noopener noreferrer"
                        title="Imprimir el recibo de este cobro"
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--c-azul-borde)]
                          bg-[var(--c-azul-fondo)] px-2 py-1 text-[11.5px] text-[var(--c-enlace)]
                          hover:bg-[var(--c-azul-fondo-alto)] transition-colors whitespace-nowrap">
                        <FileText size={12} /> Recibo
                      </a>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </Panel>

          {/* ------------------------------------------------------ nuevo pago */}
          {v.estado !== "cancelada" && (
            <Panel className="scroll-mt-20" id="cobrar">
              <PanelTitulo titulo="Registrar un cobro"
                detalle="Se descuenta del saldo, entra a la cuenta que elijas y te abre el recibo para imprimir." />
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
              {v.estado === "reserva" && (
                <form action={extenderSena}>
                  <span className="etiqueta block mb-1.5">La seña vence el</span>
                  <div className="flex gap-2">
                    <input name="sena_vence" type="date" className="campo py-1.5"
                      defaultValue={v.sena_vence ? new Date(v.sena_vence).toISOString().slice(0, 10) : ""} />
                    <Boton tipo="submit" variante="suave">Guardar</Boton>
                  </div>
                  {Number(v.sena) > 0 && (
                    <p className="mt-1.5 text-[11.5px] text-[var(--c-tinta-tenue)]">Seña recibida: {plata(v.sena)}</p>
                  )}
                </form>
              )}
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
            <Dato label="Domicilio">
              {[v.cliente_direccion, v.cliente_localidad].filter(Boolean).join(", ") || "—"}
            </Dato>
            <Dato label="Teléfono">{v.telefono || "—"}</Dato>
            <Dato label="Vendedor">{v.vendedor || "Sin asignar"}</Dato>
            <Dato label="Sucursal">{v.sucursal || "—"}</Dato>
            <details className="mt-3" open={!v.cliente_id || !v.dni_cuit || !v.cliente_direccion}>
              <summary className="cursor-pointer text-[12.5px] text-[var(--c-enlace)] hover:underline">
                {!v.cliente_id ? "Cargar el comprador"
                  : !v.dni_cuit || !v.cliente_direccion ? "Faltan datos para el boleto: completalos"
                  : "Corregir datos del comprador"}
              </summary>
              <form action={guardarComprador} className="mt-3 space-y-3">
                <CamposCliente clientes={clientes as any} inicial={v.cliente_id ?? null} compacto />
                <Boton tipo="submit" variante="suave">Guardar comprador</Boton>
              </form>
            </details>
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
