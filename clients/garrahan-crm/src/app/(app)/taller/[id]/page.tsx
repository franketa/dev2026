import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Check, Plus, CheckCheck } from "lucide-react";
import { sql } from "@/lib/db";
import { requiereSesion, veCostos } from "@/lib/auth";
import { plata, fecha, dominio } from "@/lib/format";
import { ESTADOS_TALLER } from "@/lib/constantes";
import {
  Encabezado, KPI, GrillaKPI, Panel, PanelTitulo, Chip, Boton, Campo, Progreso, Dato,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Orden({ params }: { params: Promise<any> }) {
  const u = await requiereSesion();
  const costos = veCostos(u);
  const { id } = await params;

  const [o] = await sql`
    SELECT o.*, v.id AS vid, v.dominio, v.marca, v.modelo, v.anio, s.nombre AS sucursal
    FROM ordenes_taller o
    JOIN vehiculos v ON v.id = o.vehiculo_id
    LEFT JOIN sucursales s ON s.id = v.sucursal_id
    WHERE o.id = ${id}`;
  if (!o) notFound();

  const [items, proveedores] = await Promise.all([
    sql`SELECT i.*, p.nombre AS proveedor FROM orden_items i
        LEFT JOIN proveedores p ON p.id = i.proveedor_id
        WHERE i.orden_id = ${id} ORDER BY i.posicion, i.id`,
    sql`SELECT id, nombre FROM proveedores WHERE activo ORDER BY nombre`,
  ]);

  const hechos = items.filter((i: any) => i.hecho).length;
  const total = items.length;
  const costoTotal = items.reduce((s: number, i: any) => s + Number(i.costo || 0), 0);
  const e = ESTADOS_TALLER[o.estado] || { label: o.estado, tono: "gris" as const };

  /* ------------------------------------------------------------ acciones */
  async function tildar(fd: FormData) {
    "use server";
    await requiereSesion();
    const itemId = Number(fd.get("item"));
    await sql`UPDATE orden_items SET hecho = NOT hecho WHERE id = ${itemId}`;
    revalidatePath(`/taller/${id}`);
  }

  async function agregarTarea(fd: FormData) {
    "use server";
    await requiereSesion();
    const tarea = String(fd.get("tarea") || "").trim();
    if (!tarea) return;
    await sql`INSERT INTO orden_items (orden_id, tarea, costo, proveedor_id, posicion)
              VALUES (${id}, ${tarea}, ${Number(fd.get("costo") || 0)},
                      ${fd.get("proveedor") ? Number(fd.get("proveedor")) : null},
                      (SELECT COALESCE(MAX(posicion),0)+1 FROM orden_items WHERE orden_id = ${id}))`;
    revalidatePath(`/taller/${id}`);
  }

  async function cambiarEstado(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    const nuevo = String(fd.get("estado"));
    await sql`UPDATE ordenes_taller SET estado = ${nuevo} WHERE id = ${id}`;
    // El estado del auto sigue al de la orden: no hay que tocarlo dos veces.
    const mapa: Record<string, string> = {
      en_revision: "en_revision", en_taller: "en_taller",
      en_detailing: "en_detailing", completado: "disponible",
    };
    await sql`UPDATE vehiculos SET estado = ${mapa[nuevo] || "disponible"} WHERE id = ${o.vid}`;
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'orden_taller', ${id}, 'estado', ${nuevo})`;
    revalidatePath(`/taller/${id}`);
  }

  /** Al cerrar la orden, el costo del taller pasa a ser costo de la unidad. */
  async function cerrarOrden() {
    "use server";
    const usr = await requiereSesion();
    const its = await sql`SELECT * FROM orden_items WHERE orden_id = ${id} AND costo > 0`;
    for (const i of its) {
      const [ya] = await sql`SELECT id FROM vehiculo_costos
                             WHERE orden_id = ${id} AND detalle = ${i.tarea} LIMIT 1`;
      if (ya) continue;
      await sql`INSERT INTO vehiculo_costos (vehiculo_id, tipo, detalle, proveedor_id, fecha, monto, origen, orden_id)
                VALUES (${o.vid}, 'Taller', ${i.tarea}, ${i.proveedor_id},
                        ${new Date().toISOString().slice(0, 10)}, ${i.costo}, 'taller', ${id})`;
    }
    await sql`UPDATE ordenes_taller SET estado = 'completado', fecha_salida = current_date WHERE id = ${id}`;
    await sql`UPDATE vehiculos SET estado = 'disponible' WHERE id = ${o.vid}`;
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'orden_taller', ${id}, 'cerrada', ${"costos imputados a la unidad"})`;
    redirect(`/vehiculos/${o.vid}?tab=costos`);
  }

  return (
    <>
      <Encabezado
        volver="/taller"
        titulo={`Orden #${o.id} — ${o.marca} ${o.modelo} ${o.anio}`}
        detalle={`${dominio(o.dominio)} · ingresó el ${fecha(o.fecha_ingreso)}`}
        acciones={
          <>
            <Chip tono={e.tono}>{e.label}</Chip>
            <form action={cambiarEstado} className="flex gap-2">
              <select name="estado" defaultValue={o.estado} className="campo w-auto py-1.5 text-[12.5px]">
                {Object.entries(ESTADOS_TALLER).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
              </select>
              <Boton tipo="submit" variante="suave">Cambiar</Boton>
            </form>
            {o.estado !== "completado" && (
              <form action={cerrarOrden}>
                <Boton tipo="submit" variante="exito"><CheckCheck size={15} /> Cerrar e imputar costos</Boton>
              </form>
            )}
          </>
        }
      />

      <GrillaKPI cols={3}>
        <KPI label="Avance" valor={`${hechos} / ${total}`} detalle="tareas completadas" />
        {costos && <KPI label="Costo de preparación" valor={plata(costoTotal)} detalle="se suma a la unidad" />}
        <KPI label="Días en taller" valor={`${Math.max(0, Math.round((Date.now() - new Date(o.fecha_ingreso).getTime()) / 864e5))}`}
             tono="naranja" />
      </GrillaKPI>

      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2 space-y-4">
          <Panel>
            <PanelTitulo titulo="Checklist de preparación"
              detalle="Tildá lo que se va haciendo. El próximo paso aparece en el listado." />
            <div className="mb-4"><Progreso hechos={hechos} total={total} /></div>

            <div className="space-y-1.5">
              {items.map((i: any) => (
                <form key={i.id} action={tildar}>
                  <input type="hidden" name="item" value={i.id} />
                  <button type="submit" className={`w-full flex items-center gap-3 rounded-lg border px-3.5 py-2.5
                    text-left transition-colors
                    ${i.hecho ? "border-[var(--c-verde-borde)] bg-[var(--c-verde-fondo)]" : "border-[var(--c-borde)] bg-[var(--c-hueco)] hover:border-[var(--c-primario)]"}`}>
                    <span className={`h-4.5 w-4.5 shrink-0 rounded grid place-items-center border
                      ${i.hecho ? "bg-[var(--c-verde)] border-[var(--c-verde)]" : "border-[var(--c-borde-alto)]"}`}
                      style={{ height: 18, width: 18 }}>
                      {i.hecho && <Check size={12} className="text-[var(--c-verde-fondo)]" />}
                    </span>
                    <span className={`flex-1 text-[13px] ${i.hecho ? "text-[var(--c-tinta-media)] line-through" : ""}`}>
                      {i.tarea}
                    </span>
                    {i.proveedor && <span className="text-[11.5px] text-[var(--c-tinta-tenue)]">{i.proveedor}</span>}
                    {costos && Number(i.costo) > 0 && (
                      <span className="text-[12.5px] tabular text-[var(--c-tinta-media)]">{plata(i.costo)}</span>
                    )}
                  </button>
                </form>
              ))}
            </div>
          </Panel>

          {costos && (
            <Panel>
              <PanelTitulo titulo="Agregar tarea" />
              <form action={agregarTarea} className="grid sm:grid-cols-4 gap-3 items-end">
                <Campo label="Tarea" ancho="sm:col-span-2">
                  <input name="tarea" required className="campo" placeholder="Qué hay que hacer" />
                </Campo>
                <Campo label="Proveedor">
                  <select name="proveedor" className="campo">
                    <option value="">—</option>
                    {proveedores.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </Campo>
                <Campo label="Costo">
                  <input name="costo" type="number" step="0.01" className="campo" placeholder="0" />
                </Campo>
                <div className="sm:col-span-4"><Boton tipo="submit" variante="suave"><Plus size={15} /> Agregar</Boton></div>
              </form>
            </Panel>
          )}
        </div>

        <Panel>
          <PanelTitulo titulo="La unidad" />
          <Dato label="Vehículo">
            <Link href={`/vehiculos/${o.vid}`} className="text-[var(--c-enlace)] hover:underline">
              {o.marca} {o.modelo}
            </Link>
          </Dato>
          <Dato label="Dominio">{dominio(o.dominio)}</Dato>
          <Dato label="Año">{o.anio || "—"}</Dato>
          <Dato label="Ubicación">{o.sucursal || "—"}</Dato>
          <Dato label="Ingreso al taller">{fecha(o.fecha_ingreso)}</Dato>
          {o.fecha_salida && <Dato label="Salida">{fecha(o.fecha_salida)}</Dato>}
          {o.notas && (
            <div className="mt-3 pt-3 border-t border-[var(--c-borde)]">
              <div className="etiqueta mb-1.5">Notas</div>
              <p className="text-[13px] text-[var(--c-tinta-clara)] whitespace-pre-line">{o.notas}</p>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
