import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { avisoOk, avisoError } from "@/lib/aviso";
import { sql } from "@/lib/db";
import { requierePermiso } from "@/lib/auth";
import { puedeVerLead } from "@/lib/leads";
import { plata, km } from "@/lib/format";
import { ESTADOS_VEHICULO } from "@/lib/constantes";
import { MAX_UNIDADES, nuevoToken, nombreAuto, type Unidad, type Moneda } from "@/lib/propuestas";
import { Encabezado, Panel, Boton } from "@/components/ui";
import ArmarPropuesta, { type InicialPropuesta } from "@/components/armar-propuesta";

export const dynamic = "force-dynamic";

const moneda = (v: any): Moneda => (v === "USD" ? "USD" : "ARS");

/**
 * Armar (o corregir) la propuesta para un lead. Corregir no cambia el link:
 * si ya se mandó por WhatsApp, el cliente ve la versión nueva.
 */
export default async function NuevaPropuesta({ params, searchParams }:
  { params: Promise<any>; searchParams: Promise<any> }) {
  const u = await requierePermiso("leads");
  const { id } = await params;
  const { editar } = await searchParams;
  if (!(await puedeVerLead(u, Number(id)))) notFound();

  const [l] = await sql`SELECT id, nombre, vehiculo_id, usado_detalle, tasacion, entrega_usado
                        FROM leads WHERE id = ${id}`;
  if (!l) notFound();
  const [previa] = editar
    ? await sql`SELECT * FROM propuestas WHERE id = ${Number(editar) || 0} AND lead_id = ${id}`
    : [];
  if (editar && !previa) notFound();

  const enPropuesta: number[] = (previa?.unidades || []).map((x: any) => Number(x.vehiculo_id));
  const vehiculos = await sql`
    SELECT id, marca, modelo, version, anio, km, condicion, dominio, estado,
           precio_venta, precio_oferta, moneda_venta
    FROM vehiculos
    WHERE estado NOT IN ('vendido','baja','reservado') OR id IN ${sql(enPropuesta.length ? enPropuesta : [0])}
    ORDER BY marca, modelo, anio DESC NULLS LAST, id`;

  // El precio que se sugiere es el de la web: el de oferta, si tiene.
  const opciones = vehiculos.map((v: any) => ({
    id: v.id,
    etiqueta: [
      [v.marca, v.modelo, v.version, v.anio].filter(Boolean).join(" "),
      v.condicion === "0km" ? "0 km" : km(v.km),
      v.dominio ? String(v.dominio).toUpperCase() : null,
      v.estado !== "disponible" ? (ESTADOS_VEHICULO[v.estado]?.label || v.estado).toLowerCase() : null,
    ].filter(Boolean).join(" · "),
    precio: Math.round(Number(v.precio_oferta) > 0 ? Number(v.precio_oferta) : Number(v.precio_venta || 0)),
    moneda: moneda(v.moneda_venta),
  }));

  const inicial: InicialPropuesta = previa ? {
    cliente: previa.cliente,
    unidades: previa.unidades,
    usado_detalle: previa.usado_detalle || "",
    usado_valor: previa.usado_valor ? String(Math.round(Number(previa.usado_valor))) : "",
    usado_moneda: moneda(previa.usado_moneda),
    condiciones: previa.condiciones || "",
    validez_dias: String(previa.validez_dias),
  } : {
    cliente: l.nombre,
    // Arranca con el auto que consultó, si sigue en venta.
    unidades: opciones.filter((o: any) => o.id === l.vehiculo_id)
      .map((o: any) => ({ vehiculo_id: o.id, precio: o.precio, moneda: o.moneda })),
    usado_detalle: l.entrega_usado ? l.usado_detalle || "" : "",
    usado_valor: l.entrega_usado && Number(l.tasacion) > 0 ? String(Math.round(Number(l.tasacion))) : "",
    usado_moneda: "ARS",
    condiciones: "",
    validez_dias: "7",
  };

  async function guardar(fd: FormData) {
    "use server";
    const usr = await requierePermiso("leads");
    if (!(await puedeVerLead(usr, Number(id)))) return avisoError("Ese lead no es tuyo.");

    const cliente = String(fd.get("cliente") || "").trim();
    if (!cliente) return avisoError("Falta para quién es la propuesta.");

    const ids = fd.getAll("u_vehiculo").map((x) => Number(x));
    const precios = fd.getAll("u_precio").map((x) => Number(x));
    const monedas = fd.getAll("u_moneda").map(moneda);
    const unidades: Unidad[] = [];
    for (let i = 0; i < ids.length; i++) {
      if (!ids[i]) continue;
      if (unidades.some((x) => x.vehiculo_id === ids[i])) return avisoError("Hay un auto repetido.");
      if (!(precios[i] > 0)) return avisoError("Falta el precio de algún auto.");
      unidades.push({ vehiculo_id: ids[i], precio: Math.round(precios[i]), moneda: monedas[i] });
    }
    if (!unidades.length) return avisoError("Elegí al menos un auto.");
    if (unidades.length > MAX_UNIDADES) return avisoError(`Hasta ${MAX_UNIDADES} autos por propuesta.`);

    const autos = await sql`SELECT id, marca, modelo, anio FROM vehiculos
                            WHERE id IN ${sql(unidades.map((x) => x.vehiculo_id))}`;
    if (autos.length !== unidades.length) return avisoError("Algún auto ya no está en el sistema.");

    const valor = Math.round(Number(fd.get("usado_valor") || 0));
    const datos = {
      cliente,
      unidades: sql.json(unidades as any),
      usado_detalle: String(fd.get("usado_detalle") || "").trim() || null,
      usado_valor: valor > 0 ? valor : null,
      usado_moneda: moneda(fd.get("usado_moneda")),
      condiciones: String(fd.get("condiciones") || "").trim() || null,
      validez_dias: Math.min(90, Math.max(1, Math.round(Number(fd.get("validez_dias") || 7)))),
    };
    const resumen = unidades.map((x) =>
      `${nombreAuto(autos.find((a: any) => a.id === x.vehiculo_id))} (${plata(x.precio, x.moneda)})`).join(" · ");

    let pid: number;
    if (previa) {
      pid = previa.id;
      await sql`UPDATE propuestas SET ${sql(datos)} WHERE id = ${pid}`;
      await sql`INSERT INTO lead_interacciones (lead_id, tipo, detalle, usuario_id)
                VALUES (${id}, 'cotizacion', ${`Propuesta N° ${pid} corregida: ${resumen}`}, ${usr.id})`;
    } else {
      const [n] = await sql`INSERT INTO propuestas ${sql({ ...datos, token: nuevoToken(), lead_id: Number(id), usuario_id: usr.id })}
                            RETURNING id`;
      pid = n.id;
      await sql`INSERT INTO lead_interacciones (lead_id, tipo, detalle, usuario_id)
                VALUES (${id}, 'cotizacion', ${`Propuesta N° ${pid}: ${resumen}`}, ${usr.id})`;
    }
    await sql`UPDATE leads SET actualizado_en = now() WHERE id = ${id}`;
    revalidatePath(`/leads/${id}`);
    await avisoOk(previa ? "Propuesta corregida" : "Propuesta lista");
    redirect(`/documentos/propuesta/${pid}`);
  }

  return (
    <>
      <Encabezado volver={previa ? `/documentos/propuesta/${previa.id}` : `/leads/${id}`}
        titulo={previa ? `Corregir propuesta N° ${previa.id}` : "Armar propuesta"}
        detalle={`Para ${l.nombre}. Sale con el membrete de la agencia, para imprimir o mandar por WhatsApp.`} />
      <Panel>
        <form action={guardar} className="space-y-6">
          <ArmarPropuesta vehiculos={opciones} inicial={inicial} max={MAX_UNIDADES} />
          <div className="flex justify-end">
            <Boton tipo="submit">{previa ? "Guardar cambios" : "Ver la propuesta"}</Boton>
          </div>
        </form>
      </Panel>
    </>
  );
}
