import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requiereSesion, veCostos } from "@/lib/auth";
import { ESTADOS_VEHICULO, TIPO_ADQUISICION } from "@/lib/constantes";
import { Encabezado, Panel, PanelTitulo, Boton, Campo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NuevoVehiculo({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requiereSesion();
  const verCostos = veCostos(u);
  const p = await searchParams;

  const [sucursales, inversores, proveedores, marcas, modelos] = await Promise.all([
    sql`SELECT id, nombre FROM sucursales WHERE activa ORDER BY nombre`,
    sql`SELECT id, nombre FROM inversores WHERE activo ORDER BY nombre`,
    sql`SELECT id, nombre FROM proveedores WHERE activo ORDER BY nombre`,
    sql`SELECT id, nombre FROM catalogo_marcas ORDER BY nombre`,
    sql`SELECT m.id, m.nombre, ma.nombre AS marca FROM catalogo_modelos m
        JOIN catalogo_marcas ma ON ma.id = m.marca_id ORDER BY ma.nombre, m.nombre`,
  ]);

  async function crear(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    const puedeCostos = veCostos(usr);
    const txt = (k: string) => {
      const v = String(fd.get(k) ?? "").trim();
      return v === "" ? null : v;
    };
    const num = (k: string) => {
      const v = fd.get(k);
      return v === null || String(v).trim() === "" ? null : Number(v);
    };

    const marca = txt("marca");
    const modelo = txt("modelo");
    if (!marca || !modelo) return;

    // El vendedor puede dar de alta una unidad pero no fijar su costo de compra.
    const valorCompra = puedeCostos ? (num("valor_compra") ?? 0) : 0;

    const [v] = await sql`
      INSERT INTO vehiculos (
        dominio, marca, modelo, version, anio, km, color, combustible, transmision,
        nro_motor, nro_chasis, titular, dni_titular, condicion, tipo_adquisicion,
        fecha_ingreso, sucursal_id, inversor_id, proveedor_id,
        valor_compra, precio_venta, precio_minimo, moneda_compra, cotizacion_compra,
        estado, observaciones)
      VALUES (
        ${txt("dominio")?.toUpperCase() ?? null}, ${marca}, ${modelo}, ${txt("version")},
        ${num("anio")}, ${num("km") ?? 0}, ${txt("color")}, ${txt("combustible")},
        ${txt("transmision")}, ${txt("nro_motor")}, ${txt("nro_chasis")},
        ${txt("titular")}, ${txt("dni_titular")},
        ${String(fd.get("condicion") || "usado")},
        ${String(fd.get("tipo_adquisicion") || "compra_directa")},
        ${txt("fecha_ingreso") ?? new Date().toISOString().slice(0, 10)},
        ${num("sucursal_id")}, ${num("inversor_id")}, ${num("proveedor_id")},
        ${valorCompra}, ${num("precio_venta") ?? 0}, ${num("precio_minimo")},
        ${String(fd.get("moneda_compra") || "ARS")}, ${num("cotizacion_compra") ?? 1},
        ${String(fd.get("estado") || "disponible")}, ${txt("observaciones")})
      RETURNING id`;

    // La ficha nace con la unidad: si no, la pestaña aparece vacía y parece rota.
    await sql`INSERT INTO vehiculo_ficha (vehiculo_id) VALUES (${v.id})
              ON CONFLICT (vehiculo_id) DO NOTHING`;

    // La compra es costo de la unidad, no gasto del mes. Si se pagó de una
    // cuenta, la plata sale de la caja con la categoría de inventario, que
    // Reportes excluye del resultado a propósito.
    const cuenta = num("cuenta_id");
    if (puedeCostos && cuenta && valorCompra > 0) {
      const cot = num("cotizacion_compra") ?? 1;
      const moneda = String(fd.get("moneda_compra") || "ARS");
      await sql`
        INSERT INTO caja_movimientos (cuenta_id, tipo, categoria, concepto, monto, moneda,
                                      cotizacion, equivalente_ars, fecha, vehiculo_id, usuario_id)
        VALUES (${cuenta}, 'egreso', 'compra_unidad',
                ${"Compra " + marca + " " + modelo}, ${valorCompra}, ${moneda},
                ${cot}, ${moneda === "USD" ? valorCompra * cot : valorCompra},
                ${txt("fecha_ingreso") ?? new Date().toISOString().slice(0, 10)},
                ${v.id}, ${usr.id})`;
    }

    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'vehiculo', ${v.id}, 'alta', ${marca + " " + modelo})`;

    redirect(`/vehiculos/${v.id}`);
  }

  const cuentas = verCostos
    ? await sql`SELECT id, nombre, moneda FROM caja_cuentas WHERE activa ORDER BY nombre`
    : [];

  return (
    <>
      <Encabezado volver="/vehiculos" titulo="Nueva unidad"
        detalle="Lo único obligatorio es marca y modelo. El resto se completa después." />

      <form action={crear} className="space-y-4 max-w-4xl">
        {/* ------------------------------------------------------- identificación */}
        <Panel>
          <PanelTitulo titulo="Identificación" detalle="Qué auto es" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Campo label="Marca *">
              <input name="marca" list="marcas" required className="campo" placeholder="Volkswagen" />
              <datalist id="marcas">
                {marcas.map((m: any) => <option key={m.id} value={m.nombre} />)}
              </datalist>
            </Campo>
            <Campo label="Modelo *">
              <input name="modelo" list="modelos" required className="campo" placeholder="Amarok" />
              <datalist id="modelos">
                {modelos.map((m: any) => <option key={m.id} value={m.nombre}>{m.marca}</option>)}
              </datalist>
            </Campo>
            <Campo label="Versión">
              <input name="version" className="campo" placeholder="Highline 4x4" />
            </Campo>
            <Campo label="Dominio">
              <input name="dominio" className="campo uppercase" placeholder="AB123CD" />
            </Campo>
            <Campo label="Año">
              <input name="anio" type="number" min="1950" max="2035" className="campo" />
            </Campo>
            <Campo label="Kilómetros">
              <input name="km" type="number" min="0" defaultValue={0} className="campo" />
            </Campo>
            <Campo label="Condición">
              <select name="condicion" className="campo" defaultValue="usado">
                <option value="usado">Usado</option>
                <option value="0km">0 km</option>
              </select>
            </Campo>
            <Campo label="Color">
              <input name="color" className="campo" placeholder="Gris plata" />
            </Campo>
            <Campo label="Combustible">
              <select name="combustible" className="campo" defaultValue="">
                <option value="">—</option>
                {["Nafta", "Diesel", "GNC", "Híbrido", "Eléctrico"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Transmisión">
              <select name="transmision" className="campo" defaultValue="">
                <option value="">—</option>
                <option value="Manual">Manual</option>
                <option value="Automática">Automática</option>
              </select>
            </Campo>
            <Campo label="N° de motor">
              <input name="nro_motor" className="campo" />
            </Campo>
            <Campo label="N° de chasis">
              <input name="nro_chasis" className="campo" />
            </Campo>
          </div>
        </Panel>

        {/* ------------------------------------------------------------ titular */}
        <Panel>
          <PanelTitulo titulo="Titular registral"
            detalle="Quién figura en el título. Sale impreso en el boleto." />
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="Titular">
              <input name="titular" className="campo" placeholder="Apellido y nombre" />
            </Campo>
            <Campo label="DNI / CUIT del titular">
              <input name="dni_titular" className="campo" />
            </Campo>
          </div>
        </Panel>

        {/* ---------------------------------------------------------- ingreso */}
        <Panel>
          <PanelTitulo titulo="Ingreso" detalle="Cómo y cuándo entró la unidad" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Campo label="Fecha de ingreso">
              <input name="fecha_ingreso" type="date" className="campo"
                defaultValue={new Date().toISOString().slice(0, 10)} />
            </Campo>
            <Campo label="Forma de adquisición">
              <select name="tipo_adquisicion" className="campo" defaultValue="compra_directa">
                {Object.entries(TIPO_ADQUISICION).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Estado">
              <select name="estado" className="campo" defaultValue={p.estado || "disponible"}>
                {Object.entries(ESTADOS_VEHICULO)
                  .filter(([v]) => v !== "vendido")
                  .map(([v, e]) => <option key={v} value={v}>{e.label}</option>)}
              </select>
            </Campo>
            <Campo label="Sucursal">
              <select name="sucursal_id" className="campo" defaultValue={u.sucursal_id ?? ""}>
                <option value="">—</option>
                {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </Campo>
            {verCostos && (
              <>
                <Campo label="Inversor">
                  <select name="inversor_id" className="campo" defaultValue="">
                    <option value="">—</option>
                    {inversores.map((i: any) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                  </select>
                </Campo>
                <Campo label="Proveedor / de quién se compró">
                  <select name="proveedor_id" className="campo" defaultValue="">
                    <option value="">—</option>
                    {proveedores.map((x: any) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
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
                  <input name="valor_compra" type="number" step="0.01" min="0" className="campo" defaultValue={0} />
                </Campo>
                <Campo label="Moneda de compra">
                  <select name="moneda_compra" className="campo" defaultValue="ARS">
                    <option value="ARS">Pesos</option>
                    <option value="USD">Dólares</option>
                  </select>
                </Campo>
                <Campo label="Cotización (si es USD)">
                  <input name="cotizacion_compra" type="number" step="0.01" min="0" className="campo" defaultValue={1} />
                </Campo>
              </>
            )}
            <Campo label="Precio de venta">
              <input name="precio_venta" type="number" step="0.01" min="0" className="campo" defaultValue={0} />
            </Campo>
            <Campo label="Precio mínimo autorizado">
              <input name="precio_minimo" type="number" step="0.01" min="0" className="campo" />
            </Campo>
          </div>
          {verCostos && cuentas.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[var(--c-borde)]">
              <Campo label="¿De qué cuenta salió la plata? (opcional)">
                <select name="cuenta_id" className="campo sm:w-1/2" defaultValue="">
                  <option value="">No registrar el pago ahora</option>
                  {cuentas.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>
                  ))}
                </select>
              </Campo>
              <p className="mt-2 text-[11.5px] text-[var(--c-tinta-tenue)] leading-relaxed">
                Si elegís una cuenta, la salida queda registrada en la caja como compra de
                unidad. No cuenta como gasto del mes: es plata que se transformó en
                mercadería y pega en el resultado recién cuando el auto se vende.
              </p>
            </div>
          )}
        </Panel>

        <Panel>
          <Campo label="Observaciones">
            <textarea name="observaciones" rows={3} className="campo"
              placeholder="Detalles del estado, historial, lo que haya que tener en cuenta." />
          </Campo>
        </Panel>

        <div className="flex gap-2">
          <Boton tipo="submit">Dar de alta la unidad</Boton>
          <Boton href="/vehiculos" variante="suave">Cancelar</Boton>
        </div>
      </form>
    </>
  );
}
