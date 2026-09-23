import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { plata, fecha, km as fkm } from "@/lib/format";
import { enLetras } from "@/lib/letras";
import BotonImprimir from "@/components/boton-imprimir";

export const dynamic = "force-dynamic";

/**
 * Mandato de venta: el papel que firma el titular cuando deja la unidad en
 * consignación. Va sobre el vehículo, no sobre una venta, porque se firma
 * antes de que haya comprador.
 */
export default async function Mandato({ params }: { params: Promise<any> }) {
  await requiereSesion();
  const { id } = await params;

  const [v] = await sql`
    SELECT ve.*, s.nombre AS sucursal
    FROM vehiculos ve
    LEFT JOIN sucursales s ON s.id = ve.sucursal_id
    WHERE ve.id = ${id}`;
  if (!v) notFound();

  const [emp] = await sql`SELECT * FROM empresa WHERE id = 1`;
  const e = emp || {};
  const precio = Number(v.precio_venta || 0);
  const minimo = Number(v.precio_minimo || 0);
  const hoy = new Date();

  const L = ({ t, children }: any) => (
    <div className="flex gap-2 py-[3px]">
      <span className="text-[11px] uppercase tracking-wide text-gray-500 w-[120px] shrink-0 print:text-black">{t}</span>
      <span className="text-[12.5px] font-medium">{children ?? "—"}</span>
    </div>
  );

  const CLAUSULAS = [
    <>
      <b>Objeto.</b> El mandante encomienda a {e.razon_social || "Garrahan Automotores"} la
      gestión de venta del vehículo individualizado, quien lo exhibirá y ofrecerá en su
      establecimiento, sin que ello implique transferencia de dominio alguna.
    </>,
    <>
      <b>Precio.</b> La unidad se ofrecerá en {precio > 0 ? plata(precio) : "el precio que las partes acuerden"}
      {minimo > 0 ? <>, no pudiendo el mandatario cerrar operación por debajo de {plata(minimo)} sin
      conformidad previa del mandante</> : null}. La diferencia entre el precio de venta y el
      importe convenido con el mandante corresponde al mandatario en concepto de comisión.
    </>,
    <>
      <b>Documentación.</b> El mandante declara que la unidad se encuentra libre de gravámenes,
      prendas, embargos e inhibiciones, que no registra deuda de patentes ni infracciones
      impagas, y entrega en este acto el título de propiedad, la cédula verde y el formulario
      08 con firma certificada.
    </>,
    <>
      <b>Guarda.</b> El mandatario conservará la unidad en su establecimiento con la diligencia
      de un buen hombre de negocios. Queda autorizado a exhibirla y a realizar pruebas de
      manejo con interesados, bajo su responsabilidad.
    </>,
    <>
      <b>Plazo y revocación.</b> El presente mandato tiene vigencia hasta la venta de la unidad
      y puede ser revocado por el mandante en cualquier momento mediante comunicación
      fehaciente, debiendo retirar el vehículo dentro de las 48 horas de notificada la
      revocación.
    </>,
    <>
      <b>Gastos.</b> Los gastos de acondicionamiento, reparación o gestoría que el mandatario
      realice con conformidad previa del mandante serán descontados del importe a liquidar.
    </>,
    <>
      <b>Jurisdicción.</b> Para cualquier controversia las partes se someten a los tribunales
      ordinarios de Chivilcoy, Provincia de Buenos Aires, renunciando a todo otro fuero.
    </>,
  ];

  return (
    <div className="min-h-screen bg-[#0a0e14] print:bg-white py-8 print:py-0">
      <div className="no-imprimir max-w-[800px] mx-auto mb-4 flex justify-between items-center px-6">
        <a href={`/vehiculos/${id}`} className="text-[13px] text-[#9aa7b8] hover:text-white">
          ← Volver a la unidad
        </a>
        <BotonImprimir />
      </div>

      <div className="hoja max-w-[800px] mx-auto bg-white text-black p-12 rounded-lg
        print:rounded-none shadow-2xl print:shadow-none">

        {/* ------------------------------------------------------ encabezado */}
        <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
          <div>
            <h1 className="text-[19px] font-bold uppercase tracking-tight">
              {e.razon_social || "Garrahan Automotores"}
            </h1>
            <p className="text-[11.5px] text-gray-600 print:text-black mt-1">
              {[e.domicilio, e.localidad, e.provincia].filter(Boolean).join(" · ")}
            </p>
            <p className="text-[11.5px] text-gray-600 print:text-black">
              {e.cuit ? "CUIT " + e.cuit : ""}{e.telefono ? " · Tel. " + e.telefono : ""}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[13px] font-bold uppercase tracking-wide">Mandato de venta</div>
            <div className="text-[11.5px] text-gray-600 print:text-black mt-1">
              Chivilcoy, {fecha(hoy)}
            </div>
          </div>
        </div>

        <p className="text-[12.5px] leading-relaxed mb-6">
          Entre el <b>mandante</b> individualizado a continuación y{" "}
          <b>{e.razon_social || "Garrahan Automotores"}</b>, en adelante el <b>mandatario</b>,
          se conviene el presente mandato de venta sobre el vehículo que se detalla, sujeto a
          las cláusulas que se establecen más abajo.
        </p>

        {/* ---------------------------------------------------------- partes */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          <div>
            <h2 className="text-[11px] uppercase tracking-wide font-bold border-b border-gray-300
              print:border-black pb-1 mb-2">Mandante (titular)</h2>
            <L t="Nombre">{v.titular}</L>
            <L t="DNI / CUIT">{v.dni_titular}</L>
            <L t="Domicilio">
              <span className="inline-block min-w-[160px] border-b border-dotted border-gray-400">&nbsp;</span>
            </L>
            <L t="Teléfono">
              <span className="inline-block min-w-[160px] border-b border-dotted border-gray-400">&nbsp;</span>
            </L>
          </div>
          <div>
            <h2 className="text-[11px] uppercase tracking-wide font-bold border-b border-gray-300
              print:border-black pb-1 mb-2">La unidad</h2>
            <L t="Marca y modelo">{v.marca} {v.modelo} {v.version || ""}</L>
            <L t="Año">{v.anio}</L>
            <L t="Dominio">{v.dominio ? String(v.dominio).toUpperCase() : "—"}</L>
            <L t="Kilómetros">{fkm(v.km)}</L>
            <L t="Motor">{v.nro_motor}</L>
            <L t="Chasis">{v.nro_chasis}</L>
          </div>
        </div>

        {/* ---------------------------------------------------------- precio */}
        {precio > 0 && (
          <div className="border-2 border-black rounded p-4 mb-6">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-wide text-gray-500 print:text-black">
                Precio de venta convenido
              </span>
              <span className="text-[22px] font-bold tabular">{plata(precio)}</span>
            </div>
            <p className="text-[12.5px] italic mt-1.5 capitalize">{enLetras(precio)} pesos argentinos.</p>
            {minimo > 0 && (
              <p className="text-[11.5px] text-gray-600 print:text-black mt-2 pt-2 border-t border-gray-300 print:border-black">
                Precio mínimo autorizado: <b>{plata(minimo)}</b>. Por debajo de ese importe el
                mandatario requerirá conformidad expresa del mandante.
              </p>
            )}
          </div>
        )}

        {/* -------------------------------------------------------- clausulas */}
        <ol className="space-y-2.5 mb-10">
          {CLAUSULAS.map((c, i) => (
            <li key={i} className="flex gap-2.5 text-[11.5px] leading-relaxed">
              <span className="font-bold shrink-0">{i + 1}.</span>
              <span>{c}</span>
            </li>
          ))}
        </ol>

        <p className="text-[11.5px] leading-relaxed mb-12">
          En prueba de conformidad se firman dos ejemplares de un mismo tenor y a un solo
          efecto, en la ciudad de Chivilcoy, a los {hoy.getDate()} días del mes de{" "}
          {hoy.toLocaleDateString("es-AR", { month: "long" })} de {hoy.getFullYear()}.
        </p>

        {/* --------------------------------------------------------- firmas */}
        <div className="grid grid-cols-2 gap-12 mt-16">
          {[
            ["Firma del mandante", v.titular || "Aclaración"],
            ["Por el mandatario", e.razon_social || "Garrahan Automotores"],
          ].map(([t, quien]) => (
            <div key={t as string} className="text-center">
              <div className="border-t border-black pt-1.5 text-[11px] uppercase tracking-wide">{t}</div>
              <div className="text-[11.5px] text-gray-600 print:text-black mt-0.5">{quien}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
