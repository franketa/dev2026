import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Phone, MessageCircle, Mail, Receipt, CalendarClock } from "lucide-react";
import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { plata, fecha, numero } from "@/lib/format";
import { ESTADOS_LEAD, ETAPAS_LEAD, ORIGENES_LEAD } from "@/lib/constantes";
import {
  Encabezado, Panel, PanelTitulo, Chip, Boton, Dato, Campo, Etapas,
} from "@/components/ui";
import SelectEstado from "@/components/select-estado";

export const dynamic = "force-dynamic";

const TIPOS_INTERACCION: Record<string, { label: string; icono: string }> = {
  llamada:    { label: "Llamada",     icono: "☎" },
  whatsapp:   { label: "WhatsApp",    icono: "✆" },
  email:      { label: "Email",       icono: "✉" },
  visita:     { label: "Visita",      icono: "◉" },
  test_drive: { label: "Test drive",  icono: "▸" },
  cotizacion: { label: "Cotización",  icono: "§" },
  nota:       { label: "Nota",        icono: "•" },
  cambio_estado: { label: "Cambio de estado", icono: "→" },
};

/** Solo dígitos: es lo que espera wa.me. */
function soloNumeros(t: string | null) {
  const n = (t || "").replace(/\D/g, "");
  if (!n) return null;
  return n.startsWith("54") ? n : "54" + n;
}

