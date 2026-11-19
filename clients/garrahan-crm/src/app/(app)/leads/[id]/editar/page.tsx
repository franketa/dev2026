import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avisoOk, avisoError } from "@/lib/aviso";
import { sql } from "@/lib/db";
import { requierePermiso, veTodosLosLeads } from "@/lib/auth";
import { puedeVerLead } from "@/lib/leads";
import { editarLead } from "@/lib/leads-operar";
import { Encabezado, Boton } from "@/components/ui";
import CamposLead from "@/components/campos-lead";

export const dynamic = "force-dynamic";



/**
 * Todos los datos del lead, para corregirlos. El estado no: se cambia desde
 * la ficha, que es donde queda anotado en el historial cada paso del embudo.
 */
export default async function EditarLead({ params }: { params: Promise<any> }) {
  const u = await requierePermiso("leads.editar");
  const id = Number((await params).id) || 0;
  if (!(await puedeVerLead(u, id))) notFound();
  const [l] = await sql`SELECT * FROM leads WHERE id = ${id}`;
  if (!l) notFound();

  // La unidad y el cliente que ya tiene aparecen aunque la unidad se haya vendido.
  const [vehiculos, asesores, sucursales, clientes] = await Promise.all([
    sql`SELECT id, marca, modelo, anio, dominio FROM vehiculos
        WHERE estado IN ('disponible','reservado','promocion') OR id = ${l.vehiculo_id ?? 0} ORDER BY marca, modelo`,
    sql`SELECT id, nombre FROM usuarios
        WHERE (activo AND rol IN ('vendedor','gerente','dueno')) OR id = ${l.asesor_id ?? 0} ORDER BY nombre`,
    sql`SELECT id, nombre FROM sucursales WHERE activa OR id = ${l.sucursal_id ?? 0} ORDER BY nombre`,
    sql`SELECT id, nombre, apellido, telefono FROM clientes
        WHERE id IN (SELECT id FROM clientes ORDER BY nombre LIMIT 500) OR id = ${l.cliente_id ?? 0}
        ORDER BY nombre`,
  ]);

  async function guardar(fd: FormData) {
    "use server";
    const usr = await requierePermiso("leads.editar");
    const txt = (k: string) => {
      const v = String(fd.get(k) ?? "").trim();
      return v === "" ? null : v;
    };
    const num = (k: string) => {
      const v = fd.get(k);
      return v === null || String(v).trim() === "" ? null : Number(v);
    };

    const nuevo: Record<string, any> = {
      nombre: txt("nombre"), telefono: txt("telefono"), email: txt("email"),
      sucursal_id: num("sucursal_id"), cliente_id: num("cliente_id"),
      vehiculo_id: num("vehiculo_id"), vehiculo_texto: txt("vehiculo_texto"),
      presupuesto: num("presupuesto"),
      entrega_usado: fd.get("entrega_usado") === "on", usado_detalle: txt("usado_detalle"), tasacion: num("tasacion"),
      proxima_accion: txt("proxima_accion"), fecha_proxima: txt("fecha_proxima"),
      observaciones: txt("observaciones"),
      // Fuera de un lead perdido no hay motivo que corregir: editarLead lo deja como estaba.
      motivo_perdida: txt("motivo_perdida"),
    };
    if (fd.get("origen")) nuevo.origen = String(fd.get("origen"));
    // El asesor solo viaja en el formulario de quien puede reasignar.
    if (veTodosLosLeads(usr)) nuevo.asesor_id = num("asesor_id");

    const r = await editarLead(usr, id, nuevo);
    if ("error" in r) return avisoError(r.error);
    if (r.cambios.length === 0) {
      await avisoOk("No había nada para cambiar");
      redirect(`/leads/${id}`);
    }
    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads");
    await avisoOk("Lead actualizado");
    redirect(`/leads/${id}`);
  }

  return (
    <>
      <Encabezado volver={`/leads/${id}`} titulo={`Editar lead: ${l.nombre}`}
        detalle="Lo que cambies queda anotado en el historial del lead. El estado se cambia desde la ficha." />

      <form action={guardar} className="space-y-4 max-w-4xl">
        <CamposLead l={l} asignaAsesor={veTodosLosLeads(u)}
          vehiculos={vehiculos} asesores={asesores} sucursales={sucursales} clientes={clientes} />

        <div className="flex gap-2">
          <Boton tipo="submit">Guardar cambios</Boton>
          <Boton href={`/leads/${id}`} variante="suave">Cancelar</Boton>
        </div>
      </form>
    </>
  );
}
