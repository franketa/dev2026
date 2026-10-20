import { revalidatePath } from "next/cache";
import { avisoOk, avisoError } from "@/lib/aviso";
import { sql } from "@/lib/db";
import { requierePermiso } from "@/lib/auth";
import { plata, fecha, numero } from "@/lib/format";
import { Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";


/**
 * Desactivar una sucursal la saca del selector de arriba del menú y de los
 * formularios. No se borra: los autos vendidos y el historial la siguen
 * nombrando.
 */
async function alternarActiva(fd: FormData) {
  "use server";
  const usr = await requierePermiso("sucursales");
  const id = Number(fd.get("id") || 0);
  const [s] = await sql`SELECT nombre, activa FROM sucursales WHERE id = ${id}`;
  if (!s) return;
  const nueva = !s.activa;

  if (!nueva) {
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM vehiculos
                              WHERE sucursal_id = ${id} AND estado NOT IN ('vendido','baja','promocion')`;
    if (n > 0) return avisoError(`${s.nombre} tiene ${n} ${n === 1 ? "unidad" : "unidades"} en stock. Pasalas a otra sucursal antes de desactivarla.`);
    const [{ m }] = await sql`SELECT count(*)::int AS m FROM sucursales WHERE activa AND id <> ${id}`;
    if (m === 0) return avisoError("Tiene que quedar al menos una sucursal activa.");
  }

  await sql`UPDATE sucursales SET activa = ${nueva} WHERE id = ${id}`;
  await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
            VALUES (${usr.id}, 'sucursal', ${id}, ${nueva ? "activada" : "desactivada"}, ${s.nombre})`;
  revalidatePath("/", "layout");
  await avisoOk(`${s.nombre} ${nueva ? "activada" : "desactivada"}`);
}

export default async function Sucursales() {
  await requierePermiso("sucursales");
  const filas = await sql`
    SELECT s.*,
      (SELECT count(*) FROM vehiculos v WHERE v.sucursal_id = s.id
        AND v.estado NOT IN ('vendido','baja','promocion'))::int AS unidades,
      (SELECT COALESCE(SUM(x.costo_total),0) FROM v_vehiculos x WHERE x.sucursal_id = s.id
        AND x.estado NOT IN ('vendido','baja','promocion')) AS capital
    FROM sucursales s ORDER BY s.activa DESC, s.nombre`;

  return (
    <>
      <Encabezado titulo="Sucursales"
        detalle="Los predios de la agencia y qué hay en cada uno. Las inactivas no aparecen en el selector ni en los formularios." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filas.length === 0 && (
          <Panel className="sm:col-span-2 lg:col-span-3">
            <p className="text-[13px] text-[var(--c-tinta-tenue)] py-6 text-center">No hay sucursales cargadas.</p>
          </Panel>
        )}
        {filas.map((s: any) => (
          <Panel key={s.id} className={s.activa ? "" : "opacity-60"}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[14.5px] font-semibold">{s.nombre}</h3>
              {!s.activa && <Chip tono="gris">Inactiva</Chip>}
            </div>
            {s.direccion && <p className="text-[12px] text-[var(--c-tinta-tenue)] mt-0.5">{s.direccion}</p>}
            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="etiqueta">Unidades</div>
                <div className="text-[22px] font-semibold tabular mt-1">{s.unidades}</div>
              </div>
              <div className="text-right">
                <div className="etiqueta">Capital</div>
                <div className="text-[15px] font-semibold tabular mt-1 text-[var(--c-tinta-media)]">{plata(s.capital)}</div>
              </div>
            </div>
            <form action={alternarActiva} className="mt-4 pt-3 border-t border-[var(--c-borde)]">
              <input type="hidden" name="id" value={s.id} />
              <button type="submit"
                className={`text-[12.5px] hover:underline
                  ${s.activa ? "text-[var(--c-rojo-alto)]" : "text-[var(--c-verde-alto)]"}`}>
                {s.activa ? "Desactivar" : "Reactivar"}
              </button>
            </form>
          </Panel>
        ))}
      </div>
    </>
  );
}
