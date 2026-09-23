import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { plata, fecha, dominio, km as fkm } from "@/lib/format";
import { MEDIOS_PAGO } from "@/lib/constantes";
import BotonImprimir from "@/components/boton-imprimir";
import { enLetras } from "@/lib/letras";

export const dynamic = "force-dynamic";

export default async function Boleto({ params }: { params: Promise<any> }) {
  await requiereSesion();
  const { id } = await params;

  const [v] = await sql`
    SELECT vt.*, ve.dominio, ve.marca, ve.modelo, ve.version, ve.anio, ve.km,
           ve.color, ve.nro_motor, ve.nro_chasis, ve.combustible,
           c.nombre AS c_nombre, c.apellido AS c_apellido, c.dni_cuit AS c_doc,
           c.direccion AS c_dir, c.localidad AS c_loc, c.telefono AS c_tel,
           us.nombre AS vendedor
    FROM ventas vt
    JOIN vehiculos ve ON ve.id = vt.vehiculo_id
    LEFT JOIN clientes c ON c.id = vt.cliente_id
    LEFT JOIN usuarios us ON us.id = vt.vendedor_id
    WHERE vt.id = ${id}`;
  if (!v) notFound();

  const [pagos, emp] = await Promise.all([
    sql`SELECT * FROM venta_pagos WHERE venta_id = ${id} ORDER BY id`,
    sql`SELECT * FROM empresa WHERE id = 1`,
  ]);
  const e = emp[0] || {};
  const final = Number(v.precio) - Number(v.descuento);
  const comprador = [v.c_apellido, v.c_nombre].filter(Boolean).join(", ") || "—";

  const L = ({ t, children }: any) => (
    <div className="flex gap-2 py-[3px]">
      <span className="text-[11px] uppercase tracking-wide text-gray-500 w-[120px] shrink-0 print:text-black">{t}</span>
      <span className="text-[12.5px] font-medium">{children ?? "—"}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--c-fondo)] print:bg-white py-8 print:py-0">
      <div className="no-imprimir max-w-[800px] mx-auto mb-4 flex justify-between items-center px-6">
        <a href={`/ventas/${id}`} className="text-[13px] text-[var(--c-tinta-media)] hover:text-white">← Volver a la venta</a>
        <BotonImprimir />
      </div>

      <div className="hoja max-w-[800px] mx-auto bg-white text-black p-12 rounded-lg print:rounded-none shadow-2xl print:shadow-none">
        {/* ------------------------------------------------------ encabezado */}
        <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
          <div>
            <h1 className="text-[19px] font-bold uppercase tracking-tight">
              {e.razon_social || "Garrahan Automotores"}
            </h1>
            <p className="text-[11px] text-gray-700 mt-0.5">
              {e.domicilio || ""} {e.localidad ? `— ${e.localidad}` : ""}{e.provincia ? `, ${e.provincia}` : ""}
            </p>
            {e.cuit && <p className="text-[11px] text-gray-700">CUIT {e.cuit}</p>}
          </div>
          <div className="text-right">
            <div className="text-[13px] font-bold uppercase">Boleto de compraventa</div>
            <div className="text-[11px] text-gray-700 mt-0.5">N° {String(v.id).padStart(6, "0")}</div>
            <div className="text-[11px] text-gray-700">{fecha(v.fecha)}</div>
          </div>
        </div>

        <p className="text-[12px] leading-relaxed mb-6 text-justify">
          En la ciudad de {e.localidad || "Chivilcoy"}, provincia de {e.provincia || "Buenos Aires"},
          a los {new Date(v.fecha).getDate()} días del mes de{" "}
          {new Date(v.fecha).toLocaleDateString("es-AR", { month: "long" })} de{" "}
          {new Date(v.fecha).getFullYear()}, entre <b>{e.razon_social || "Garrahan Automotores"}</b>,
          en adelante <b>EL VENDEDOR</b>, y <b>{comprador}</b>, en adelante <b>EL COMPRADOR</b>,
          se conviene la compraventa del automotor que se detalla, sujeta a las condiciones
          que se establecen a continuación.
        </p>

        {/* --------------------------------------------------------- partes */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          <div>
            <h2 className="text-[11px] font-bold uppercase border-b border-gray-300 pb-1 mb-2">El comprador</h2>
            <L t="Nombre">{comprador}</L>
            <L t="DNI / CUIT">{v.c_doc}</L>
            <L t="Domicilio">{v.c_dir}</L>
            <L t="Localidad">{v.c_loc}</L>
            <L t="Teléfono">{v.c_tel}</L>
          </div>
          <div>
            <h2 className="text-[11px] font-bold uppercase border-b border-gray-300 pb-1 mb-2">La operación</h2>
            <L t="Fecha">{fecha(v.fecha)}</L>
            <L t="Vendedor">{v.vendedor}</L>
            <L t="Entrega">{v.fecha_entrega ? fecha(v.fecha_entrega) : "A convenir"}</L>
          </div>
        </div>

        {/* -------------------------------------------------------- vehículo */}
        <h2 className="text-[11px] font-bold uppercase border-b border-gray-300 pb-1 mb-2">El automotor</h2>
        <div className="grid grid-cols-2 gap-8 mb-6">
          <div>
            <L t="Marca">{v.marca}</L>
            <L t="Modelo">{v.modelo} {v.version || ""}</L>
            <L t="Año">{v.anio}</L>
            <L t="Dominio">{dominio(v.dominio)}</L>
            <L t="Kilometraje">{fkm(v.km)}</L>
          </div>
          <div>
            <L t="N° de motor">{v.nro_motor}</L>
            <L t="N° de chasis">{v.nro_chasis}</L>
            <L t="Color">{v.color}</L>
            <L t="Combustible">{v.combustible}</L>
          </div>
        </div>

        {/* ---------------------------------------------------------- precio */}
        <h2 className="text-[11px] font-bold uppercase border-b border-gray-300 pb-1 mb-2">Precio y forma de pago</h2>
        <table className="w-full text-[12px] mb-3">
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="py-1.5">Precio convenido</td>
              <td className="py-1.5 text-right tabular">{plata(v.precio)}</td>
            </tr>
            {Number(v.descuento) > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5">Bonificación</td>
                <td className="py-1.5 text-right tabular">− {plata(v.descuento)}</td>
              </tr>
            )}
            <tr className="border-b-2 border-black font-bold">
              <td className="py-2">Total</td>
              <td className="py-2 text-right tabular">{plata(final)}</td>
            </tr>
          </tbody>
        </table>

        <p className="text-[11.5px] italic mb-4">
          Son pesos {enLetras(final)} con 00/100.
        </p>

        {pagos.length > 0 && (
          <table className="w-full text-[12px] mb-6">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left py-1 text-[10.5px] uppercase text-gray-600">Medio</th>
                <th className="text-left py-1 text-[10.5px] uppercase text-gray-600">Referencia</th>
                <th className="text-right py-1 text-[10.5px] uppercase text-gray-600">Importe</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((p: any) => (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="py-1.5">{MEDIOS_PAGO[p.medio] || p.medio}</td>
                  <td className="py-1.5 text-gray-600">{p.referencia || "—"}</td>
                  <td className="py-1.5 text-right tabular">{plata(p.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* -------------------------------------------------------- cláusulas */}
        <h2 className="text-[11px] font-bold uppercase border-b border-gray-300 pb-1 mb-2">Condiciones</h2>
        <ol className="text-[11px] leading-relaxed space-y-1.5 mb-8 list-decimal pl-4 text-justify">
          <li>EL COMPRADOR declara conocer y aceptar el estado general del automotor, que recibe
            en el estado en que se encuentra y que ha revisado a su entera satisfacción.</li>
          <li>EL VENDEDOR se obliga a entregar la documentación necesaria para la transferencia
            de dominio ante el Registro Nacional de la Propiedad del Automotor.</li>
          <li>Los gastos de transferencia, sellados, formularios y gestoría son a cargo de
            EL COMPRADOR, salvo pacto expreso en contrario.</li>
          <li>Las multas, infracciones y deudas de patente anteriores a la fecha del presente
            quedan a cargo de EL VENDEDOR; las posteriores, a cargo de EL COMPRADOR.</li>
          <li>La falta de pago en término de cualquiera de los importes convenidos faculta a
            EL VENDEDOR a rescindir el presente sin necesidad de interpelación previa.</li>
        </ol>

        {v.observaciones && (
          <div className="mb-8">
            <h2 className="text-[11px] font-bold uppercase border-b border-gray-300 pb-1 mb-2">Observaciones</h2>
            <p className="text-[11.5px] whitespace-pre-line">{v.observaciones}</p>
          </div>
        )}

        {/* ---------------------------------------------------------- firmas */}
        <div className="grid grid-cols-2 gap-16 mt-16">
          {["El vendedor", "El comprador"].map((t) => (
            <div key={t} className="text-center">
              <div className="border-t border-black pt-2">
                <div className="text-[11px] font-semibold uppercase">{t}</div>
                <div className="text-[10px] text-gray-600 mt-0.5">Firma y aclaración</div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[9.5px] text-gray-500 text-center mt-10">
          Se firman dos ejemplares de un mismo tenor y a un solo efecto.
        </p>
      </div>
    </div>
  );
}
