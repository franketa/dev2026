import Link from "next/link";
import { Check } from "lucide-react";
import { sql } from "@/lib/db";
import { requiereSesion, veCostos } from "@/lib/auth";
import { Encabezado, Panel, Boton, Progreso } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Puesta en marcha. No es un asistente que obliga a pasar por cinco pantallas:
 * es una lista que mira la base y dice qué falta de verdad. Un paso ya hecho
 * aparece hecho aunque se haya cargado por otro lado, y eso importa porque
 * casi nadie configura un sistema en el orden en que se lo presentan.
 */
export default async function PuestaEnMarcha() {
  const u = await requiereSesion();
  const verPlata = veCostos(u);

  const [emp, suc, cuentas, usuarios, vehiculos, catalogo, cot] = await Promise.all([
    sql`SELECT razon_social, cuit, domicilio FROM empresa WHERE id = 1`,
    sql`SELECT count(*)::int AS n FROM sucursales WHERE activa`,
    sql`SELECT count(*)::int AS n FROM caja_cuentas WHERE activa`,
    sql`SELECT count(*)::int AS n FROM usuarios WHERE activo`,
    sql`SELECT count(*)::int AS n FROM vehiculos`,
    sql`SELECT count(*)::int AS n FROM catalogo_marcas`,
    sql`SELECT valor FROM cotizaciones ORDER BY fecha DESC LIMIT 1`,
  ]);

  const e = emp[0] || {};

  const PASOS = [
    {
      titulo: "Los datos que salen impresos",
      detalle: "La razón social, el CUIT y el domicilio se imprimen en el boleto de compraventa, en el recibo y en el mandato. Se cargan una vez y no se vuelven a escribir nunca.",
      hecho: Boolean(e.razon_social && e.cuit && e.domicilio),
      falta: !e.cuit ? "Falta el CUIT" : !e.domicilio ? "Falta el domicilio" : "",
      href: "/configuracion",
      accion: "Completar los datos",
    },
    {
      titulo: "Sucursales",
      detalle: "Cada unidad, lead y venta se asigna a una. El selector de arriba del menú filtra todo el sistema por la que elijas.",
      hecho: Number(suc[0]?.n || 0) > 0,
      falta: "",
      href: "/sucursales",
      accion: "Ver sucursales",
      dato: `${suc[0]?.n || 0} activas`,
    },
    {
      titulo: "Cuentas de caja",
      detalle: "Efectivo, banco, Mercado Pago, dólares. Sin cuentas no se puede registrar de dónde sale ni a dónde entra la plata.",
      hecho: Number(cuentas[0]?.n || 0) > 0,
      falta: "",
      href: "/caja",
      accion: "Ver la caja",
      dato: `${cuentas[0]?.n || 0} cuentas`,
      soloPlata: true,
    },
    {
      titulo: "El equipo",
      detalle: "Cada persona con su usuario y su rol. El vendedor trabaja sin ver costos ni márgenes; eso se define acá y no se puede saltear después.",
      hecho: Number(usuarios[0]?.n || 0) > 1,
      falta: Number(usuarios[0]?.n || 0) <= 1 ? "Todavía sos el único usuario" : "",
      href: "/usuarios",
      accion: "Invitar al equipo",
      dato: `${usuarios[0]?.n || 0} usuarios`,
    },
    {
      titulo: "El stock",
      detalle: "Las unidades que hay en el predio, con su valor de compra y su precio. De acá salen el margen y los días en playón.",
      hecho: Number(vehiculos[0]?.n || 0) > 0,
      falta: "",
      href: "/vehiculos/nuevo",
      accion: "Cargar una unidad",
      dato: `${vehiculos[0]?.n || 0} unidades`,
    },
    {
      titulo: "Catálogo de marcas y modelos",
      detalle: "Sirve para que al dar de alta una unidad se autocomplete y no termines con «Volkswagen», «VW» y «volkswagen» como tres marcas distintas.",
      hecho: Number(catalogo[0]?.n || 0) > 0,
      falta: "",
      href: "/catalogo",
      accion: "Ver el catálogo",
      dato: `${catalogo[0]?.n || 0} marcas`,
    },
    {
      titulo: "Cotización del dólar",
      detalle: "Se trae sola una vez por día y se guarda, así los cálculos viejos no cambian cuando el dólar se mueve. No hay nada que hacer.",
      hecho: Boolean(cot[0]?.valor),
      falta: "",
      href: "/caja",
      accion: "Ver la caja",
      dato: cot[0]?.valor ? `$ ${Number(cot[0].valor).toLocaleString("es-AR")}` : "",
      soloPlata: true,
    },
  ].filter((p) => !p.soloPlata || verPlata);

  const hechos = PASOS.filter((p) => p.hecho).length;
  const listo = hechos === PASOS.length;

  return (
    <>
      <Encabezado titulo="Puesta en marcha"
        detalle="Lo que hace falta para que el sistema quede fino. Se puede usar igual mientras tanto." />

      <Panel className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[15px] font-semibold">
              {listo ? "Está todo listo." : `${hechos} de ${PASOS.length} pasos`}
            </div>
            <p className="text-[12.5px] text-[var(--c-tinta-tenue)] mt-0.5">
              {listo
                ? "No queda nada por configurar. Esta pantalla queda como referencia."
                : "Ninguno es obligatorio para empezar a trabajar."}
            </p>
          </div>
          <div className="min-w-[180px]">
            <Progreso hechos={hechos} total={PASOS.length} />
          </div>
        </div>
      </Panel>

      <div className="space-y-3 max-w-3xl">
        {PASOS.map((p, i) => (
          <Panel key={p.titulo}
            className={p.hecho ? "" : "border-[var(--c-borde-alto)]"}>
            <div className="flex items-start gap-4">
              <div className={`h-7 w-7 shrink-0 rounded-full grid place-items-center text-[12px]
                font-semibold mt-0.5
                ${p.hecho
                  ? "bg-[var(--c-verde-fondo)] border border-[var(--c-verde-borde)] text-[var(--c-verde-alto)]"
                  : "bg-[var(--c-activo)] border border-[var(--c-borde-alto)] text-[var(--c-tinta-media)]"}`}>
                {p.hecho ? <Check size={14} /> : i + 1}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-[14px] font-semibold text-[var(--c-tinta)]">{p.titulo}</h3>
                  {p.dato && <span className="text-[11.5px] text-[var(--c-tinta-tenue)] tabular">{p.dato}</span>}
                </div>
                <p className="text-[12.5px] text-[var(--c-tinta-media)] mt-1 leading-relaxed">{p.detalle}</p>
                {!p.hecho && p.falta && (
                  <p className="text-[12px] text-[var(--c-amarillo)] mt-1.5">{p.falta}</p>
                )}
              </div>

              <div className="shrink-0">
                <Boton href={p.href} variante={p.hecho ? "fantasma" : "suave"}>
                  {p.hecho ? "Revisar" : p.accion}
                </Boton>
              </div>
            </div>
          </Panel>
        ))}
      </div>

      <p className="mt-6 text-[12px] text-[var(--c-tinta-tenue)] max-w-2xl leading-relaxed">
        Si algo de esto no aplica a cómo trabaja Garrahan, decilo y lo sacamos. La lista está
        para que nadie tenga que adivinar qué falta, no para hacer trámites.
      </p>
    </>
  );
}
