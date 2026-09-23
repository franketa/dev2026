import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { ESTADOS_TALLER, CHECKLIST_TALLER } from "@/lib/constantes";
import { Encabezado, Panel, PanelTitulo, Boton, Campo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NuevaOrden({ searchParams }: { searchParams: Promise<any> }) {
  await requiereSesion();
  const p = await searchParams;

  const vehiculos = await sql`
    SELECT id, marca, modelo, anio, dominio, estado FROM vehiculos
    WHERE estado NOT IN ('vendido','baja') ORDER BY marca, modelo`;

  async function crear(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    const vehiculoId = Number(fd.get("vehiculo_id") || 0);
    if (!vehiculoId) return;

    const estado = String(fd.get("estado") || "en_revision");
    const [o] = await sql`
      INSERT INTO ordenes_taller (vehiculo_id, estado, fecha_ingreso, notas, creada_por)
      VALUES (${vehiculoId}, ${estado},
              ${String(fd.get("fecha_ingreso") || new Date().toISOString().slice(0, 10))},
              ${String(fd.get("notas") || "") || null}, ${usr.id})
      RETURNING id`;

    // Las tareas tildadas arman el checklist; si no se tildó ninguna, entra el
    // checklist completo, que es lo que pasa en la práctica al recibir una unidad.
    const marcadas = fd.getAll("tarea").map(String).filter(Boolean);
    const tareas = marcadas.length > 0 ? marcadas : CHECKLIST_TALLER;
    for (let i = 0; i < tareas.length; i++) {
      await sql`INSERT INTO orden_items (orden_id, tarea, posicion) VALUES (${o.id}, ${tareas[i]}, ${i})`;
    }

    const extra = String(fd.get("tarea_extra") || "").trim();
    if (extra) {
      await sql`INSERT INTO orden_items (orden_id, tarea, posicion)
                VALUES (${o.id}, ${extra}, ${tareas.length})`;
    }

    // Mientras está en preparación, el auto no figura disponible para vender.
    await sql`UPDATE vehiculos SET estado = ${estado === "completado" ? "disponible" : estado}
              WHERE id = ${vehiculoId} AND estado NOT IN ('vendido','reservado','baja')`;

    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'orden_taller', ${o.id}, 'alta', ${"vehículo " + vehiculoId})`;

    redirect(`/taller/${o.id}`);
  }

  return (
    <>
      <Encabezado volver="/taller" titulo="Nueva orden de preparación"
        detalle="Al cerrarla, lo que se haya gastado pasa como costo de la unidad y ajusta el margen." />

      <form action={crear} className="space-y-4 max-w-3xl">
        <Panel>
          <PanelTitulo titulo="La unidad" />
          <div className="grid sm:grid-cols-3 gap-4">
            <Campo label="Vehículo *" ancho="sm:col-span-2">
              <select name="vehiculo_id" required className="campo" defaultValue={p.vehiculo || ""}>
                <option value="">Elegí la unidad</option>
                {vehiculos.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.marca} {v.modelo} {v.anio || ""} {v.dominio ? "· " + v.dominio : ""}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Fecha de ingreso">
              <input name="fecha_ingreso" type="date" className="campo"
                defaultValue={new Date().toISOString().slice(0, 10)} />
            </Campo>
            <Campo label="Estado inicial">
              <select name="estado" className="campo" defaultValue="en_revision">
                {Object.entries(ESTADOS_TALLER)
                  .filter(([v]) => v !== "completado")
                  .map(([v, e]) => <option key={v} value={v}>{e.label}</option>)}
              </select>
            </Campo>
          </div>
        </Panel>

        <Panel>
          <PanelTitulo titulo="Qué hay que hacer"
            detalle="Destildá lo que no corresponda. Si no tocás nada, entra el checklist completo." />
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
            {CHECKLIST_TALLER.map((t) => (
              <label key={t} className="flex items-center gap-2.5 text-[13px] text-[var(--c-tinta-clara)] cursor-pointer">
                <input type="checkbox" name="tarea" value={t} defaultChecked
                  className="h-4 w-4 accent-[var(--c-primario)]" />
                {t}
              </label>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-[var(--c-borde)]">
            <Campo label="Agregar una tarea que no está en la lista">
              <input name="tarea_extra" className="campo" placeholder="Cambiar parabrisas" />
            </Campo>
          </div>
        </Panel>

        <Panel>
          <Campo label="Notas para el taller">
            <textarea name="notas" rows={3} className="campo"
              placeholder="Ruido en el tren delantero, revisar antes de publicar." />
          </Campo>
        </Panel>

        <div className="flex gap-2">
          <Boton tipo="submit">Abrir la orden</Boton>
          <Boton href="/taller" variante="suave">Cancelar</Boton>
        </div>
      </form>
    </>
  );
}
