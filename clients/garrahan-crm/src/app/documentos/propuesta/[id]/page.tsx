import { notFound } from "next/navigation";
import { MessageCircle, Pencil } from "lucide-react";
import { sql } from "@/lib/db";
import { requierePermiso } from "@/lib/auth";
import { puedeVerLead } from "@/lib/leads";
import { numeroWhatsApp } from "@/lib/format";
import { cargarPropuesta, basePublica, nombreAuto } from "@/lib/propuestas";
import { Boton } from "@/components/ui";
import BotonImprimir from "@/components/boton-imprimir";
import CopiarLink from "@/components/copiar-link";
import HojaPropuesta from "@/components/hoja-propuesta";

export const dynamic = "force-dynamic";

/** La propuesta vista desde el sistema: para imprimirla o mandarla. */
export default async function Propuesta({ params }: { params: Promise<any> }) {
  const u = await requierePermiso("leads");
  const { id } = await params;
  const datos = await cargarPropuesta({ id: Number(id) || 0 });
  if (!datos || !(await puedeVerLead(u, datos.p.lead_id))) notFound();
  const { p, items } = datos;

  const [lead] = await sql`SELECT telefono FROM leads WHERE id = ${p.lead_id}`;
  const link = `${await basePublica()}/p/${p.token}`;
  const autos = items.map((x) => nombreAuto(x.auto)).join(", ");
  const nombre = String(p.cliente).split(" ")[0];
  const texto = `Hola ${nombre}, te paso la propuesta${autos ? ` por ${autos}` : ""}:\n${link}`;
  const wa = numeroWhatsApp(lead?.telefono);
  // Sin teléfono, WhatsApp abre igual y deja elegir el contacto.
  const hrefWa = `https://wa.me/${wa || ""}?text=${encodeURIComponent(texto)}`;

  const suave = "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold " +
    "bg-[var(--c-activo)] hover:bg-[var(--c-activo-alto)] text-[var(--c-tinta-clara)] border border-[var(--c-borde)]";

  return (
    <div className="min-h-screen bg-[var(--c-fondo)] print:bg-white py-6 sm:py-8 print:py-0">
      <div className="no-imprimir max-w-[800px] mx-auto mb-4 px-4 sm:px-0 flex flex-wrap items-center gap-2">
        <a href={`/leads/${p.lead_id}`}
          className="mr-auto text-[13px] text-[var(--c-tinta-media)] hover:text-[var(--c-tinta)]">
          ← Volver al lead
        </a>
        <Boton href={`/leads/${p.lead_id}/propuesta?editar=${p.id}`} variante="suave">
          <Pencil size={15} /> Corregir
        </Boton>
        <CopiarLink url={link} className={suave} />
        <Boton href={hrefWa} variante="exito" target="_blank" rel="noopener noreferrer">
          <MessageCircle size={15} /> Mandar por WhatsApp
        </Boton>
        <BotonImprimir />
      </div>
      <HojaPropuesta datos={datos} />
    </div>
  );
}
