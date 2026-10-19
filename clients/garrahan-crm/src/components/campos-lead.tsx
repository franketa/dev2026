import { ORIGENES_LEAD, ESTADOS_LEAD } from "@/lib/constantes";
import { Panel, PanelTitulo, Campo } from "@/components/ui";

/** Los mismos campos para cargar un lead y para corregirlo después. */
export default function CamposLead({ l = {}, vehiculos, asesores, sucursales, clientes, conEstado, asignaAsesor }: {
  l?: any;
  vehiculos: any[];
  asesores: any[];
  sucursales: any[];
  clientes: any[];
  /** El estado inicial solo se elige en el alta: después se cambia desde la ficha. */
  conEstado?: boolean;
  /** El vendedor no reasigna: si se lo pasa a otro, deja de verlo. */
  asignaAsesor: boolean;
}) {
  const fechaInput = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : "");
  const n = (v: any) => (v === null || v === undefined ? "" : String(Number(v)));

  return (
    <>
      <Panel>
        <PanelTitulo titulo="Contacto" detalle="Quién es y cómo llegó" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Campo label="Nombre *">
            <input name="nombre" required className="campo" placeholder="Apellido y nombre" defaultValue={l.nombre} />
          </Campo>
          <Campo label="Teléfono">
            <input name="telefono" className="campo" placeholder="2346 42-1234" defaultValue={l.telefono ?? ""} />
          </Campo>
          <Campo label="Email">
            <input name="email" type="email" className="campo" defaultValue={l.email ?? ""} />
          </Campo>
          <Campo label="Origen">
            <select name="origen" className="campo" defaultValue={l.origen || "showroom"}>
              {Object.entries(ORIGENES_LEAD).map(([v, t]) => (
                <option key={v} value={v}>{t}</option>
              ))}
            </select>
          </Campo>
          {asignaAsesor && (
            <Campo label="Asesor asignado">
              <select name="asesor_id" className="campo" defaultValue={l.asesor_id ?? ""}>
                <option value="">Sin asignar</option>
                {asesores.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </Campo>
          )}
          <Campo label="Sucursal">
            <select name="sucursal_id" className="campo" defaultValue={l.sucursal_id ?? ""}>
              <option value="">—</option>
              {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </Campo>
          <Campo label="Cliente ya existente" ancho="sm:col-span-2 lg:col-span-3">
            <select name="cliente_id" className="campo" defaultValue={l.cliente_id ?? ""}>
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
            <select name="vehiculo_id" className="campo" defaultValue={l.vehiculo_id ?? ""}>
              <option value="">Ninguna en particular</option>
              {vehiculos.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.marca} {v.modelo} {v.anio || ""} {v.dominio ? "· " + v.dominio : ""}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="O lo que pidió, en sus palabras">
            <input name="vehiculo_texto" className="campo" placeholder="Pick-up diesel hasta $30M"
              defaultValue={l.vehiculo_texto ?? ""} />
          </Campo>
          <Campo label="Presupuesto">
            <input name="presupuesto" type="number" step="0.01" min="0" className="campo" defaultValue={n(l.presupuesto)} />
          </Campo>
          {conEstado && (
            <Campo label="Estado inicial">
              <select name="estado" className="campo" defaultValue="nuevo">
                {Object.entries(ESTADOS_LEAD).map(([v, e]) => (
                  <option key={v} value={v}>{e.label}</option>
                ))}
              </select>
            </Campo>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelTitulo titulo="Entrega usado"
          detalle="La permuta define la operación entera: conviene saberlo desde el primer día" />
        <label className="flex items-center gap-2.5 text-[13px] text-[var(--c-tinta-clara)] cursor-pointer mb-4">
          <input type="checkbox" name="entrega_usado" defaultChecked={!!l.entrega_usado}
            className="h-4 w-4 accent-[var(--c-primario)]" />
          Entrega un usado como parte de pago
        </label>
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo label="Qué entrega">
            <input name="usado_detalle" className="campo" placeholder="Gol Trend 2015, 120.000 km"
              defaultValue={l.usado_detalle ?? ""} />
          </Campo>
          <Campo label="Tasación estimada">
            <input name="tasacion" type="number" step="0.01" min="0" className="campo" defaultValue={n(l.tasacion)} />
          </Campo>
        </div>
      </Panel>

      <Panel>
        <PanelTitulo titulo="Seguimiento" detalle="Qué sigue y para cuándo" />
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo label="Próxima acción">
            <input name="proxima_accion" className="campo" placeholder="Llamar para coordinar visita"
              defaultValue={l.proxima_accion ?? ""} />
          </Campo>
          <Campo label="Fecha">
            <input name="fecha_proxima" type="date" className="campo" defaultValue={fechaInput(l.fecha_proxima)} />
          </Campo>
          <Campo label="Observaciones" ancho="sm:col-span-2">
            <textarea name="observaciones" rows={3} className="campo" defaultValue={l.observaciones ?? ""} />
          </Campo>
          {l.estado === "perdido" && (
            <Campo label="Motivo de la pérdida" ancho="sm:col-span-2">
              <input name="motivo_perdida" className="campo" defaultValue={l.motivo_perdida ?? ""} />
            </Campo>
          )}
        </div>
      </Panel>
    </>
  );
}
