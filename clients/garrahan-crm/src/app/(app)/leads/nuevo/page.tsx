import { redirect } from "next/navigation";
import { avisarLeadNuevo } from "@/lib/leads";
import { avisoOk, avisoError } from "@/lib/aviso";
import { sql } from "@/lib/db";
import { requierePermiso } from "@/lib/auth";
import { ORIGENES_LEAD, ESTADOS_LEAD } from "@/lib/constantes";
import { Encabezado, Boton } from "@/components/ui";
import CamposLead from "@/components/campos-lead";

export const dynamic = "force-dynamic";

export default async function NuevoLead({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requierePermiso("leads");
  const p = await searchParams;

  const [vehiculos, asesores, sucursales, clientes] = await Promise.all([
    sql`SELECT id, marca, modelo, anio, dominio FROM vehiculos
        WHERE estado IN ('disponible','reservado') ORDER BY marca, modelo`,
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

    const nombre = txt("nombre");
    if (!nombre) return avisoError("Falta el nombre.");

    const estado = String(fd.get("estado") || "nuevo");
    const etapa = ESTADOS_LEAD[estado]?.etapa || "captacion";

    const [l] = await sql`
      INSERT INTO leads (cliente_id, nombre, telefono, email, origen, etapa, estado,
                         asesor_id, vehiculo_id, vehiculo_texto, presupuesto,
                         entrega_usado, usado_detalle, tasacion,
                         proxima_accion, fecha_proxima, observaciones, sucursal_id, creado_por)
      VALUES (${num("cliente_id")}, ${nombre}, ${txt("telefono")}, ${txt("email")},
              ${String(fd.get("origen") || "showroom")}, ${etapa}, ${estado},
              ${num("asesor_id")}, ${num("vehiculo_id")}, ${txt("vehiculo_texto")},
              ${num("presupuesto")},
              ${fd.get("entrega_usado") === "on"}, ${txt("usado_detalle")}, ${num("tasacion")},
              ${txt("proxima_accion")}, ${txt("fecha_proxima")},
              ${txt("observaciones")}, ${num("sucursal_id")}, ${usr.id})
      RETURNING id`;

    await sql`INSERT INTO lead_interacciones (lead_id, tipo, detalle, usuario_id)
              VALUES (${l.id}, 'nota', ${"Lead cargado desde " + (ORIGENES_LEAD[String(fd.get("origen") || "showroom")] || "showroom")}, ${usr.id})`;
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'lead', ${l.id}, 'alta', ${nombre})`;

    await avisarLeadNuevo(l.id);
    await avisoOk("Lead cargado");
    redirect(`/leads/${l.id}`);
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
