import Link from "next/link";
import { redirect } from "next/navigation";
import { avisoOk, avisoError } from "@/lib/aviso";
import { sql } from "@/lib/db";
import { requierePermiso } from "@/lib/auth";
import { plata } from "@/lib/format";
import { ESTADOS_VENTA, ESTADOS_TRAMITE } from "@/lib/constantes";
import { Encabezado, Panel, PanelTitulo, Boton, Campo } from "@/components/ui";
import PagosVenta from "@/components/pagos-venta";
import { ventaActiva } from "@/lib/ventas";
import { crearVenta, enDias } from "@/lib/ventas-operar";
import { clientesParaVenta } from "@/lib/clientes";
import CamposCliente from "@/components/campos-cliente";

export const dynamic = "force-dynamic";



export default async function NuevaVenta({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requierePermiso("ventas.crear");
  const p = await searchParams;

  const [vehiculos, clientes, vendedores, sucursales, cuentas, lead] = await Promise.all([
    sql`SELECT id, marca, modelo, anio, dominio, precio_venta, precio_minimo, inversor_id, sucursal_id
        FROM vehiculos WHERE estado IN ('disponible','reservado') OR id = ${p.vehiculo || 0}
        ORDER BY marca, modelo`,
    clientesParaVenta(sql),
    sql`SELECT id, nombre, comision_pct FROM usuarios
        WHERE activo AND rol IN ('vendedor','gerente','dueno') ORDER BY nombre`,
    sql`SELECT id, nombre FROM sucursales WHERE activa ORDER BY nombre`,
    sql`SELECT id, nombre, moneda FROM caja_cuentas WHERE activa ORDER BY nombre`,
    p.lead
      ? sql`SELECT id, nombre, telefono, email, cliente_id, vehiculo_id FROM leads WHERE id = ${p.lead}`
      : Promise.resolve([]),
  ]);

  const elegido = p.vehiculo
    ? vehiculos.find((v: any) => String(v.id) === String(p.vehiculo))
    : null;
  const l = lead[0] || null;
  const yaVendida = elegido ? await ventaActiva(elegido.id) : undefined;

  async function crear(fd: FormData) {
    "use server";
    const usr = await requierePermiso("ventas.crear");
    const r = await crearVenta(usr, fd);
    if ("error" in r) return avisoError(r.error);
    await avisoOk(r.mensaje);
    redirect(`/ventas/${r.id}`);
  }

  return (
    <>
      <Encabezado volver="/ventas" titulo="Nueva venta"
        detalle="Al guardar se marca la unidad, se registra el cobro en la caja y, si entra un usado, se da de alta en el stock." />

      {yaVendida && (
        <Panel className="max-w-5xl mb-4 border-[var(--c-amarillo-borde)]">
          <p className="text-[13px] text-[var(--c-tinta-clara)]">
            Esta unidad ya tiene la <Link href={`/ventas/${yaVendida.id}`} className="text-[var(--c-enlace)] hover:underline">
            venta #{yaVendida.id}</Link> ({ESTADOS_VENTA[yaVendida.estado]?.label || yaVendida.estado}).
            Para pasarla a completada o corregir algo, entrá a esa venta: no hace falta cargar otra.
          </p>
        </Panel>
      )}

      <form action={crear} className="space-y-4 max-w-5xl">
        <input type="hidden" name="lead_id" value={l?.id ?? ""} />

        {/* ------------------------------------------------------- la unidad */}
        <Panel>
          <PanelTitulo titulo="Unidad y comprador" />
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="Unidad *">
              <select name="vehiculo_id" required className="campo" defaultValue={p.vehiculo || ""}>
                <option value="">Elegí la unidad</option>
                {vehiculos.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.marca} {v.modelo} {v.anio || ""} {v.dominio ? "· " + v.dominio : ""}
                    {v.precio_venta ? " — " + plata(v.precio_venta) : ""}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Fecha">
              <input name="fecha" type="date" className="campo"
                defaultValue={new Date().toISOString().slice(0, 10)} />
            </Campo>
            <Campo label="Vendedor">
              <select name="vendedor_id" className="campo" defaultValue={u.id}>
                <option value="">Sin asignar</option>
                {vendedores.map((v: any) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </Campo>
          </div>

          <div className="mt-4 pt-4 border-t border-[var(--c-borde)]">
            <span className="etiqueta block mb-3">El comprador (sale así en el boleto)</span>
            <CamposCliente clientes={clientes as any} inicial={l?.cliente_id ?? null}
              sugerido={l ? { nombre: l.nombre || "", telefono: l.telefono || "", email: l.email || "" } : undefined} />
          </div>
        </Panel>

        {/* ---------------------------------------------------------- cobro */}
        <Panel>
          <PanelTitulo titulo="Precio y formas de pago"
            detalle={elegido?.precio_minimo
              ? `Mínimo autorizado para esta unidad: ${plata(elegido.precio_minimo)}`
              : "Se puede combinar efectivo, permuta y financiación"} />
          <PagosVenta precioSugerido={Number(elegido?.precio_venta || 0)} />

          <div className="grid sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-[var(--c-borde)]">
            <Campo label="Cuenta de caja donde entra la plata">
              <select name="cuenta_id" className="campo" defaultValue={cuentas[0]?.id ?? ""}>
                <option value="">No registrar en caja</option>
                {cuentas.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>
                ))}
              </select>
            </Campo>
            <Campo label="Si es reserva, la seña vence el">
              <input name="sena_vence" type="date" className="campo"
                defaultValue={enDias(new Date().toISOString().slice(0, 10), 7)} />
            </Campo>
            <Campo label="Vencimiento del saldo">
              <input name="vencimiento_saldo" type="date" className="campo" />
            </Campo>
          </div>

          <p className="mt-2 text-[11.5px] text-[var(--c-tinta-tenue)]">
            Si esta plata ya la anotaste en Caja, elegí «No registrar en caja» para que no cuente dos veces.
          </p>

          <div className="grid sm:grid-cols-3 gap-4 mt-4">
            <Campo label="¿En qué moneda queda el saldo?">
              <select name="moneda_saldo" className="campo" defaultValue="ARS">
                <option value="ARS">Pesos</option>
                <option value="USD">Dólares</option>
              </select>
            </Campo>
            <Campo label="Cotización del saldo (si es en USD)">
              <input name="cotizacion_saldo" type="number" step="0.01" min="0" className="campo" defaultValue={1} />
            </Campo>
            <p className="text-[11.5px] text-[var(--c-tinta-tenue)] leading-relaxed self-end pb-2">
              Si el saldo se pactó en dólares se guarda en dólares, no convertido:
              es la cifra que el cliente tiene que pagar.
            </p>
          </div>
        </Panel>

        {/* -------------------------------------------------------- permuta */}
        <Panel>
          <PanelTitulo titulo="Usado que entra en permuta"
            detalle="Se da de alta como unidad nueva en el stock, en revisión, con el valor tomado como costo." />
          <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Campo label="Marca"><input name="permuta_marca" className="campo" /></Campo>
            <Campo label="Modelo"><input name="permuta_modelo" className="campo" /></Campo>
            <Campo label="Año"><input name="permuta_anio" type="number" min="1950" max="2035" className="campo" /></Campo>
            <Campo label="Dominio"><input name="permuta_dominio" className="campo uppercase" /></Campo>
            <Campo label="Km"><input name="permuta_km" type="number" min="0" className="campo" /></Campo>
            <Campo label="Valor tomado">
              <input name="permuta_valor" type="number" step="0.01" min="0" className="campo" />
            </Campo>
          </div>
        </Panel>

        {/* --------------------------------------------------- financiación */}
        <Panel>
          <PanelTitulo titulo="Financiación" detalle="Si hay prenda o crédito de por medio" />
          <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <Campo label="Entidad">
              <input name="fin_entidad" className="campo" placeholder="Banco / financiera" />
            </Campo>
            <Campo label="Monto">
              <input name="fin_monto" type="number" step="0.01" min="0" className="campo" />
            </Campo>
            <Campo label="Cuotas">
              <input name="fin_cuotas" type="number" min="1" className="campo" />
            </Campo>
            <Campo label="Tasa %">
              <input name="fin_tasa" type="number" step="0.01" min="0" className="campo" />
            </Campo>
            <Campo label="Primera cuota">
              <input name="fin_primera" type="date" className="campo" />
            </Campo>
          </div>
        </Panel>

        {/* ---------------------------------------------------------- cierre */}
        <Panel>
          <PanelTitulo titulo="Estado de la operación" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Campo label="Estado">
              <select name="estado" className="campo" defaultValue="reserva">
                {Object.entries(ESTADOS_VENTA)
                  .filter(([v]) => v !== "cancelada")
                  .map(([v, e]) => <option key={v} value={v}>{e.label}</option>)}
              </select>
            </Campo>
            <Campo label="Trámite">
              <select name="estado_tramite" className="campo" defaultValue="iniciado">
                {Object.entries(ESTADOS_TRAMITE).map(([v, lb]) => (
                  <option key={v} value={v}>{lb}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Facturado">
              <select name="facturado" className="campo" defaultValue="pendiente">
                <option value="pendiente">Pendiente</option>
                <option value="si">Sí</option>
                <option value="no">No</option>
                <option value="exento">Exento</option>
              </select>
            </Campo>
            <Campo label="Comisión del vendedor">
              <input name="comision" type="number" step="0.01" min="0" className="campo" defaultValue={0} />
            </Campo>
            <Campo label="Sucursal">
              <select name="sucursal_id" className="campo" defaultValue={u.sucursal_id ?? ""}>
                <option value="">—</option>
                {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Observaciones" ancho="sm:col-span-2 lg:col-span-3">
              <input name="observaciones" className="campo" />
            </Campo>
          </div>
        </Panel>

        <div className="flex gap-2">
          <Boton tipo="submit">Registrar la venta</Boton>
          <Boton href="/ventas" variante="suave">Cancelar</Boton>
        </div>
      </form>
    </>
  );
}


