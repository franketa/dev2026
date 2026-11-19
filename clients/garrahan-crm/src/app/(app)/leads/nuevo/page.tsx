import { redirect } from "next/navigation";
import { crearLead } from "@/lib/leads-operar";
import { avisoOk, avisoError } from "@/lib/aviso";
import { sql } from "@/lib/db";
import { requierePermiso } from "@/lib/auth";
import { Encabezado, Boton } from "@/components/ui";
import CamposLead from "@/components/campos-lead";

export const dynamic = "force-dynamic";

export default async function NuevoLead({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requierePermiso("leads");
  const p = await searchParams;

  const [vehiculos, asesores, sucursales, clientes] = await Promise.all([
    sql`SELECT id, marca, modelo, anio, dominio FROM vehiculos
        WHERE estado IN ('disponible','reservado','promocion') ORDER BY marca, modelo`,
    sql`SELECT id, nombre FROM usuarios WHERE activo AND rol IN ('vendedor','gerente','dueno') ORDER BY nombre`,
    sql`SELECT id, nombre FROM sucursales WHERE activa ORDER BY nombre`,
    sql`SELECT id, nombre, apellido, telefono FROM clientes ORDER BY nombre LIMIT 500`,
  ]);

  async function crear(fd: FormData) {
    "use server";
    const usr = await requierePermiso("leads");
    const txt = (k: string) => {
      const v = String(fd.get(k) ?? "").trim();
      return v === "" ? null : v;
    };
    const num = (k: string) => {
      const v = fd.get(k);
      return v === null || String(v).trim() === "" ? null : Number(v);
    };

    const r = await crearLead(usr, {
      cliente_id: num("cliente_id"), nombre: txt("nombre"), telefono: txt("telefono"), email: txt("email"),
      origen: String(fd.get("origen") || "showroom"), estado: String(fd.get("estado") || "nuevo"),
      asesor_id: num("asesor_id"), vehiculo_id: num("vehiculo_id"), vehiculo_texto: txt("vehiculo_texto"),
      presupuesto: num("presupuesto"),
      entrega_usado: fd.get("entrega_usado") === "on", usado_detalle: txt("usado_detalle"), tasacion: num("tasacion"),
      proxima_accion: txt("proxima_accion"), fecha_proxima: txt("fecha_proxima"),
      observaciones: txt("observaciones"), sucursal_id: num("sucursal_id"),
    });
    if ("error" in r) return avisoError(r.error);
    await avisoOk("Lead cargado");
    redirect(`/leads/${r.id}`);
  }

  return (
    <>
      <Encabezado volver="/leads" titulo="Nuevo lead"
        detalle="Cargalo apenas entra. Lo único que hace falta es el nombre." />

      <form action={crear} className="space-y-4 max-w-4xl">
        <CamposLead conEstado asignaAsesor
          l={{ asesor_id: u.id, sucursal_id: u.sucursal_id, origen: p.origen, vehiculo_id: p.vehiculo }}
          vehiculos={vehiculos} asesores={asesores} sucursales={sucursales} clientes={clientes} />

        <div className="flex gap-2">
          <Boton tipo="submit">Guardar lead</Boton>
          <Boton href="/leads" variante="suave">Cancelar</Boton>
        </div>
      </form>
    </>
  );
}
