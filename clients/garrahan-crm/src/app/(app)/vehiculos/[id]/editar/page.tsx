import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avisoOk, avisoError, SIN_PERMISO } from "@/lib/aviso";
import { sql } from "@/lib/db";
import { requiereSesion, veCostos, puede } from "@/lib/auth";
import { leerVehiculo, definidos } from "@/lib/vehiculo-form";
import { Encabezado, Boton } from "@/components/ui";
import CamposVehiculo from "@/components/campos-vehiculo";

export const dynamic = "force-dynamic";

export default async function EditarVehiculo({ params }: { params: Promise<any> }) {
  const u = await requiereSesion();
  if (!puede(u, "vehiculos.editar")) redirect("/vehiculos");
  const verCostos = veCostos(u);
  const { id } = await params;

  const [[v], sucursales, inversores, proveedores, marcas, modelos] = await Promise.all([
    sql`SELECT * FROM vehiculos WHERE id = ${id}`,
    sql`SELECT id, nombre FROM sucursales WHERE activa ORDER BY nombre`,
    sql`SELECT id, nombre FROM inversores WHERE activo ORDER BY nombre`,
    sql`SELECT id, nombre FROM proveedores WHERE activo ORDER BY nombre`,
    sql`SELECT id, nombre FROM catalogo_marcas ORDER BY nombre`,
    sql`SELECT m.id, m.nombre, ma.nombre AS marca FROM catalogo_modelos m
        JOIN catalogo_marcas ma ON ma.id = m.marca_id ORDER BY ma.nombre, m.nombre`,
  ]);
  if (!v) notFound();

  async function guardar(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    if (!puede(usr, "vehiculos.editar")) return avisoError(SIN_PERMISO);
    const d = leerVehiculo(fd, veCostos(usr));
    if (!d.marca || !d.modelo) return avisoError("Faltan la marca o el modelo.");

    await sql`UPDATE vehiculos SET ${sql(definidos(d) as any)} WHERE id = ${id}`;
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'vehiculo', ${id}, 'edicion', ${d.marca + " " + d.modelo})`;
    revalidatePath(`/vehiculos/${id}`);
    await avisoOk("Cambios guardados");
    redirect(`/vehiculos/${id}`);
  }

  return (
    <>
      <Encabezado volver={`/vehiculos/${id}`} titulo={`Editar ${v.marca} ${v.modelo}`}
        detalle="Los cambios de precio y de publicación se ven en la web en el momento." />
      <form action={guardar} className="space-y-4 max-w-4xl">
        <CamposVehiculo v={v} verCostos={verCostos} marcas={marcas} modelos={modelos}
          sucursales={sucursales} inversores={inversores} proveedores={proveedores} />
        <div className="flex gap-2">
          <Boton tipo="submit">Guardar cambios</Boton>
          <Boton href={`/vehiculos/${id}`} variante="suave">Cancelar</Boton>
        </div>
      </form>
    </>
  );
}