export default async function Lead({ params }: { params: Promise<any> }) {
  const u = await requiereSesion();
  const { id } = await params;

  const [l] = await sql`
    SELECT l.*, v.marca, v.modelo, v.anio, v.dominio, v.precio_venta,
           us.nombre AS asesor, s.nombre AS sucursal,
           c.nombre AS cliente_nombre, c.apellido AS cliente_apellido
    FROM leads l
    LEFT JOIN vehiculos v ON v.id = l.vehiculo_id
    LEFT JOIN usuarios us ON us.id = l.asesor_id
    LEFT JOIN sucursales s ON s.id = l.sucursal_id
    LEFT JOIN clientes c ON c.id = l.cliente_id
    WHERE l.id = ${id}`;
  if (!l) notFound();

  const [interacciones, venta] = await Promise.all([
    sql`SELECT i.*, us.nombre AS usuario FROM lead_interacciones i
        LEFT JOIN usuarios us ON us.id = i.usuario_id
        WHERE i.lead_id = ${id} ORDER BY i.fecha DESC, i.id DESC`,
    sql`SELECT id, estado FROM ventas WHERE lead_id = ${id} ORDER BY id DESC LIMIT 1`,
  ]);

  const e = ESTADOS_LEAD[l.estado] || { label: l.estado, tono: "gris" as const, etapa: "captacion" };
  const iEtapa = ETAPAS_LEAD.findIndex((x) => x.valor === e.etapa);
  const wa = soloNumeros(l.telefono);
  const cerrado = ["vendido", "perdido"].includes(l.estado);

  /* ------------------------------------------------------------ acciones */
  async function registrar(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    const detalle = String(fd.get("detalle") || "").trim();
    if (!detalle) return;
    await sql`INSERT INTO lead_interacciones (lead_id, tipo, detalle, usuario_id)
              VALUES (${id}, ${String(fd.get("tipo") || "nota")}, ${detalle}, ${usr.id})`;

    // Si la interacción trae la próxima acción, se pisa la anterior: es la vigente.
    const prox = String(fd.get("proxima_accion") || "").trim();
    const cuando = String(fd.get("fecha_proxima") || "").trim();
    if (prox || cuando) {
      await sql`UPDATE leads SET proxima_accion = COALESCE(NULLIF(${prox}, ''), proxima_accion),
                                 fecha_proxima  = COALESCE(NULLIF(${cuando}, '')::date, fecha_proxima),
                                 actualizado_en = now()
                WHERE id = ${id}`;
    } else {
      await sql`UPDATE leads SET actualizado_en = now() WHERE id = ${id}`;
    }
    revalidatePath(`/leads/${id}`);
  }

  async function cambiarEstado(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    const nuevo = String(fd.get("estado") || "");
    const etapa = ESTADOS_LEAD[nuevo]?.etapa;
    if (!etapa) return;
    await sql`UPDATE leads SET estado = ${nuevo}, etapa = ${etapa}, actualizado_en = now()
              WHERE id = ${id}`;
    await sql`INSERT INTO lead_interacciones (lead_id, tipo, detalle, usuario_id)
              VALUES (${id}, 'cambio_estado', ${"Pasó a " + ESTADOS_LEAD[nuevo].label}, ${usr.id})`;
    revalidatePath(`/leads/${id}`);
  }

  async function marcarPerdido(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    const motivo = String(fd.get("motivo") || "").trim();
    await sql`UPDATE leads SET estado = 'perdido', etapa = 'cerrado',
                               motivo_perdida = ${motivo || null}, actualizado_en = now()
              WHERE id = ${id}`;
    await sql`INSERT INTO lead_interacciones (lead_id, tipo, detalle, usuario_id)
              VALUES (${id}, 'cambio_estado', ${"Perdido" + (motivo ? ": " + motivo : "")}, ${usr.id})`;
    revalidatePath(`/leads/${id}`);
  }

  return (
    <>
      <Encabezado volver="/leads"
        titulo={<span className="flex items-center gap-3 flex-wrap">{l.nombre}<Chip tono={e.tono}>{e.label}</Chip></span>}
        detalle={`${ORIGENES_LEAD[l.origen] || l.origen} · ingresó el ${fecha(l.creado_en)}`}
        acciones={
          <>
            {wa && (
              <Boton href={`https://wa.me/${wa}`} variante="exito" target="_blank" rel="noopener noreferrer">
                <MessageCircle size={15} /> WhatsApp
              </Boton>
            )}
            {l.telefono && (
              <Boton href={`tel:${l.telefono}`} variante="suave"><Phone size={15} /> Llamar</Boton>
            )}
            {venta.length > 0 ? (
              <Boton href={`/ventas/${venta[0].id}`}><Receipt size={15} /> Ver la venta</Boton>
            ) : l.vehiculo_id && !cerrado ? (
              <Boton href={`/ventas/nueva?vehiculo=${l.vehiculo_id}&lead=${l.id}`}>
                <Receipt size={15} /> Pasar a venta
              </Boton>
            ) : null}
          </>
        } />

      <div className="grid lg:grid-cols-3 gap-4">
        {/* ------------------------------------------------------- columna 1 */}
        <div className="lg:col-span-2 space-y-4">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="etiqueta block mb-2">Etapa del embudo</span>
                <Etapas indice={iEtapa} total={ETAPAS_LEAD.length}
                  etiqueta={ETAPAS_LEAD[iEtapa]?.label} />
              </div>
              <div>
                <span className="etiqueta block mb-2">Cambiar estado</span>
                <SelectEstado id={Number(id)} valor={l.estado} accion={cambiarEstado}
                  opciones={Object.entries(ESTADOS_LEAD).map(([v, x]) => ({ valor: v, label: x.label }))} />
              </div>
            </div>
          </Panel>

          {/* ------------------------------------------------- nueva interacción */}
          <Panel>
            <PanelTitulo titulo="Registrar seguimiento"
              detalle="Cada contacto queda anotado. Es lo que permite retomar la conversación." />
            <form action={registrar} className="space-y-4">
              <div className="grid sm:grid-cols-4 gap-4">
                <Campo label="Tipo">
                  <select name="tipo" className="campo" defaultValue="llamada">
                    {Object.entries(TIPOS_INTERACCION)
                      .filter(([v]) => v !== "cambio_estado")
                      .map(([v, x]) => <option key={v} value={v}>{x.label}</option>)}
                  </select>
                </Campo>
                <Campo label="Qué pasó" ancho="sm:col-span-3">
                  <input name="detalle" required className="campo"
                    placeholder="Atendió, pidió ver la Amarok el sábado a la mañana" />
                </Campo>
                <Campo label="Próxima acción" ancho="sm:col-span-2">
                  <input name="proxima_accion" className="campo" placeholder="Confirmar la visita" />
                </Campo>
                <Campo label="Para cuándo">
                  <input name="fecha_proxima" type="date" className="campo" />
                </Campo>
                <div className="flex items-end">
                  <Boton tipo="submit" className="w-full">Guardar</Boton>
                </div>
              </div>
            </form>
          </Panel>

          {/* ---------------------------------------------------------- historial */}
          <Panel>
            <PanelTitulo titulo="Historial"
              detalle={`${numero(interacciones.length)} ${interacciones.length === 1 ? "registro" : "registros"}`} />
            {interacciones.length === 0 ? (
              <p className="text-[13px] text-[#64748b] py-10 text-center">
                Todavía no hay seguimiento cargado.
              </p>
            ) : (
              <ol className="relative border-l border-[#1f2937] ml-2 space-y-5">
                {interacciones.map((i: any) => {
                  const t = TIPOS_INTERACCION[i.tipo] || TIPOS_INTERACCION.nota;
                  return (
                    <li key={i.id} className="ml-5">
                      <span className="absolute -left-[7px] mt-1 h-3.5 w-3.5 rounded-full
                        bg-[#151d29] border border-[#334155] grid place-items-center
                        text-[8px] text-[#9aa7b8]">{t.icono}</span>
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <span className="text-[12.5px] font-semibold text-[#e8edf5]">{t.label}</span>
                        <span className="text-[11.5px] text-[#64748b]">
                          {fecha(i.fecha)} · {i.usuario || "sistema"}
                        </span>
                      </div>
                      <p className="text-[13px] text-[#cbd5e1] mt-1 leading-relaxed">{i.detalle}</p>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        </div>

        {/* ------------------------------------------------------- columna 2 */}
        <div className="space-y-4">
          {l.fecha_proxima && !cerrado && (
            <Panel className="border-[#1e3a8a]">
              <div className="flex items-start gap-3">
                <CalendarClock size={18} className="text-[#60a5fa] mt-0.5 shrink-0" />
                <div>
                  <span className="etiqueta block">Próxima acción</span>
                  <p className="text-[13.5px] text-[#e8edf5] mt-1">{l.proxima_accion || "Sin detalle"}</p>
                  <p className="text-[12px] text-[#60a5fa] mt-0.5">{fecha(l.fecha_proxima)}</p>
                </div>
              </div>
            </Panel>
          )}

          <Panel>
            <PanelTitulo titulo="Contacto" />
            <Dato label="Teléfono">{l.telefono || "—"}</Dato>
            <Dato label="Email">{l.email || "—"}</Dato>
            <Dato label="Origen">{ORIGENES_LEAD[l.origen] || l.origen}</Dato>
            <Dato label="Asesor">{l.asesor || "Sin asignar"}</Dato>
            <Dato label="Sucursal">{l.sucursal || "—"}</Dato>
            {l.cliente_nombre && (
              <Dato label="Cliente">
                <Link href="/clientes" className="text-[#60a5fa] hover:underline">
                  {l.cliente_nombre} {l.cliente_apellido || ""}
                </Link>
              </Dato>
            )}
          </Panel>

          <Panel>
            <PanelTitulo titulo="Qué busca" />
            <Dato label="Unidad">
              {l.vehiculo_id ? (
                <Link href={`/vehiculos/${l.vehiculo_id}`} className="text-[#60a5fa] hover:underline">
                  {l.marca} {l.modelo} {l.anio || ""}
                </Link>
              ) : (l.vehiculo_texto || "—")}
            </Dato>
            {l.vehiculo_id && <Dato label="Precio publicado">{plata(l.precio_venta)}</Dato>}
            <Dato label="Presupuesto">{l.presupuesto ? plata(l.presupuesto) : "—"}</Dato>
            <Dato label="Entrega usado">{l.entrega_usado ? "Sí" : "No"}</Dato>
            {l.entrega_usado && (
              <>
                <Dato label="Qué entrega">{l.usado_detalle || "—"}</Dato>
                <Dato label="Tasación">{l.tasacion ? plata(l.tasacion) : "—"}</Dato>
              </>
            )}
          </Panel>

          {l.observaciones && (
            <Panel>
              <PanelTitulo titulo="Observaciones" />
              <p className="text-[13px] text-[#cbd5e1] leading-relaxed whitespace-pre-line">
                {l.observaciones}
              </p>
            </Panel>
          )}

          {l.estado === "perdido" ? (
            <Panel className="border-[#991b1b]">
              <PanelTitulo titulo="Lead perdido" />
              <p className="text-[13px] text-[#cbd5e1]">{l.motivo_perdida || "Sin motivo cargado."}</p>
            </Panel>
          ) : !cerrado ? (
            <Panel>
              <PanelTitulo titulo="Dar por perdido"
                detalle="Saber por qué se cae una operación vale tanto como cerrarla." />
              <form action={marcarPerdido} className="space-y-3">
                <select name="motivo" className="campo" defaultValue="">
                  <option value="">Elegí un motivo</option>
                  {["Precio", "Compró en otro lado", "No calificó para financiar",
                    "No le sirvió la tasación del usado", "Dejó de responder",
                    "Postergó la compra", "Otro"].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <Boton tipo="submit" variante="peligro" className="w-full">Marcar como perdido</Boton>
              </form>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}
