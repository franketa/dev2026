import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avisoOk, avisoError } from "@/lib/aviso";
import { sql } from "@/lib/db";
import { requierePermiso, veTodosLosLeads } from "@/lib/auth";
import { puedeVerLead } from "@/lib/leads";
import { Encabezado, Boton } from "@/components/ui";
import CamposLead from "@/components/campos-lead";

export const dynamic = "force-dynamic";

/** Cómo se nombra cada dato en el historial del lead. */
const NOMBRES: Record<string, string> = {
  nombre: "nombre", telefono: "teléfono", email: "email", origen: "origen", asesor_id: "asesor",
  sucursal_id: "sucursal", cliente_id: "cliente", vehiculo_id: "unidad", vehiculo_texto: "lo que pidió",
  presupuesto: "presupuesto", entrega_usado: "entrega usado", usado_detalle: "usado",
  tasacion: "tasación", proxima_accion: "próxima acción", fecha_proxima: "fecha de la próxima acción",
  observaciones: "observaciones", motivo_perdida: "motivo de la pérdida",
};

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
    if (!(await puedeVerLead(usr, id))) return avisoError("Ese lead no es tuyo.");
    const [antes] = await sql`SELECT * FROM leads WHERE id = ${id}`;
    if (!antes) return avisoError("Ese lead ya no existe.");

    const txt = (k: string) => {
      const v = String(fd.get(k) ?? "").trim();
      return v === "" ? null : v;
    };
    const num = (k: string) => {
      const v = fd.get(k);
      return v === null || String(v).trim() === "" ? null : Number(v);
    };
    const nombre = txt("nombre");
    if (!nombre) return avisoError("Falta el nombre.");

    const nuevo: Record<string, any> = {
      nombre, telefono: txt("telefono"), email: txt("email"),
      origen: String(fd.get("origen") || antes.origen),
      asesor_id: veTodosLosLeads(usr) ? num("asesor_id") : antes.asesor_id,
      sucursal_id: num("sucursal_id"), cliente_id: num("cliente_id"),
      vehiculo_id: num("vehiculo_id"), vehiculo_texto: txt("vehiculo_texto"),
      presupuesto: num("presupuesto"),
      entrega_usado: fd.get("entrega_usado") === "on", usado_detalle: txt("usado_detalle"), tasacion: num("tasacion"),
      proxima_accion: txt("proxima_accion"), fecha_proxima: txt("fecha_proxima"),
      observaciones: txt("observaciones"),
      motivo_perdida: antes.estado === "perdido" ? txt("motivo_perdida") : antes.motivo_perdida,
    };

    const comparable = (k: string, v: any) => {
      if (v === null || v === undefined || v === "") return "";
      if (k === "fecha_proxima") return new Date(v).toISOString().slice(0, 10);
      if (["presupuesto", "tasacion", "asesor_id", "sucursal_id", "cliente_id", "vehiculo_id"].includes(k)) return String(Number(v));
      return String(v);
    };
    const cambios = Object.keys(nuevo).filter((k) => comparable(k, nuevo[k]) !== comparable(k, antes[k]));
    if (cambios.length === 0) {
      await avisoOk("No había nada para cambiar");
      redirect(`/leads/${id}`);
    }

    await sql.begin(async (tx) => {
      await tx`UPDATE leads SET ${tx(nuevo)}, actualizado_en = now() WHERE id = ${id}`;
      await tx`INSERT INTO lead_interacciones (lead_id, tipo, detalle, usuario_id)
               VALUES (${id}, 'nota', ${"Datos corregidos: " + cambios.map((k) => NOMBRES[k] || k).join(", ")}, ${usr.id})`;
      await tx`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
               VALUES (${usr.id}, 'lead', ${id}, 'editar',
                       ${cambios.map((k) => `${NOMBRES[k] || k}: ${comparable(k, antes[k]) || "—"} → ${comparable(k, nuevo[k]) || "—"}`).join(" · ")})`;
    });
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
