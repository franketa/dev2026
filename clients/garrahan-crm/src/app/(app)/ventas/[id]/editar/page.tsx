import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Trash2 } from "lucide-react";
import { avisoOk, avisoError, SIN_PERMISO } from "@/lib/aviso";
import { sql } from "@/lib/db";
import { requierePermiso } from "@/lib/auth";
import { plata, fecha } from "@/lib/format";
import { MEDIOS_PAGO, ESTADOS_LEAD } from "@/lib/constantes";
import { recalcularSaldo, sincronizarAuto } from "@/lib/ventas";
import { Encabezado, Panel, PanelTitulo, Boton, Campo, Tabla, TH, TD, FilaVacia, Chip } from "@/components/ui";

export const dynamic = "force-dynamic";

const iso = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/** El dueño corrige lo que se cargó mal. Todo queda en Auditoría. */
async function soloDueno() {
  const u = await requierePermiso("ventas");
  return u.rol === "dueno" ? u : null;
}

/**
 * Corregir una venta: sus datos, los cobros cargados de más y, si la venta
 * entera se cargó por error (por ejemplo, repetida), borrarla. Lo que se
 * quita de la venta sale también de la caja.
 */
export default async function CorregirVenta({ params }: { params: Promise<any> }) {
  const u = await requierePermiso("ventas");
  if (u.rol !== "dueno") {
    return <Panel><p className="text-[13px] text-[var(--c-tinta-media)] py-8 text-center">
      Solo el dueño puede corregir una venta.</p></Panel>;
  }
  const id = Number((await params).id) || 0;
  const [v] = await sql`SELECT vt.*, x.marca, x.modelo, x.anio FROM ventas vt
                        JOIN vehiculos x ON x.id = vt.vehiculo_id WHERE vt.id = ${id}`;
  if (!v) notFound();

  const [pagos, clientes, vendedores, sucursales] = await Promise.all([
    // La cuenta a la que entró cada cobro, con la misma regla que usa Quitar.
    sql`SELECT p.*, (SELECT c.nombre FROM caja_movimientos m JOIN caja_cuentas c ON c.id = m.cuenta_id
                     WHERE m.venta_pago_id = p.id
                        OR (m.venta_pago_id IS NULL AND m.venta_id = p.venta_id AND m.tipo = 'ingreso'
                            AND m.monto = p.monto AND m.moneda = p.moneda AND m.fecha = p.fecha)
                     ORDER BY (m.venta_pago_id IS NOT NULL) DESC, m.id LIMIT 1) AS cuenta
        FROM venta_pagos p WHERE p.venta_id = ${id} ORDER BY p.fecha, p.id`,
    sql`SELECT id, nombre, apellido, dni_cuit FROM clientes
        WHERE id IN (SELECT id FROM clientes ORDER BY nombre LIMIT 500) OR id = ${v.cliente_id ?? 0}
        ORDER BY nombre`,
    sql`SELECT id, nombre FROM usuarios
        WHERE (activo AND rol IN ('vendedor','gerente','dueno')) OR id = ${v.vendedor_id ?? 0} ORDER BY nombre`,
    sql`SELECT id, nombre FROM sucursales WHERE activa OR id = ${v.sucursal_id ?? 0} ORDER BY nombre`,
  ]);

  /* ------------------------------------------------------------- datos */
  async function guardar(fd: FormData) {
    "use server";
    const usr = await soloDueno();
    if (!usr) return avisoError(SIN_PERMISO);
    const num = (k: string) => {
      const x = String(fd.get(k) ?? "").trim();
      return x === "" ? null : Number(x);
    };
    const precio = num("precio") ?? 0;
    if (!(precio > 0)) return avisoError("Falta el precio.");
    const fechaVenta = String(fd.get("fecha") || "");
    if (!fechaVenta) return avisoError("Falta la fecha.");
    const facturado = String(fd.get("facturado") || "pendiente");

    const [antes] = await sql`SELECT * FROM ventas WHERE id = ${id}`;
    await sql.begin(async (tx) => {
      await tx`UPDATE ventas SET
                 fecha = ${fechaVenta}, cliente_id = ${num("cliente_id")}, vendedor_id = ${num("vendedor_id")},
                 sucursal_id = ${num("sucursal_id")}, precio = ${precio}, descuento = ${num("descuento") ?? 0},
                 comision = ${num("comision") ?? 0}, facturado = ${facturado},
                 observaciones = ${String(fd.get("observaciones") || "").trim() || null}
               WHERE id = ${id}`;
      await recalcularSaldo(id, tx);
      await tx`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
               VALUES (${usr.id}, 'venta', ${id}, 'corregir',
                       ${`Antes: ${iso(antes.fecha)} · precio ${plata(antes.precio)} · descuento ${plata(antes.descuento)} · ` +
                         `cliente #${antes.cliente_id ?? "—"} · vendedor #${antes.vendedor_id ?? "—"} · comisión ${plata(antes.comision)}`})`;
    });
    revalidatePath(`/ventas/${id}`);
    await avisoOk("Venta corregida");
    redirect(`/ventas/${id}`);
  }

  /* --------------------------------------------------------- un cobro */
  async function quitarPago(fd: FormData) {
    "use server";
    const usr = await soloDueno();
    if (!usr) return avisoError(SIN_PERMISO);
    const pagoId = Number(fd.get("pago") || 0);
    const [p] = await sql`SELECT * FROM venta_pagos WHERE id = ${pagoId} AND venta_id = ${id}`;
    if (!p) return avisoError("Ese cobro ya no está.");
    await sql.begin(async (tx) => {
      // El ingreso de caja de este cobro. Los cargados antes de que se
      // guardara el vínculo se reconocen por venta, monto, moneda y fecha.
      const [mov] = await tx`
        SELECT id FROM caja_movimientos
        WHERE venta_pago_id = ${p.id}
           OR (venta_pago_id IS NULL AND venta_id = ${id} AND tipo = 'ingreso'
               AND monto = ${p.monto} AND moneda = ${p.moneda} AND fecha = ${p.fecha})
        ORDER BY (venta_pago_id IS NOT NULL) DESC, id LIMIT 1`;
      if (mov) await tx`DELETE FROM caja_movimientos WHERE id = ${mov.id}`;
      await tx`DELETE FROM venta_pagos WHERE id = ${p.id}`;
      if (p.es_sena) {
        await tx`UPDATE ventas SET sena = GREATEST(0, sena - ${Number(p.monto) * Number(p.cotizacion || 1)})
                 WHERE id = ${id}`;
      }
      await recalcularSaldo(id, tx);
      await tx`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
               VALUES (${usr.id}, 'venta', ${id}, 'quitar_cobro',
                       ${`${MEDIOS_PAGO[p.medio] || p.medio} ${plata(p.monto, p.moneda)} del ${fecha(p.fecha)}` +
                         (mov ? " · salió de la caja" : " · no estaba en caja")})`;
    });
    revalidatePath(`/ventas/${id}`);
    revalidatePath("/caja");
    await avisoOk("Cobro quitado de la venta y de la caja");
  }

  /* ------------------------------------------------------ la venta entera */
  async function borrar() {
    "use server";
    const usr = await soloDueno();
    if (!usr) return avisoError(SIN_PERMISO);
    const [vt] = await sql`SELECT * FROM ventas WHERE id = ${id}`;
    if (!vt) return avisoError("Esa venta ya no está.");
    let estadoAuto = "";
    await sql.begin(async (tx) => {
      const [caja] = await tx`SELECT COALESCE(SUM(equivalente_ars), 0) AS total, count(*)::int AS n
                              FROM caja_movimientos WHERE venta_id = ${id}`;
      await tx`DELETE FROM caja_movimientos WHERE venta_id = ${id}`;
      await tx`DELETE FROM cobranzas WHERE venta_id = ${id}`;
      // Pagos, financiación y postventa se van con la venta (ON DELETE CASCADE).
      await tx`DELETE FROM ventas WHERE id = ${id}`;
      estadoAuto = await sincronizarAuto(vt.vehiculo_id, tx);

      if (vt.lead_id) {
        const [otra] = await tx`SELECT 1 FROM ventas WHERE lead_id = ${vt.lead_id} AND estado <> 'cancelada'`;
        if (!otra) {
          await tx`UPDATE leads SET estado = 'en_negociacion', etapa = ${ESTADOS_LEAD.en_negociacion?.etapa || "negociacion"},
                                    actualizado_en = now() WHERE id = ${vt.lead_id}`;
        }
        await tx`INSERT INTO lead_interacciones (lead_id, tipo, detalle, usuario_id)
                 VALUES (${vt.lead_id}, 'nota', ${"Se borró la venta #" + id + ", cargada por error"}, ${usr.id})`;
      }
      await tx`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
               VALUES (${usr.id}, 'venta', ${id}, 'borrar',
                       ${`${iso(vt.fecha)} · ${vt.estado} · precio ${plata(vt.precio)} · ` +
                         `${caja.n} movimientos de caja por ${plata(caja.total)} borrados`})`;
    });
    revalidatePath("/ventas");
    revalidatePath("/caja");
    await avisoOk(`Venta #${id} borrada. ` + (estadoAuto === "disponible" ? "La unidad volvió al stock y a la web."
      : estadoAuto === "vendido" ? "La unidad sigue vendida por la otra venta." : "La unidad sigue señada por la otra venta."));
    redirect("/ventas");
  }

  return (
    <>
      <Encabezado volver={`/ventas/${id}`} titulo={`Corregir venta #${id}`}
        detalle={`${v.marca} ${v.modelo} ${v.anio || ""}. Lo que cambies queda en Auditoría con cómo estaba antes.`} />

      <div className="space-y-4 max-w-5xl">
        <Panel>
          <PanelTitulo titulo="Datos de la venta"
            detalle="Si cambia el precio o el descuento, el saldo a cobrar se recalcula solo." />
          <form action={guardar} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Campo label="Fecha">
              <input name="fecha" type="date" required className="campo" defaultValue={iso(v.fecha)} />
            </Campo>
            <Campo label="Cliente" ancho="lg:col-span-2">
              <select name="cliente_id" className="campo" defaultValue={v.cliente_id ?? ""}>
                <option value="">Sin cliente</option>
                {clientes.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.apellido || ""} {c.dni_cuit ? "· " + c.dni_cuit : ""}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Vendedor">
              <select name="vendedor_id" className="campo" defaultValue={v.vendedor_id ?? ""}>
                <option value="">Sin asignar</option>
                {vendedores.map((x: any) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Precio">
              <input name="precio" type="number" step="0.01" min="0" required className="campo"
                defaultValue={Number(v.precio)} />
            </Campo>
            <Campo label="Descuento">
              <input name="descuento" type="number" step="0.01" min="0" className="campo"
                defaultValue={Number(v.descuento)} />
            </Campo>
            <Campo label="Comisión del vendedor">
              <input name="comision" type="number" step="0.01" min="0" className="campo"
                defaultValue={Number(v.comision)} />
            </Campo>
            <Campo label="Facturado">
              <select name="facturado" className="campo" defaultValue={v.facturado || "pendiente"}>
                <option value="pendiente">Pendiente</option>
                <option value="si">Sí</option>
                <option value="no">No</option>
                <option value="exento">Exento</option>
              </select>
            </Campo>
            <Campo label="Sucursal">
              <select name="sucursal_id" className="campo" defaultValue={v.sucursal_id ?? ""}>
                <option value="">—</option>
                {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Observaciones" ancho="sm:col-span-2 lg:col-span-3">
              <input name="observaciones" className="campo" defaultValue={v.observaciones ?? ""} />
            </Campo>
            <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
              <Boton tipo="submit">Guardar cambios</Boton>
              <Boton href={`/ventas/${id}`} variante="fantasma">Cancelar</Boton>
            </div>
          </form>
          <p className="mt-4 pt-3 border-t border-[var(--c-borde)] text-[11.5px] text-[var(--c-tinta-tenue)]">
            El estado de la operación (reserva, completada, cancelada) y el trámite se cambian desde la venta.
          </p>
        </Panel>

        <Panel padding={false}>
          <div className="p-5 pb-0">
            <PanelTitulo titulo="Cobros"
              detalle="Quitá el que se cargó de más: sale de la venta y de la caja, y el saldo se recalcula." />
          </div>
          <Tabla className="border-0 rounded-none bg-transparent">
            <thead>
              <tr><TH>Medio</TH><TH>Fecha</TH><TH>Entró a</TH><TH alinear="right">Monto</TH><TH /></tr>
            </thead>
            <tbody>
              {pagos.length === 0 && <FilaVacia cols={5} mensaje="Esta venta no tiene cobros." />}
              {pagos.map((p: any) => (
                <tr key={p.id}>
                  <TD className="font-medium">
                    {MEDIOS_PAGO[p.medio] || p.medio}
                    {p.es_sena && <span className="ml-2"><Chip tono="azul">Seña</Chip></span>}
                  </TD>
                  <TD className="text-[var(--c-tinta-media)]">{fecha(p.fecha)}</TD>
                  <TD className="text-[var(--c-tinta-media)]">{p.cuenta || "No entró a caja"}</TD>
                  <TD alinear="right">{plata(p.monto, p.moneda)}</TD>
                  <TD alinear="right">
                    <form action={quitarPago} className="inline-flex items-center gap-2">
                      <input type="hidden" name="pago" value={p.id} />
                      <label className="flex items-center gap-1.5 text-[12px] text-[var(--c-tinta-media)]">
                        <input type="checkbox" required /> Seguro
                      </label>
                      <Boton tipo="submit" variante="peligro" className="py-1 px-2.5 text-[12px]">Quitar</Boton>
                    </form>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </Panel>

        <Panel className="border-[var(--c-rojo-borde)]">
          <PanelTitulo titulo="Borrar la venta"
            detalle="Para una venta cargada por error, por ejemplo repetida. Se borran también sus cobros en la caja y su saldo a cobrar, y la unidad vuelve a como estaba antes." />
          {v.permuta_vehiculo_id && (
            <p className="mb-3 text-[12.5px] text-[var(--c-amarillo-alto,var(--c-tinta-clara))]">
              El usado que entró en permuta queda en el stock. Si en realidad no entró, dalo de baja desde su ficha.
            </p>
          )}
          <form action={borrar} className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-[var(--c-tinta-media)]">
              <input type="checkbox" required /> Sí, borrar la venta #{id}
            </label>
            <Boton tipo="submit" variante="peligro"><Trash2 size={15} /> Borrar la venta</Boton>
          </form>
        </Panel>
      </div>
    </>
  );
}
