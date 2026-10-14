import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { fecha, numeroWhatsApp } from "@/lib/format";
import { cargarPropuesta, basePublica, nombreAuto } from "@/lib/propuestas";
import BotonImprimir from "@/components/boton-imprimir";
import HojaPropuesta from "@/components/hoja-propuesta";

export const dynamic = "force-dynamic";

/**
 * La propuesta que abre el cliente desde el link de WhatsApp. Sin login:
 * el token es la llave. No muestra nada del sistema, solo la hoja.
 */
export async function generateMetadata({ params }: { params: Promise<any> }): Promise<Metadata> {
  const { token } = await params;
  const datos = await cargarPropuesta({ token: String(token) });
  if (!datos) return { title: "Propuesta no encontrada", robots: { index: false } };
  const empresa = datos.empresa.razon_social || "Garrahan Automotores";
  const foto = datos.items.find((x) => x.auto.foto)?.auto.foto;
  return {
    title: `Propuesta para ${datos.p.cliente} — ${empresa}`,
    description: datos.items.map((x) => nombreAuto(x.auto)).join(" · "),
    robots: { index: false, follow: false },
    openGraph: {
      title: `Propuesta de ${empresa}`,
      description: datos.items.map((x) => nombreAuto(x.auto)).join(" · "),
      images: foto ? [`${await basePublica()}/api/fotos/${foto}`] : [],
    },
  };
}

export default async function PropuestaPublica({ params }: { params: Promise<any> }) {
  const { token } = await params;
  const datos = await cargarPropuesta({ token: String(token) });
  if (!datos) notFound();
  const { p, empresa, vence } = datos;

  const vencida = vence.getTime() < Date.now();
  const tel = numeroWhatsApp(p.vendedor_tel || empresa.telefono);
  const consulta = `Hola${p.vendedor ? " " + String(p.vendedor).split(" ")[0] : ""}, te escribo por la propuesta N° ${p.id}.`;

  return (
    <div className="min-h-screen bg-[#eceef1] print:bg-white sm:py-8 print:py-0">
      {vencida && (
        <p className="no-imprimir max-w-[800px] mx-auto bg-amber-100 text-amber-900 text-[13px] px-5 py-3 sm:rounded-lg sm:mb-4">
          Esta propuesta venció el {fecha(vence)}. Los precios pueden haber cambiado: escribinos y te la actualizamos.
        </p>
      )}
      <HojaPropuesta datos={datos} />
      <div className="no-imprimir max-w-[800px] mx-auto px-5 py-6 sm:px-0 flex flex-wrap justify-center gap-3">
        {tel && (
          <a href={`https://wa.me/${tel}?text=${encodeURIComponent(consulta)}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[#25d366] hover:bg-[#1ebe5b] px-4 py-2.5
              text-[14px] font-semibold text-white">
            <MessageCircle size={17} /> Consultar por WhatsApp
          </a>
        )}
        <BotonImprimir />
      </div>
    </div>
  );
}
