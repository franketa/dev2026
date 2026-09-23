import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Plus, Receipt, Wrench } from "lucide-react";
import { sql } from "@/lib/db";
import { requiereSesion, veCostos } from "@/lib/auth";
import { plata, numero, km as fkm, dominio, porcentaje, fecha } from "@/lib/format";
import { ESTADOS_VEHICULO, ALERTAS, TIPO_ADQUISICION, TIPOS_COSTO } from "@/lib/constantes";
import {
  Encabezado, KPI, GrillaKPI, Panel, PanelTitulo, Chip, Tabla, TH, TD,
  FilaVacia, Boton, Dato, Campo,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const TABS = [
  { v: "general", l: "General" },
  { v: "costos", l: "Costos" },
  { v: "ficha", l: "Ficha técnica" },
  { v: "movimientos", l: "Movimientos" },
  { v: "documentos", l: "Documentación" },
];

export default async function Vehiculo({ params, searchParams }: { params: Promise<any>; searchParams: Promise<any> }) {
  const u = await requiereSesion();
  const verCostos = veCostos(u);
  const { id } = await params;
  const { tab = "general" } = await searchParams;

  const [v] = await sql`SELECT * FROM v_vehiculos WHERE id = ${id}`;
  if (!v) notFound();

  const [costos, movimientos, ficha, documentos, proveedores, ordenes] = await Promise.all([
    sql`SELECT c.*, p.nombre AS proveedor FROM vehiculo_costos c
        LEFT JOIN proveedores p ON p.id = c.proveedor_id
        WHERE c.vehiculo_id = ${id} ORDER BY c.fecha DESC, c.id DESC`,
    sql`SELECT m.*, cu.nombre AS cuenta FROM caja_movimientos m
        LEFT JOIN caja_cuentas cu ON cu.id = m.cuenta_id
        WHERE m.vehiculo_id = ${id} ORDER BY m.fecha DESC LIMIT 50`,
    sql`SELECT * FROM vehiculo_ficha WHERE vehiculo_id = ${id}`,
    sql`SELECT * FROM vehiculo_documentos WHERE vehiculo_id = ${id} ORDER BY subido_en DESC`,
    sql`SELECT id, nombre FROM proveedores WHERE activo ORDER BY nombre`,
    sql`SELECT o.*, (SELECT count(*) FROM orden_items i WHERE i.orden_id = o.id)::int AS total,
               (SELECT count(*) FROM orden_items i WHERE i.orden_id = o.id AND i.hecho)::int AS hechos
        FROM ordenes_taller o WHERE o.vehiculo_id = ${id} ORDER BY o.id DESC`,
  ]);

  const f = ficha[0] || {};
  const e = ESTADOS_VEHICULO[v.estado] || { label: v.estado, tono: "gris" as const };
  const a = v.alerta ? ALERTAS[v.alerta] : null;

  /* ---------------------------------------------------------- acciones */
  async function agregarCosto(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    if (!veCostos(usr)) return;
    const monto = Number(fd.get("monto") || 0);
    if (!monto) return;
    await sql`
      INSERT INTO vehiculo_costos (vehiculo_id, tipo, detalle, proveedor_id, fecha, monto, origen)
      VALUES (${id}, ${String(fd.get("tipo") || "Otro")}, ${String(fd.get("detalle") || "")},
              ${fd.get("proveedor") ? Number(fd.get("proveedor")) : null},
              ${String(fd.get("fecha") || new Date().toISOString().slice(0, 10))},
              ${monto}, 'manual')`;
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'vehiculo', ${id}, 'costo_agregado', ${"$" + monto})`;
    revalidatePath(`/vehiculos/${id}`);
  }

  async function cambiarEstado(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    const nuevo = String(fd.get("estado") || "");
    if (!nuevo) return;
    await sql`UPDATE vehiculos SET estado = ${nuevo} WHERE id = ${id}`;
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'vehiculo', ${id}, 'estado', ${nuevo})`;
    revalidatePath(`/vehiculos/${id}`);
  }

  const tabUrl = (t: string) => `/vehiculos/${id}?tab=${t}`;

  return (
    <>
      <Encabezado
        volver="/vehiculos"
        titulo={<>{v.marca} {v.modelo} {v.version && <span className="text-[#9aa7b8] font-normal">{v.version}</span>} {v.anio}</>}
        detalle={`${dominio(v.dominio) === "—" ? "Sin dominio (0km)" : dominio(v.dominio)} · ${v.sucursal || "Sin sucursal"}`}
        acciones={
          <>
            <Chip tono={e.tono}>{e.label}</Chip>
            <form action={cambiarEstado} className="flex gap-2">
              <select name="estado" defaultValue={v.estado} className="campo w-auto py-1.5 text-[12.5px]">
                {Object.entries(ESTADOS_VEHICULO).map(([k, x]) => (
                  <option key={k} value={k}>{x.label}</option>
                ))}
              </select>
              <Boton tipo="submit" variante="suave">Cambiar</Boton>
            </form>
            {!["vendido", "baja"].includes(v.estado) && (
              <Boton href={`/ventas/nueva?vehiculo=${id}`}><Receipt size={15} /> Crear venta</Boton>
            )}
          </>
        }
      />

      {/* ------------------------------------------------------------- KPIs */}
      {verCostos ? (
        <GrillaKPI>
          <KPI label="Costo total invertido" valor={plata(v.costo_total)}
               detalle={`compra ${plata(v.valor_compra)}`} />
          <KPI label="Precio de venta" valor={Number(v.precio_venta) > 0 ? plata(v.precio_venta) : "Sin definir"} />
          <KPI label="Ganancia bruta"
               valor={<span className={Number(v.margen) >= 0 ? "text-[#22c55e]" : "text-[#f87171]"}>{plata(v.margen)}</span>} />
          <KPI label="Margen" valor={porcentaje(v.margen_pct)}
               detalle={a ? `${v.dias_stock} días en playón` : undefined} tono={a?.tono} />
        </GrillaKPI>
      ) : (
        <GrillaKPI cols={3}>
          <KPI label="Precio de venta" valor={Number(v.precio_venta) > 0 ? plata(v.precio_venta) : "Sin definir"} />
          <KPI label="Precio mínimo" valor={v.precio_minimo ? plata(v.precio_minimo) : "—"}
               detalle="autorizado para negociar" />
          <KPI label="Días en playón" valor={numero(v.dias_stock)} tono={a?.tono} detalle={a?.label} />
        </GrillaKPI>
      )}

      {/* ------------------------------------------------------------- tabs */}
      <div className="flex flex-wrap gap-1 mt-6 mb-4 border-b border-[#1f2937]">
        {TABS.map((t) => {
          const n = t.v === "costos" ? costos.length
                  : t.v === "movimientos" ? movimientos.length
                  : t.v === "documentos" ? documentos.length : null;
          if (t.v === "costos" && !verCostos) return null;
          if (t.v === "movimientos" && !verCostos) return null;
          return (
            <Link key={t.v} href={tabUrl(t.v)}
              className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors
                ${tab === t.v ? "border-[#2f6bff] text-[#e8edf5]" : "border-transparent text-[#9aa7b8] hover:text-[#cbd5e1]"}`}>
              {t.l}{n !== null && <span className="ml-1.5 text-[11px] text-[#64748b] tabular">({n})</span>}
            </Link>
          );
        })}
      </div>

      {/* ---------------------------------------------------------- general */}
      {tab === "general" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Panel>
            <PanelTitulo titulo="Datos del vehículo" />
            <Dato label="Dominio">{dominio(v.dominio)}</Dato>
            <Dato label="Marca">{v.marca}</Dato>
            <Dato label="Modelo">{v.modelo}</Dato>
            <Dato label="Versión">{v.version || "—"}</Dato>
            <Dato label="Año">{v.anio || "—"}</Dato>
            <Dato label="Kilometraje">{fkm(v.km)}</Dato>
            <Dato label="Condición">{v.condicion === "0km" ? "0 km" : "Usado"}</Dato>
            <Dato label="Color">{v.color || "—"}</Dato>
            <Dato label="Combustible">{v.combustible || "—"}</Dato>
            <Dato label="Transmisión">{v.transmision || "—"}</Dato>
            <Dato label="N° de motor">{v.nro_motor || "—"}</Dato>
            <Dato label="N° de chasis">{v.nro_chasis || "—"}</Dato>
          </Panel>

          <div className="space-y-4">
            <Panel>
              <PanelTitulo titulo="Origen e ingreso" />
              <Dato label="Tipo de adquisición">{TIPO_ADQUISICION[v.tipo_adquisicion] || "—"}</Dato>
              <Dato label="Titular">{v.titular || "—"}</Dato>
              <Dato label="DNI / CUIT titular">{v.dni_titular || "—"}</Dato>
              <Dato label="Fecha de ingreso">{fecha(v.fecha_ingreso)}</Dato>
              <Dato label="Días en playón">
                {a ? <Chip tono={a.tono}>{v.dias_stock} días · {a.label}</Chip> : `${v.dias_stock} días`}
              </Dato>
              <Dato label="Ubicación">{v.sucursal || "—"}</Dato>
              {verCostos && <Dato label="Inversor">{v.inversor || "Capital propio"}</Dato>}
              {verCostos && <Dato label="Valor de compra">{plata(v.valor_compra)}</Dato>}
            </Panel>

            {ordenes.length > 0 && (
              <Panel>
                <PanelTitulo titulo="Paso por taller"
                  accion={<Link href="/taller" className="text-[12.5px] text-[#2f6bff] hover:underline">Ver taller</Link>} />
                {ordenes.map((o: any) => (
                  <div key={o.id} className="flex items-center justify-between py-2 border-b border-[#172033] last:border-0">
                    <div>
                      <div className="text-[13px]">Orden #{o.id}</div>
                      <div className="text-[11.5px] text-[#64748b]">{fecha(o.fecha_ingreso)}</div>
                    </div>
                    <div className="text-[12.5px] text-[#9aa7b8] tabular">{o.hechos}/{o.total} tareas</div>
                  </div>
                ))}
              </Panel>
            )}

            {v.observaciones && (
              <Panel>
                <PanelTitulo titulo="Observaciones" />
                <p className="text-[13px] text-[#cbd5e1] leading-relaxed whitespace-pre-line">{v.observaciones}</p>
              </Panel>
            )}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------- costos */}
      {tab === "costos" && verCostos && (
        <div className="space-y-4">
          <Panel>
            <PanelTitulo titulo="Agregar un costo"
              detalle="Se suma al costo de esta unidad y recalcula el margen en el momento." />
            <form action={agregarCosto} className="grid sm:grid-cols-5 gap-3 items-end">
              <Campo label="Tipo">
                <select name="tipo" className="campo">
                  {TIPOS_COSTO.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Campo>
              <Campo label="Detalle" ancho="sm:col-span-2">
                <input name="detalle" className="campo" placeholder="Qué se hizo" />
              </Campo>
              <Campo label="Proveedor">
                <select name="proveedor" className="campo">
                  <option value="">—</option>
                  {proveedores.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </Campo>
              <Campo label="Monto">
                <input name="monto" type="number" step="0.01" required className="campo" placeholder="0" />
              </Campo>
              <input type="hidden" name="fecha" value={new Date().toISOString().slice(0, 10)} />
              <div className="sm:col-span-5">
                <Boton tipo="submit"><Plus size={15} /> Agregar costo</Boton>
              </div>
            </form>
          </Panel>

          <Tabla>
            <thead>
              <tr>
                <TH>Tipo</TH><TH>Detalle</TH><TH>Origen</TH><TH>Fecha</TH>
                <TH>Proveedor</TH><TH alinear="right">Monto</TH><TH alinear="right">Acumulado</TH>
              </tr>
            </thead>
            <tbody>
              {costos.length === 0 && <FilaVacia cols={7} mensaje="Esta unidad todavía no tiene costos cargados." />}
              {(() => { let acc = 0; return costos.map((c: any) => {
                acc += Number(c.monto);
                return (
                  <tr key={c.id} className="hover:bg-[#151d29]">
                    <TD className="font-medium">{c.tipo}</TD>
                    <TD className="text-[#9aa7b8]">{c.detalle || "—"}</TD>
                    <TD><Chip tono={c.origen === "taller" ? "naranja" : "gris"}>
                      {c.origen === "taller" ? "Taller" : "Manual"}</Chip></TD>
                    <TD className="text-[#9aa7b8]">{fecha(c.fecha)}</TD>
                    <TD className="text-[#9aa7b8]">{c.proveedor || "—"}</TD>
                    <TD alinear="right">{plata(c.monto)}</TD>
                    <TD alinear="right" className="text-[#64748b]">{plata(acc)}</TD>
                  </tr>
                );
              }); })()}
            </tbody>
          </Tabla>

          <Panel>
            <PanelTitulo titulo="Resumen de costos" />
            <Dato label="Valor de compra">{plata(v.valor_compra)}</Dato>
            <Dato label="Costos adicionales (taller, detailing, extras)">{plata(v.costos)}</Dato>
            <div className="flex items-baseline justify-between gap-6 pt-3 mt-1 border-t border-[#1f2937]">
              <span className="text-[13px] font-semibold">Total invertido</span>
              <span className="text-[16px] font-semibold tabular text-[#60a5fa]">{plata(v.costo_total)}</span>
            </div>
          </Panel>
        </div>
      )}

      {/* ------------------------------------------------------------ ficha */}
      {tab === "ficha" && (
        <Panel>
          <PanelTitulo titulo="Documentación y estado legal"
            detalle="Lo que hay que tener en orden antes de entregar la unidad." />
          <div className="grid sm:grid-cols-2 gap-x-8">
            <div>
              <Dato label="Título">{f.titulo ? <Chip tono="verde">Sí</Chip> : <Chip tono="rojo">Falta</Chip>}</Dato>
              <Dato label="Cédula verde">{f.cedula ? <Chip tono="verde">Sí</Chip> : <Chip tono="rojo">Falta</Chip>}</Dato>
              <Dato label="Formulario 08">{f.form_08 ? <Chip tono="verde">Firmado</Chip> : <Chip tono="amarillo">Pendiente</Chip>}</Dato>
              <Dato label="Informe de dominio">{f.informe_dominio ? <Chip tono="verde">Sí</Chip> : <Chip tono="gris">—</Chip>}</Dato>
            </div>
            <div>
              <Dato label="VTV">{f.vtv ? <Chip tono="verde">Vigente{f.vtv_vence ? ` hasta ${fecha(f.vtv_vence)}` : ""}</Chip> : <Chip tono="gris">—</Chip>}</Dato>
              <Dato label="Prenda">{f.prenda ? <Chip tono="rojo">Con prenda</Chip> : <Chip tono="verde">Libre</Chip>}</Dato>
              <Dato label="Deuda de patentes">{Number(f.deuda_patentes) > 0 ? <span className="text-[#f87171]">{plata(f.deuda_patentes)}</span> : "Sin deuda"}</Dato>
              <Dato label="Infracciones">{Number(f.infracciones) > 0 ? <span className="text-[#f87171]">{plata(f.infracciones)}</span> : "Sin infracciones"}</Dato>
            </div>
          </div>
          {f.notas && <p className="mt-4 text-[13px] text-[#9aa7b8]">{f.notas}</p>}
        </Panel>
      )}

      {/* ------------------------------------------------------ movimientos */}
      {tab === "movimientos" && verCostos && (
        <Tabla>
          <thead>
            <tr><TH>Fecha</TH><TH>Descripción</TH><TH>Cuenta</TH><TH>Tipo</TH><TH alinear="right">Monto</TH></tr>
          </thead>
          <tbody>
            {movimientos.length === 0 && <FilaVacia cols={5} mensaje="No hay movimientos de caja asociados a esta unidad." />}
            {movimientos.map((m: any) => (
              <tr key={m.id} className="hover:bg-[#151d29]">
                <TD className="text-[#9aa7b8]">{fecha(m.fecha)}</TD>
                <TD>{m.descripcion}</TD>
                <TD className="text-[#9aa7b8]">{m.cuenta}</TD>
                <TD><Chip tono={m.tipo === "ingreso" ? "verde" : "rojo"}>{m.tipo === "ingreso" ? "Ingreso" : "Egreso"}</Chip></TD>
                <TD alinear="right">{plata(m.equivalente_ars)}</TD>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}

      {/* ------------------------------------------------------- documentos */}
      {tab === "documentos" && (
        <Panel>
          <PanelTitulo titulo="Documentación" detalle="Título, 08, informe de dominio, fotos." />
          {documentos.length === 0 ? (
            <p className="text-[13px] text-[#64748b] py-8 text-center">
              Todavía no hay archivos cargados para esta unidad.
            </p>
          ) : (
            <div className="space-y-2">
              {documentos.map((d: any) => (
                <a key={d.id} href={d.archivo} target="_blank" rel="noreferrer"
                  className="flex items-center justify-between rounded-lg border border-[#1f2937]
                    bg-[#0f1520] px-3.5 py-2.5 hover:border-[#2f6bff]">
                  <span className="text-[13px]">{d.nombre}</span>
                  <span className="text-[11.5px] text-[#64748b]">{fecha(d.subido_en)}</span>
                </a>
              ))}
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
