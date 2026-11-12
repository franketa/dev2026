import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { requierePermiso } from "@/lib/auth";
import { plata, fecha, dominio, km as fkm } from "@/lib/format";
import { MEDIOS_PAGO } from "@/lib/constantes";
import BotonImprimir from "@/components/boton-imprimir";
import UnaHoja from "@/components/una-hoja";
import { enLetras } from "@/lib/letras";

export const dynamic = "force-dynamic";

export default async function Boleto({ params }: { params: Promise<any> }) {
  await requierePermiso("ventas");
  const { id } = await params;

  const [v] = await sql`
    SELECT vt.*, ve.dominio, ve.marca, ve.modelo, ve.version, ve.anio, ve.km,
           ve.color, ve.nro_motor, ve.nro_chasis, ve.combustible,
           c.nombre AS c_nombre, c.apellido AS c_apellido, c.dni_cuit AS c_doc,
           c.direccion AS c_dir, c.localidad AS c_loc, c.telefono AS c_tel,
           us.nombre AS vendedor,
           pv.marca AS p_marca, pv.modelo AS p_modelo, pv.version AS p_version, pv.anio AS p_anio,
           pv.dominio AS p_dominio, pv.km AS p_km, pv.nro_motor AS p_motor, pv.nro_chasis AS p_chasis
    FROM ventas vt
    JOIN vehiculos ve ON ve.id = vt.vehiculo_id
    LEFT JOIN vehiculos pv ON pv.id = vt.permuta_vehiculo_id
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
  const enPesos = (p: any) => Number(p.monto) * (p.moneda === "USD" ? Number(p.cotizacion || 1) : 1);
  // El usado que se toma es parte del pago: se muestra aparte, con sus datos,
  // y lo que queda es la diferencia que el comprador abona.
  const tomas = pagos.filter((p: any) => p.medio === "permuta");
  const toma = tomas.length ? tomas.reduce((a: number, p: any) => a + enPesos(p), 0) : Number(v.permuta_valor || 0);
  const entregas = pagos.filter((p: any) => p.medio !== "permuta");
  const entregado = entregas.reduce((a: number, p: any) => a + enPesos(p), 0);
  const diferencia = final - toma;
  const saldo = Math.max(0, diferencia - entregado);
  const comprador = [v.c_apellido, v.c_nombre].filter(Boolean).join(", ") || "—";
  const faltan = !v.cliente_id ? ["todo: no hay comprador cargado"]
    : [!v.c_doc && "el DNI", !v.c_dir && "el domicilio", !v.c_loc && "la localidad"].filter(Boolean) as string[];

  const L = ({ t, children }: any) => (
    <div className="flex gap-2 py-[2px]">
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
      {faltan.length > 0 && (
        <div className="no-imprimir max-w-[800px] mx-auto mb-4 px-6">
          <p className="rounded-lg border border-[var(--c-amarillo-borde)] bg-[var(--c-amarillo-fondo)] px-4 py-2.5
            text-[13px] text-[var(--c-tinta-clara)]">
            Al comprador le falta {faltan.join(", ")}: sale en blanco.{" "}
            <a href={`/ventas/${id}`} className="text-[var(--c-enlace)] underline">Completalo en la venta</a>
            {" "}(panel Comprador) y volvé a abrir el boleto.
          </p>
        </div>
      )}

      <div className="hoja boleto max-w-[800px] mx-auto bg-white text-black p-10 rounded-lg print:rounded-none shadow-2xl print:shadow-none">
        <UnaHoja />
        {/* ------------------------------------------------------ encabezado */}
        <div className="flex items-start gap-4 border-b-2 border-black pb-3 mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Garrahan" className="h-14 w-14 shrink-0" />
          <div>
            <h1 className="text-[19px] font-bold uppercase tracking-tight">
              {e.razon_social || "Garrahan Automotores"}
            </h1>
            <p className="text-[11px] text-gray-700 mt-0.5">
              {e.domicilio || ""} {e.localidad ? `— ${e.localidad}` : ""}{e.provincia ? `, ${e.provincia}` : ""}
            </p>
            {e.cuit && <p className="text-[11px] text-gray-700">CUIT {e.cuit}</p>}
          </div>
          <div className="text-right ml-auto">
            <div className="text-[13px] font-bold uppercase">Boleto de compraventa</div>
            <div className="text-[11px] text-gray-700 mt-0.5">N° {String(v.nro_boleto ?? v.id).padStart(6, "0")}</div>
            <div className="text-[11px] text-gray-700">{fecha(v.fecha)}</div>
          </div>
        </div>

        <p className="text-[11.5px] leading-snug mb-4 text-justify">
          En la ciudad de {e.localidad || "Chivilcoy"}, provincia de {e.provincia || "Buenos Aires"},
          a los {new Date(v.fecha).getUTCDate()} días del mes de{" "}
          {new Date(v.fecha).toLocaleDateString("es-AR", { month: "long", timeZone: "UTC" })} de{" "}
          {new Date(v.fecha).getUTCFullYear()}, entre <b>{e.razon_social || "Garrahan Automotores"}</b>,
          en adelante <b>EL VENDEDOR</b>, y <b>{comprador}</b>, en adelante <b>EL COMPRADOR</b>,
          se conviene la compraventa del automotor que se detalla, sujeta a las condiciones
          que se establecen a continuación.
        </p>

        {/* --------------------------------------------------------- partes */}
        <div className="grid grid-cols-2 gap-8 mb-4">
          <div>
            <h2 className="text-[11px] font-bold uppercase border-b border-gray-300 pb-1 mb-1.5">El comprador</h2>
            <L t="Nombre">{comprador}</L>
            <L t="DNI / CUIT">{v.c_doc}</L>
            <L t="Domicilio">{[v.c_dir, v.c_loc].filter(Boolean).join(", ") || null}</L>
            <L t="Teléfono">{v.c_tel}</L>
          </div>
          <div>
            <h2 className="text-[11px] font-bold uppercase border-b border-gray-300 pb-1 mb-1.5">La operación</h2>
            <L t="Vendedor">{v.vendedor}</L>
            <L t="Entrega">{v.fecha_entrega ? fecha(v.fecha_entrega) : "A convenir"}</L>
          </div>
        </div>

        {/* -------------------------------------------------------- vehículo */}
        <h2 className="text-[11px] font-bold uppercase border-b border-gray-300 pb-1 mb-1.5">El automotor</h2>
        <div className="grid grid-cols-2 gap-8 mb-4">
          <div>
            <L t="Marca">{v.marca}</L>
            <L t="Modelo">{v.modelo} {v.version || ""}</L>
            <L t="Año">{v.anio}</L>
            <L t="Dominio">{dominio(v.dominio)}</L>
          </div>
          <div>
            <L t="N° de motor">{v.nro_motor}</L>
            <L t="N° de chasis">{v.nro_chasis}</L>
            <L t="Color">{v.color}</L>
            <L t="Combustible">{v.combustible}</L>
            <L t="Kilometraje">{fkm(v.km)}</L>
          </div>
        </div>

        {/* ---------------------------------------------------------- precio */}
        <h2 className="text-[11px] font-bold uppercase border-b border-gray-300 pb-1 mb-1.5">Precio y forma de pago</h2>
        <table className="w-full text-[12px] mb-2">
          <tbody>
            {Number(v.descuento) > 0 && (
              <>
                <tr className="border-b border-gray-200">
                  <td className="py-1">Precio convenido</td>
                  <td className="py-1 text-right tabular">{plata(v.precio)}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-1">Bonificación</td>
                  <td className="py-1 text-right tabular">− {plata(v.descuento)}</td>
                </tr>
              </>
            )}
            <tr className={`font-bold ${toma > 0 ? "border-b border-gray-300" : "border-b-2 border-black"}`}>
              <td className="py-1">{Number(v.descuento) > 0 ? "Total" : "Precio convenido"}</td>
              <td className="py-1 text-right tabular">{plata(final)}</td>
            </tr>
            {toma > 0 && (
              <>
                <tr className="border-b border-gray-200">
                  <td className="py-1">Menos: usado que se recibe en parte de pago (detallado abajo)</td>
                  <td className="py-1 text-right tabular">− {plata(toma)}</td>
                </tr>
                <tr className="border-b-2 border-black font-bold">
                  <td className="py-1">Diferencia a abonar</td>
                  <td className="py-1 text-right tabular">{plata(diferencia)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>

        <p className="text-[11px] italic mb-3">
          Son pesos {enLetras(final)} con 00/100{toma > 0 ? `, de los cuales pesos ${enLetras(toma)} se cancelan con el usado entregado en parte de pago` : ""}.
        </p>

        {toma > 0 && (
          <div className="mb-3">
            <h3 className="text-[10.5px] font-bold uppercase text-gray-600 mb-1">Usado que entrega EL COMPRADOR en parte de pago</h3>
            {v.p_marca ? (
              <div className="grid grid-cols-2 gap-x-8">
                <div>
                  <L t="Vehículo">{[v.p_marca, v.p_modelo, v.p_version].filter(Boolean).join(" ")}</L>
                  <L t="Año / Km">{[v.p_anio, v.p_km ? fkm(v.p_km) : null].filter(Boolean).join(" · ") || "—"}</L>
                  <L t="Dominio">{dominio(v.p_dominio)}</L>
                </div>
                <div>
                  <L t="N° de motor">{v.p_motor}</L>
                  <L t="N° de chasis">{v.p_chasis}</L>
                  <L t="Valor de toma">{plata(toma)}</L>
                </div>
              </div>
            ) : (
              <L t="Detalle">{tomas.map((p: any) => p.referencia).filter(Boolean).join(" · ") || "Usado"} — {plata(toma)}</L>
            )}
          </div>
        )}

        {entregas.length > 0 && (
          <table className="w-full text-[11.5px] mb-2">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left py-1 text-[10.5px] uppercase text-gray-600">Entregado</th>
                <th className="text-left py-1 text-[10.5px] uppercase text-gray-600">Referencia</th>
                <th className="text-right py-1 text-[10.5px] uppercase text-gray-600">Importe</th>
              </tr>
            </thead>
            <tbody>
              {entregas.map((p: any) => (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="py-1">{MEDIOS_PAGO[p.medio] || p.medio}{p.es_sena ? " (seña)" : ""}</td>
                  <td className="py-1 text-gray-600">{p.referencia || "—"}</td>
                  <td className="py-1 text-right tabular">
                    {p.moneda === "USD" ? `${plata(p.monto, "USD")} (${plata(enPesos(p))})` : plata(p.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <table className="w-full text-[11.5px] mb-4">
          <tbody>
            <tr className="font-bold">
              <td className="py-1">{saldo > 0 ? "Saldo pendiente de pago" : "Operación saldada"}</td>
              <td className="py-1 text-right tabular">{saldo > 0 ? plata(saldo) : ""}</td>
            </tr>
          </tbody>
        </table>

        {/* -------------------------------------------------------- cláusulas */}
        <h2 className="text-[11px] font-bold uppercase border-b border-gray-300 pb-1 mb-1.5">Condiciones</h2>
        <ol className="text-[10.5px] leading-snug space-y-1 mb-5 list-decimal pl-4 text-justify">
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
          <div className="mb-5">
            <h2 className="text-[11px] font-bold uppercase border-b border-gray-300 pb-1 mb-1.5">Observaciones</h2>
            <p className="text-[11px] whitespace-pre-line">{v.observaciones}</p>
          </div>
        )}

        {/* ---------------------------------------------------------- firmas */}
        <div className="grid grid-cols-2 gap-16 mt-10">
          {["El vendedor", "El comprador"].map((t) => (
            <div key={t} className="text-center">
              <div className="border-t border-black pt-2">
                <div className="text-[11px] font-semibold uppercase">{t}</div>
                <div className="text-[10px] text-gray-600 mt-0.5">Firma y aclaración</div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[9.5px] text-gray-500 text-center mt-5">
          Se firman dos ejemplares de un mismo tenor y a un solo efecto.
        </p>
      </div>
    </div>
  );
}
