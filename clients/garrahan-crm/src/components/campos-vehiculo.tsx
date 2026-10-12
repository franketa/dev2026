import { ESTADOS_VEHICULO, TIPO_ADQUISICION } from "@/lib/constantes";
import { CARROCERIAS, TRACCIONES } from "@/lib/vehiculo-form";
import { Panel, PanelTitulo, Campo } from "@/components/ui";

const iso = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/**
 * Los campos de una unidad, iguales en el alta y en la edición. Sin `v` es un
 * alta: los valores por defecto son los de un auto que recién entra.
 */
export default function CamposVehiculo({
  v, verCostos, marcas, modelos, sucursales, inversores, proveedores, estadoInicial, sucursalInicial,
}: {
  v?: any;
  verCostos: boolean;
  marcas: any[];
  modelos: any[];
  sucursales: any[];
  inversores: any[];
  proveedores: any[];
  estadoInicial?: string;
  sucursalInicial?: number | null;
}) {
  const alta = !v;
  const x = v || {};

  return (
    <>
      {/* ------------------------------------------------------- identificación */}
      <Panel>
        <PanelTitulo titulo="Identificación" detalle="Qué auto es" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Campo label="Marca *">
            <input name="marca" list="marcas" required className="campo" placeholder="Volkswagen"
              defaultValue={x.marca ?? ""} />
            <datalist id="marcas">
              {marcas.map((m: any) => <option key={m.id} value={m.nombre} />)}
            </datalist>
          </Campo>
          <Campo label="Modelo *">
            <input name="modelo" list="modelos" required className="campo" placeholder="Amarok"
              defaultValue={x.modelo ?? ""} />
            <datalist id="modelos">
              {modelos.map((m: any) => <option key={m.id} value={m.nombre}>{m.marca}</option>)}
            </datalist>
          </Campo>
          <Campo label="Versión">
            <input name="version" className="campo" placeholder="Highline 4x4" defaultValue={x.version ?? ""} />
          </Campo>
          <Campo label="Dominio">
            <input name="dominio" className="campo uppercase" placeholder="AB123CD" defaultValue={x.dominio ?? ""} />
          </Campo>
          <Campo label="Año">
            <input name="anio" type="number" min="1950" max="2035" className="campo" defaultValue={x.anio ?? ""} />
          </Campo>
          <Campo label="Kilómetros">
            <input name="km" type="number" min="0" className="campo" defaultValue={x.km ?? 0} />
          </Campo>
          <Campo label="Condición">
            <select name="condicion" className="campo" defaultValue={x.condicion ?? "usado"}>
              <option value="usado">Usado</option>
              <option value="0km">0 km</option>
            </select>
          </Campo>
          <Campo label="Color">
            <input name="color" className="campo" placeholder="Gris plata" defaultValue={x.color ?? ""} />
          </Campo>
          <Campo label="Combustible">
            <select name="combustible" className="campo" defaultValue={x.combustible ?? ""}>
              <option value="">—</option>
              {["Nafta", "Diesel", "GNC", "Nafta + GNC", "Híbrido", "Eléctrico"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Transmisión">
            <select name="transmision" className="campo" defaultValue={x.transmision ?? ""}>
              <option value="">—</option>
              <option value="Manual">Manual</option>
              <option value="Automática">Automática</option>
            </select>
          </Campo>
          <Campo label="N° de motor">
            <input name="nro_motor" className="campo" defaultValue={x.nro_motor ?? ""} />
          </Campo>
          <Campo label="N° de chasis">
            <input name="nro_chasis" className="campo" defaultValue={x.nro_chasis ?? ""} />
          </Campo>
        </div>
      </Panel>

      {/* ------------------------------------------------------------ titular */}
      <Panel>
        <PanelTitulo titulo="Titular registral"
          detalle="Quién figura en el título. Sale impreso en el boleto." />
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo label="Titular">
            <input name="titular" className="campo" placeholder="Apellido y nombre" defaultValue={x.titular ?? ""} />
          </Campo>
          <Campo label="DNI / CUIT del titular">
            <input name="dni_titular" className="campo" defaultValue={x.dni_titular ?? ""} />
          </Campo>
        </div>
      </Panel>

      {/* ---------------------------------------------------------- ingreso */}
      <Panel>
        <PanelTitulo titulo="Ingreso" detalle="Cómo y cuándo entró la unidad" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Campo label="Fecha de ingreso">
            <input name="fecha_ingreso" type="date" className="campo"
              defaultValue={iso(x.fecha_ingreso) || new Date().toISOString().slice(0, 10)} />
          </Campo>
          <Campo label="Forma de adquisición">
            <select name="tipo_adquisicion" className="campo" defaultValue={x.tipo_adquisicion ?? "compra_directa"}>
              {Object.entries(TIPO_ADQUISICION).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Estado">
            <select name="estado" className="campo" defaultValue={x.estado ?? estadoInicial ?? "disponible"}>
              {Object.entries(ESTADOS_VEHICULO)
                .filter(([k]) => !alta || k !== "vendido")
                .map(([k, e]) => <option key={k} value={k}>{e.label}</option>)}
            </select>
          </Campo>
          <Campo label="Sucursal">
            <select name="sucursal_id" className="campo" defaultValue={x.sucursal_id ?? sucursalInicial ?? ""}>
              <option value="">—</option>
              {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </Campo>
          {verCostos && (
            <>
              <Campo label="Inversor">
                <select name="inversor_id" className="campo" defaultValue={x.inversor_id ?? ""}>
                  <option value="">—</option>
                  {inversores.map((i: any) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                </select>
              </Campo>
              <Campo label="Proveedor / de quién se compró">
                <select name="proveedor_id" className="campo" defaultValue={x.proveedor_id ?? ""}>
                  <option value="">—</option>
                  {proveedores.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </Campo>
            </>
          )}
        </div>
      </Panel>

      {/* ------------------------------------------------------------ precios */}
      <Panel>
        <PanelTitulo titulo="Precios"
          detalle={verCostos
            ? "El margen se calcula solo a partir de la compra más los costos que se carguen después."
            : "El costo de compra lo carga administración."} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {verCostos && (
            <>
              <Campo label="Valor de compra">
                <input name="valor_compra" type="number" step="0.01" min="0" className="campo"
                  defaultValue={x.valor_compra ?? 0} />
              </Campo>
              <Campo label="Moneda de compra">
                <select name="moneda_compra" className="campo" defaultValue={x.moneda_compra ?? "ARS"}>
                  <option value="ARS">Pesos</option>
                  <option value="USD">Dólares</option>
                </select>
              </Campo>
              <Campo label="Cotización (si es USD)">
                <input name="cotizacion_compra" type="number" step="0.01" min="0" className="campo"
                  defaultValue={x.cotizacion_compra ?? 1} />
              </Campo>
            </>
          )}
          <Campo label="Precio de venta">
            <input name="precio_venta" type="number" step="0.01" min="0" className="campo"
              defaultValue={x.precio_venta ?? 0} />
          </Campo>
          <Campo label="Moneda del precio">
            <select name="moneda_venta" className="campo" defaultValue={x.moneda_venta ?? "ARS"}>
              <option value="ARS">Pesos</option>
              <option value="USD">Dólares</option>
            </select>
          </Campo>
          <Campo label="Precio mínimo autorizado">
            <input name="precio_minimo" type="number" step="0.01" min="0" className="campo"
              defaultValue={x.precio_minimo ?? ""} />
          </Campo>
        </div>
      </Panel>

      {/* ------------------------------------------------------------ la web */}
      <Panel>
        <PanelTitulo titulo="Publicación en la web"
          detalle="Las unidades disponibles y publicadas aparecen solas en garrahanautomotores.com.ar. Al señarla o venderla sale sola." />
        <div className="flex flex-wrap gap-x-6 gap-y-2 mb-4">
          <Tilde name="publicado" label="Publicar en la web" valor={x.publicado ?? true} />
          <Tilde name="destacado" label="Destacada" valor={x.destacado ?? false} />
          <Tilde name="mostrar_precio" label="Mostrar el precio" valor={x.mostrar_precio ?? true} />
          <Tilde name="acepta_permuta" label="Acepta permuta" valor={x.acepta_permuta ?? true} />
          <Tilde name="acepta_financiacion" label="Financiable" valor={x.acepta_financiacion ?? true} />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Campo label="Carrocería">
            <select name="carroceria" className="campo" defaultValue={x.carroceria ?? ""}>
              <option value="">—</option>
              {CARROCERIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo label="Motor">
            <input name="motor" className="campo" placeholder="1.6 16v" defaultValue={x.motor ?? ""} />
          </Campo>
          <Campo label="Puertas">
            <input name="puertas" type="number" min="2" max="5" className="campo" defaultValue={x.puertas ?? ""} />
          </Campo>
          <Campo label="Tracción">
            <select name="traccion" className="campo" defaultValue={x.traccion ?? ""}>
              <option value="">—</option>
              {TRACCIONES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo label="Precio de oferta (opcional)">
            <input name="precio_oferta" type="number" step="0.01" min="0" className="campo"
              defaultValue={x.precio_oferta ?? ""} />
          </Campo>
          <Campo label="Equipamiento (uno por renglón)" ancho="sm:col-span-2 lg:col-span-3">
            <textarea name="equipamiento" rows={3} className="campo"
              placeholder={"Aire acondicionado\nLlantas de aleación\nCámara de retroceso"}
              defaultValue={x.equipamiento ?? ""} />
          </Campo>
          <Campo label="Descripción para la web" ancho="sm:col-span-2 lg:col-span-4">
            <textarea name="descripcion_web" rows={3} className="campo"
              placeholder="Único dueño, service oficial, cubiertas nuevas…"
              defaultValue={x.descripcion_web ?? ""} />
          </Campo>
        </div>
      </Panel>

      <Panel>
        <Campo label="Observaciones internas">
          <textarea name="observaciones" rows={3} className="campo"
            placeholder="Detalles del estado, historial, lo que haya que tener en cuenta. No sale en la web."
            defaultValue={x.observaciones ?? ""} />
        </Campo>
      </Panel>
    </>
  );
}

function Tilde({ name, label, valor }: { name: string; label: string; valor: boolean }) {
  return (
    <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
      <input type="checkbox" name={name} defaultChecked={valor} className="h-4 w-4 accent-[var(--c-primario)]" />
      {label}
    </label>
  );
}
