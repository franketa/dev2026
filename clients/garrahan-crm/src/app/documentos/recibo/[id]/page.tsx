import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { plata, fecha } from "@/lib/format";
import { MEDIOS_PAGO } from "@/lib/constantes";
import { enLetras } from "@/lib/letras";
import BotonImprimir from "@/components/boton-imprimir";

export const dynamic = "force-dynamic";

/**
 * Recibo de un cobro puntual. Es el papel que el cliente se lleva cuando
 * deja una seña o paga una cuota, y hoy lo hacen a mano.
 */
export default async function Recibo({ params }: { params: Promise<any> }) {
  await requiereSesion();
  const { id } = await params;

  const [p] = await sql`
    SELECT vp.*, v.id AS venta_id, v.precio, v.descuento,
           x.marca, x.modelo, x.anio, x.dominio,
           c.nombre AS c_nombre, c.apellido AS c_apellido, c.dni_cuit AS c_doc,
           c.direccion AS c_dir, c.localidad AS c_loc,
           us.nombre AS vendedor
    FROM venta_pagos vp
    JOIN ventas v ON v.id = vp.venta_id
    JOIN vehiculos x ON x.id = v.vehiculo_id
    LEFT JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN usuarios us ON us.id = v.vendedor_id
    WHERE vp.id = ${id}`;
  if (!p) notFound();

  const [emp, todos] = await Promise.all([
    sql`SELECT * FROM empresa WHERE id = 1`,
    sql`SELECT monto, moneda, cotizacion FROM venta_pagos WHERE venta_id = ${p.venta_id}`,
  ]);
  const e = emp[0] || {};

  const enPesos = (x: any) => Number(x.monto) * (x.moneda === "USD" ? Number(x.cotizacion || 1) : 1);
  const total = Number(p.precio) - Number(p.descuento);
  const acumulado = todos.reduce((a: number, x: any) => a + enPesos(x), 0);
  const saldo = Math.max(0, total - acumulado);
  const comprador = [p.c_apellido, p.c_nombre].filter(Boolean).join(", ") || "—";

  const L = ({ t, children }: any) => (
    <div className="flex gap-2 py-[3px]">
      <span className="text-[11px] uppercase tracking-wide text-gray-500 w-[120px] shrink-0 print:text-black">{t}</span>
      <span className="text-[12.5px] font-medium">{children ?? "—"}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0e14] print:bg-white py-8 print:py-0">
      <div className="no-imprimir max-w-[800px] mx-auto mb-4 flex justify-between items-center px-6">
        <a href={`/ventas/${p.venta_id}`} className="text-[13px] text-[#9aa7b8] hover:text-white">
          ← Volver a la venta
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
              {e.cuit ? "CUIT " + e.cuit : ""} {e.telefono ? " · Tel. " + e.telefono : ""}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[13px] font-bold uppercase tracking-wide">Recibo</div>
            <div className="text-[19px] font-bold tabular">N° {String(p.id).padStart(6, "0")}</div>
            <div className="text-[11.5px] text-gray-600 print:text-black mt-1">{fecha(p.fecha)}</div>
          </div>
        </div>

        {/* --------------------------------------------------------- importe */}
        <div className="border-2 border-black rounded p-4 mb-6">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-wide text-gray-500 print:text-black">
              Recibí la suma de
            </span>
            <span className="text-[25px] font-bold tabular">
              {plata(p.monto, p.moneda === "USD" ? "USD" : "ARS")}
            </span>
          </div>
          <p className="text-[12.5px] italic mt-2 capitalize">
            {enLetras(Number(p.monto))}
            {p.moneda === "USD" ? " dólares estadounidenses" : " pesos argentinos"}.
          </p>
          {p.moneda === "USD" && (
            <p className="text-[11.5px] text-gray-600 print:text-black mt-1">
              Cotización aplicada: {plata(p.cotizacion)} — equivalente a {plata(enPesos(p))}.
            </p>
          )}
        </div>

        {/* ---------------------------------------------------------- partes */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          <div>
            <h2 className="text-[11px] uppercase tracking-wide font-bold border-b border-gray-300
              print:border-black pb-1 mb-2">De</h2>
            <L t="Nombre">{comprador}</L>
            <L t="DNI / CUIT">{p.c_doc}</L>
            <L t="Domicilio">{[p.c_dir, p.c_loc].filter(Boolean).join(", ") || "—"}</L>
          </div>
          <div>
            <h2 className="text-[11px] uppercase tracking-wide font-bold border-b border-gray-300
              print:border-black pb-1 mb-2">En concepto de</h2>
            <L t="Operación">Venta N° {p.venta_id}</L>
            <L t="Unidad">{p.marca} {p.modelo} {p.anio || ""}</L>
            <L t="Dominio">{p.dominio ? String(p.dominio).toUpperCase() : "—"}</L>
            <L t="Forma de pago">{MEDIOS_PAGO[p.medio] || p.medio}</L>
            {p.referencia && <L t="Referencia">{p.referencia}</L>}
          </div>
        </div>

        {/* ----------------------------------------------------- cómo va la cuenta */}
        <table className="w-full text-[12.5px] mb-8">
          <tbody>
            <tr className="border-b border-gray-200 print:border-black">
              <td className="py-1.5">Total de la operación</td>
              <td className="py-1.5 text-right tabular">{plata(total)}</td>
            </tr>
            <tr className="border-b border-gray-200 print:border-black">
              <td className="py-1.5">Entregado hasta hoy (incluye este recibo)</td>
              <td className="py-1.5 text-right tabular">{plata(acumulado)}</td>
            </tr>
            <tr className="font-bold">
              <td className="py-2">Saldo pendiente</td>
              <td className="py-2 text-right tabular">{plata(saldo)}</td>
            </tr>
          </tbody>
        </table>

        <p className="text-[11px] text-gray-600 print:text-black leading-relaxed mb-10">
          El presente recibo se extiende como constancia del pago detallado y queda sujeto
          a las condiciones del boleto de compraventa de la operación N° {p.venta_id}.
          {saldo > 0 && " No cancela la totalidad de la operación."}
        </p>

        {/* --------------------------------------------------------- firmas */}
        <div className="grid grid-cols-2 gap-12 mt-16">
          {[
            ["Firma y aclaración", comprador],
            ["Por la agencia", p.vendedor || e.razon_social || "Garrahan Automotores"],
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
