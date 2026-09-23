import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { ORIGENES_LEAD, ESTADOS_LEAD } from "@/lib/constantes";
import { Encabezado, Panel, PanelTitulo, Boton, Campo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NuevoLead({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requiereSesion();
  const p = await searchParams;

  const [vehiculos, asesores, sucursales, clientes] = await Promise.all([
    sql`SELECT id, marca, modelo, anio, dominio FROM vehiculos
        WHERE estado IN ('disponible','reservado') ORDER BY marca, modelo`,
    sql`SELECT id, nombre FROM usuarios WHERE activo AND rol IN ('vendedor','gerente','dueno') ORDER BY nombre`,
    sql`SELECT id, nombre FROM sucursales WHERE activa ORDER BY nombre`,
    sql`SELECT id, nombre, apellido, telefono FROM clientes ORDER BY nombre LIMIT 500`,
  ]);

  async function crear(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    const txt = (k: string) => {
      const v = String(fd.get(k) ?? "").trim();
      return v === "" ? null : v;
    };
    const num = (k: string) => {
      const v = fd.get(k);
      return v === null || String(v).trim() === "" ? null : Number(v);
    };

    const nombre = txt("nombre");
    if (!nombre) return;

    const estado = String(fd.get("estado") || "nuevo");
    const etapa = ESTADOS_LEAD[estado]?.etapa || "captacion";

    const [l] = await sql`
      INSERT INTO leads (cliente_id, nombre, telefono, email, origen, etapa, estado,
                         asesor_id, vehiculo_id, vehiculo_texto, presupuesto,
                         entrega_usado, usado_detalle, tasacion,
                         proxima_accion, fecha_proxima, observaciones, sucursal_id)
      VALUES (${num("cliente_id")}, ${nombre}, ${txt("telefono")}, ${txt("email")},
              ${String(fd.get("origen") || "showroom")}, ${etapa}, ${estado},
              ${num("asesor_id")}, ${num("vehiculo_id")}, ${txt("vehiculo_texto")},
              ${num("presupuesto")},
              ${fd.get("entrega_usado") === "on"}, ${txt("usado_detalle")}, ${num("tasacion")},
              ${txt("proxima_accion")}, ${txt("fecha_proxima")},
              ${txt("observaciones")}, ${num("sucursal_id")})
      RETURNING id`;

    await sql`INSERT INTO lead_interacciones (lead_id, tipo, detalle, usuario_id)
              VALUES (${l.id}, 'nota', ${"Lead cargado desde " + (ORIGENES_LEAD[String(fd.get("origen") || "showroom")] || "showroom")}, ${usr.id})`;
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'lead', ${l.id}, 'alta', ${nombre})`;

    redirect(`/leads/${l.id}`);
  }

  return (
    <>
      <Encabezado volver="/leads" titulo="Nuevo lead"
        detalle="Cargalo apenas entra. Lo único que hace falta es el nombre." />

      <form action={crear} className="space-y-4 max-w-4xl">
        <Panel>
          <PanelTitulo titulo="Contacto" detalle="Quién es y cómo llegó" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Campo label="Nombre *">
              <input name="nombre" required className="campo" placeholder="Apellido y nombre" />
            </Campo>
            <Campo label="Teléfono">
              <input name="telefono" className="campo" placeholder="2346 42-1234" />
            </Campo>
            <Campo label="Email">
              <input name="email" type="email" className="campo" />
            </Campo>
            <Campo label="Origen">
              <select name="origen" className="campo" defaultValue={p.origen || "showroom"}>
                {Object.entries(ORIGENES_LEAD).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Asesor asignado">
              <select name="asesor_id" className="campo" defaultValue={u.id}>
                <option value="">Sin asignar</option>
                {asesores.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Sucursal">
              <select name="sucursal_id" className="campo" defaultValue={u.sucursal_id ?? ""}>
                <option value="">—</option>
                {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Cliente ya existente" ancho="sm:col-span-2 lg:col-span-3">
              <select name="cliente_id" className="campo" defaultValue="">
                <option value="">Es un contacto nuevo</option>
                {clientes.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.apellido || ""} {c.telefono ? "· " + c.telefono : ""}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </Panel>

        <Panel>
          <PanelTitulo titulo="Qué busca" detalle="Si todavía no eligió unidad, escribilo en texto libre" />
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="Unidad de interés">
              <select name="vehiculo_id" className="campo" defaultValue={p.vehiculo || ""}>
                <option value="">Ninguna en particular</option>
                {vehiculos.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.marca} {v.modelo} {v.anio || ""} {v.dominio ? "· " + v.dominio : ""}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="O lo que pidió, en sus palabras">
              <input name="vehiculo_texto" className="campo" placeholder="Pick-up diesel hasta $30M" />
            </Campo>
            <Campo label="Presupuesto">
              <input name="presupuesto" type="number" step="0.01" min="0" className="campo" />
            </Campo>
            <Campo label="Estado inicial">
              <select name="estado" className="campo" defaultValue="nuevo">
                {Object.entries(ESTADOS_LEAD).map(([v, e]) => (
                  <option key={v} value={v}>{e.label}</option>
                ))}
              </select>
            </Campo>
          </div>
        </Panel>

        <Panel>
          <PanelTitulo titulo="Entrega usado"
            detalle="La permuta define la operación entera: conviene saberlo desde el primer día" />
          <label className="flex items-center gap-2.5 text-[13px] text-[#cbd5e1] cursor-pointer mb-4">
            <input type="checkbox" name="entrega_usado" className="h-4 w-4 accent-[#2f6bff]" />
            Entrega un usado como parte de pago
          </label>
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="Qué entrega">
              <input name="usado_detalle" className="campo" placeholder="Gol Trend 2015, 120.000 km" />
            </Campo>
            <Campo label="Tasación estimada">
              <input name="tasacion" type="number" step="0.01" min="0" className="campo" />
            </Campo>
          </div>
        </Panel>

        <Panel>
          <PanelTitulo titulo="Seguimiento" detalle="Qué sigue y para cuándo" />
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="Próxima acción">
              <input name="proxima_accion" className="campo" placeholder="Llamar para coordinar visita" />
            </Campo>
            <Campo label="Fecha">
              <input name="fecha_proxima" type="date" className="campo" />
            </Campo>
            <Campo label="Observaciones" ancho="sm:col-span-2">
              <textarea name="observaciones" rows={3} className="campo" />
            </Campo>
          </div>
        </Panel>

        <div className="flex gap-2">
          <Boton tipo="submit">Guardar lead</Boton>
          <Boton href="/leads" variante="suave">Cancelar</Boton>
        </div>
      </form>
    </>
  );
}
