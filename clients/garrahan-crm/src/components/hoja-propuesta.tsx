/* eslint-disable @next/next/no-img-element */
import { plata, fecha, km } from "@/lib/format";
import type { DatosPropuesta } from "@/lib/propuestas";

/** El rojo del logo. */
const ROJO = "#e31e24";

/**
 * La propuesta en papel: membrete, las unidades con su precio, el usado que
 * entrega y las condiciones. Es la misma hoja que se imprime desde el sistema
 * y la que el cliente abre en el celular desde el link de WhatsApp, por eso
 * en pantalla chica las fotos van arriba de los datos.
 *
 * Sin <header>: la hoja de impresión esconde los header (son la barra del
 * sistema).
 */
export default function HojaPropuesta({ datos }: { datos: DatosPropuesta }) {
  const { p, items, empresa: e, vence } = datos;
  const toma = Number(p.usado_valor || 0);
  const hayUsado = !!(p.usado_detalle || toma > 0);
  const contactoVendedor = [p.vendedor_tel, p.vendedor_email].filter(Boolean).join(" · ");

  const Etiqueta = ({ children }: any) => (
    <span className="block text-[10.5px] uppercase tracking-[.14em] text-gray-500 print:text-black">{children}</span>
  );

  return (
    <div className="hoja propuesta max-w-[800px] mx-auto bg-white text-black px-5 py-7 sm:p-12 sm:rounded-lg
      print:rounded-none shadow-2xl print:shadow-none">

      {/* ---------------------------------------------------------- membrete */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <img src="/logo-horizontal.png" alt={e.razon_social || "Garrahan Automotores"}
          className="h-8 sm:h-11 w-auto" />
        <div className="sm:text-right">
          <Etiqueta>Propuesta comercial</Etiqueta>
          <span className="block text-[15px] font-bold tabular">N° {String(p.id).padStart(5, "0")}</span>
          <span className="block text-[11.5px] text-gray-600 print:text-black">{fecha(p.creado_en)}</span>
        </div>
      </div>
      <hr className="border-0 h-[3px] mt-4 mb-6 print:mb-4" style={{ background: ROJO }} />

      <section className="grid sm:grid-cols-2 gap-4 mb-2">
        <p>
          <Etiqueta>Para</Etiqueta>
          <span className="block text-[15px] font-semibold mt-0.5">{p.cliente}</span>
        </p>
        {p.vendedor && (
          <p className="sm:text-right">
            <Etiqueta>Lo atiende</Etiqueta>
            <span className="block text-[15px] font-semibold mt-0.5">{p.vendedor}</span>
            {contactoVendedor && <span className="block text-[12px] text-gray-600 print:text-black">{contactoVendedor}</span>}
          </p>
        )}
      </section>

      {/* ---------------------------------------------------------- unidades */}
      {items.map(({ auto: a, precio, moneda }) => {
        const datosAuto: [string, string | null][] = [
          ["Año", a.anio ? String(a.anio) : null],
          ["Kilómetros", a.condicion === "0km" ? "0 km" : km(a.km)],
          ["Combustible", a.combustible],
          ["Transmisión", a.transmision],
          ["Motor", a.motor],
          ["Color", a.color],
        ];
        const conToma = toma > 0 && p.usado_moneda === moneda;
        return (
          <article key={a.id}
            className="grid sm:grid-cols-[42%_1fr] print:grid-cols-[36%_1fr] gap-4 sm:gap-6 py-6 print:py-4 border-t border-gray-200 print:border-gray-400
              break-inside-avoid">
            {/* La foto va encima del recuadro y no adentro: una foto vertical
                estiraba el recuadro al imprimir y el auto pasaba a otra hoja. */}
            <div className="relative self-start w-full aspect-[4/3] rounded-md overflow-hidden bg-gray-100">
              {a.foto
                ? <img src={`/api/fotos/${a.foto}`} alt={`${a.marca} ${a.modelo}`}
                    className="absolute inset-0 w-full h-full object-cover" />
                : <span className="absolute inset-0 grid place-items-center text-[12px] text-gray-400">Sin foto</span>}
            </div>
            <div className="flex flex-col">
              <h2 className="text-[20px] font-bold leading-tight">{a.marca} {a.modelo}</h2>
              {a.version && <p className="text-[13px] text-gray-600 print:text-black mt-0.5">{a.version}</p>}
              <dl className="grid grid-cols-2 gap-x-5 gap-y-1.5 mt-4 print:mt-2 print:gap-y-1">
                {datosAuto.filter(([, v]) => v).map(([t, v]) => (
                  <div key={t}>
                    <dt className="text-[10.5px] uppercase tracking-wide text-gray-500 print:text-black">{t}</dt>
                    <dd className="text-[13px] font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-auto pt-5 print:pt-3">
                <Etiqueta>Precio</Etiqueta>
                <span className="block text-[26px] font-bold tabular leading-tight">{plata(precio, moneda)}</span>
                {conToma && (
                  <span className="block text-[12.5px] mt-1.5">
                    Tomando su usado en {plata(toma, moneda)}, la diferencia es{" "}
                    <b className="text-[14px] tabular">{plata(Math.max(0, precio - toma), moneda)}</b>
                  </span>
                )}
              </div>
            </div>
          </article>
        );
      })}

      {/* ------------------------------------------------- usado y condiciones */}
      {hayUsado && (
        <section className="py-5 print:py-3 border-t border-gray-200 print:border-gray-400 break-inside-avoid">
          <Etiqueta>Su usado</Etiqueta>
          <p className="text-[13.5px] mt-1">
            {p.usado_detalle || "Usado en parte de pago"}
            {toma > 0 && <> — valor de toma <b className="tabular">{plata(toma, p.usado_moneda)}</b></>}
          </p>
        </section>
      )}

      {p.condiciones && (
        <section className="py-5 print:py-3 border-t border-gray-200 print:border-gray-400 break-inside-avoid">
          <Etiqueta>Condiciones</Etiqueta>
          <p className="text-[13.5px] leading-relaxed whitespace-pre-line mt-1">{p.condiciones}</p>
        </section>
      )}

      <p className="text-[11.5px] text-gray-600 print:text-black border-t border-gray-200 print:border-gray-400 pt-4">
        Precios válidos hasta el {fecha(vence)}. Sujeto a disponibilidad de las unidades.
      </p>

      {/* -------------------------------------------------------------- pie */}
      <footer className="mt-10 print:mt-6 pt-4 break-inside-avoid text-center text-[11.5px] text-gray-600 print:text-black"
        style={{ borderTop: `2px solid ${ROJO}` }}>
        <span className="block font-bold text-black text-[12.5px]">{e.razon_social || "Garrahan Automotores"}</span>
        <span className="block mt-0.5">
          {[e.domicilio, e.localidad, e.provincia].filter(Boolean).join(", ")}
        </span>
        <span className="block">
          {[e.telefono && "Tel. " + e.telefono, e.email, "www.garrahanautomotores.com.ar"].filter(Boolean).join(" · ")}
        </span>
      </footer>
    </div>
  );
}
