import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Trash2 } from "lucide-react";
import { avisoOk, avisoError, SIN_PERMISO } from "@/lib/aviso";
import { sql } from "@/lib/db";
import { requierePermiso } from "@/lib/auth";
import { leerMovimiento } from "@/lib/caja";
import { plata, fecha } from "@/lib/format";
import { CATEGORIAS } from "@/lib/constantes";
import { Encabezado, Panel, PanelTitulo, Boton } from "@/components/ui";
import CamposMovimiento from "@/components/campos-movimiento";

export const dynamic = "force-dynamic";

/** Una línea con lo que tenía el movimiento, para Auditoría. */
const resumen = (m: any) =>
  `${fecha(m.fecha)} · ${m.tipo} · ${CATEGORIAS.find((c) => c.valor === m.categoria)?.label || "sin categoría"} · ${m.descripcion} · ${plata(m.monto, m.moneda)}`;

/**
 * Corregir o borrar un movimiento de caja. Solo el dueño, y queda en
 * Auditoría cómo estaba antes.
 *
 * Los que salieron de una venta o del costo de una unidad no se tocan desde
 * acá: la venta y la unidad llevan su propia cuenta de lo pagado y quedarían
 * distintas de la caja.
 */
export default async function CorregirMovimiento({ params }: { params: Promise<any> }) {
  const u = await requierePermiso("caja");
  if (u.rol !== "dueno") {
    return <Panel><p className="text-[13px] text-[var(--c-tinta-media)] py-8 text-center">
      Solo el dueño puede corregir movimientos de caja.</p></Panel>;
  }
  const id = Number((await params).id) || 0;
  const [mv] = await sql`SELECT * FROM caja_movimientos WHERE id = ${id}`;
  if (!mv) notFound();
  const cuentas = await sql`SELECT id, nombre FROM caja_cuentas
                            WHERE activa OR id IN (${mv.cuenta_id}, ${mv.cuenta_destino_id ?? 0})
                            ORDER BY posicion, id`;
  const atado = !!(mv.venta_id || mv.costo_id);

  async function guardar(fd: FormData) {
    "use server";
    const usr = await requierePermiso("caja");
    if (usr.rol !== "dueno") return avisoError(SIN_PERMISO);
    const [antes] = await sql`SELECT * FROM caja_movimientos WHERE id = ${id}`;
    if (!antes || antes.venta_id || antes.costo_id) return avisoError("Este movimiento no se puede corregir desde Caja.");
    const d = leerMovimiento(fd);
    if (typeof d === "string") return avisoError(d);
    await sql.begin(async (tx) => {
      await tx`
        UPDATE caja_movimientos SET
          fecha = ${d.fecha}, tipo = ${d.tipo}, cuenta_id = ${d.cuenta}, cuenta_destino_id = ${d.destino},
          categoria = ${d.categoria}, descripcion = ${d.descripcion}, contraparte = ${d.contraparte},
          monto = ${d.monto}, moneda = ${d.moneda}, cotizacion = ${d.cotizacion},
          equivalente_ars = ${d.equivalente}, forma_pago = ${d.forma_pago}
        WHERE id = ${id}`;
      await tx`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
               VALUES (${usr.id}, 'caja', ${id}, 'corregir', ${"Antes: " + resumen(antes)})`;
    });
    revalidatePath("/caja");
    await avisoOk("Movimiento corregido");
    redirect("/caja");
  }

  async function borrar() {
    "use server";
    const usr = await requierePermiso("caja");
    if (usr.rol !== "dueno") return avisoError(SIN_PERMISO);
    const [antes] = await sql`SELECT * FROM caja_movimientos WHERE id = ${id}`;
    if (!antes || antes.venta_id || antes.costo_id) return avisoError("Este movimiento no se puede borrar desde Caja.");
    await sql.begin(async (tx) => {
      await tx`DELETE FROM caja_movimientos WHERE id = ${id}`;
      await tx`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
               VALUES (${usr.id}, 'caja', ${id}, 'borrar', ${resumen(antes)})`;
    });
    revalidatePath("/caja");
    await avisoOk("Movimiento borrado");
    redirect("/caja");
  }

  if (atado) {
    return (
      <>
        <Encabezado volver="/caja" titulo="Corregir movimiento" detalle={resumen(mv)} />
        <Panel>
          <p className="text-[13px] text-[var(--c-tinta-media)] leading-relaxed">
            Este movimiento salió de {mv.venta_id ? "un cobro de una venta" : "un costo de la unidad"} y se corrige desde ahí{mv.venta_id ? " (Corregir → Quitar el cobro)" : ""},
            para que no quede distinto de la caja.
          </p>
          <div className="mt-4">
            <Boton href={mv.venta_id ? `/ventas/${mv.venta_id}/editar` : `/vehiculos/${mv.vehiculo_id}`} variante="suave">
              {mv.venta_id ? "Ir a la venta" : "Ir a la unidad"}
            </Boton>
          </div>
        </Panel>
      </>
    );
  }

  const inicial = {
    fecha: new Date(mv.fecha).toISOString().slice(0, 10),
    tipo: mv.tipo, cuenta: String(mv.cuenta_id), destino: mv.cuenta_destino_id ? String(mv.cuenta_destino_id) : "",
    categoria: mv.categoria || "", descripcion: mv.descripcion || "", contraparte: mv.contraparte || "",
    monto: String(Number(mv.monto)), moneda: mv.moneda, cotizacion: String(Number(mv.cotizacion)),
    forma_pago: mv.forma_pago || "",
  };

  return (
    <>
      <Encabezado volver="/caja" titulo="Corregir movimiento"
        detalle="El cambio impacta en el saldo de la cuenta. Cómo estaba antes queda guardado en Auditoría." />
      <Panel>
        <form action={guardar} className="grid sm:grid-cols-4 gap-3 items-end">
          <CamposMovimiento cuentas={cuentas as any} inicial={inicial} />
          <div className="sm:col-span-4 flex flex-wrap gap-2">
            <Boton tipo="submit">Guardar cambios</Boton>
            <Boton href="/caja" variante="fantasma">Cancelar</Boton>
          </div>
        </form>
      </Panel>

      <Panel className="mt-4">
        <PanelTitulo titulo="Borrar el movimiento"
          detalle="Para lo que se cargó dos veces o por error. Se borra de la caja y el saldo vuelve a como estaba." />
        <form action={borrar} className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[13px] text-[var(--c-tinta-media)]">
            <input type="checkbox" required /> Sí, borrarlo
          </label>
          <Boton tipo="submit" variante="peligro"><Trash2 size={15} /> Borrar</Boton>
        </form>
      </Panel>

      <p className="mt-4 text-[12px] text-[var(--c-tinta-tenue)]">
        <Link href="/auditoria" className="hover:underline">Ver Auditoría</Link>
      </p>
    </>
  );
}
