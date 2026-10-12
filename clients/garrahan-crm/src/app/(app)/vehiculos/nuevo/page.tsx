import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requierePermiso, veCostos } from "@/lib/auth";
import { leerVehiculo, definidos } from "@/lib/vehiculo-form";
import { Encabezado, Panel, Boton, Campo } from "@/components/ui";
import CamposVehiculo from "@/components/campos-vehiculo";

export const dynamic = "force-dynamic";

export default async function NuevoVehiculo({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requierePermiso("vehiculos.editar");
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
    const usr = await requierePermiso("vehiculos.editar");
    const puedeCostos = veCostos(usr);
    const num = (k: string) => {
      const v = fd.get(k);
      return v === null || String(v).trim() === "" ? null : Number(v);
    };

    const d = leerVehiculo(fd, puedeCostos);
    const { marca, modelo } = d;
    if (!marca || !modelo) return;

    // El vendedor puede dar de alta una unidad pero no fijar su costo de compra.
    const valorCompra = d.valor_compra ?? 0;

    const [v] = await sql`INSERT INTO vehiculos ${sql(definidos(d) as any)} RETURNING id`;

    // La ficha nace con la unidad: si no, la pestaña aparece vacía y parece rota.
    await sql`INSERT INTO vehiculo_ficha (vehiculo_id) VALUES (${v.id})
              ON CONFLICT (vehiculo_id) DO NOTHING`;

    // La compra es costo de la unidad, no gasto del mes. Si se pagó de una
    // cuenta, la plata sale de la caja con la categoría de inventario, que
    // Reportes excluye del resultado a propósito.
    const cuenta = num("cuenta_id");
    if (puedeCostos && cuenta && valorCompra > 0) {
      const cot = d.cotizacion_compra ?? 1;
      const moneda = d.moneda_compra ?? "ARS";
      await sql`
        INSERT INTO caja_movimientos (cuenta_id, tipo, categoria, descripcion, monto, moneda,
                                      cotizacion, equivalente_ars, fecha, vehiculo_id, usuario_id)
        VALUES (${cuenta}, 'egreso', 'compra_unidad',
                ${"Compra " + marca + " " + modelo}, ${valorCompra}, ${moneda},
                ${cot}, ${moneda === "USD" ? valorCompra * cot : valorCompra},
                ${d.fecha_ingreso}, ${v.id}, ${usr.id})`;
    }

    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'vehiculo', ${v.id}, 'alta', ${marca + " " + modelo})`;

    // Lo siguiente que se hace con un auto que entra es sacarle fotos.
    redirect(`/vehiculos/${v.id}?tab=fotos`);
  }

  const cuentas = verCostos
    ? await sql`SELECT id, nombre, moneda FROM caja_cuentas WHERE activa ORDER BY nombre`
    : [];

  return (
    <>
      <Encabezado volver="/vehiculos" titulo="Nueva unidad"
        detalle="Lo único obligatorio es marca y modelo. El resto se completa después." />

      <form action={crear} className="space-y-4 max-w-4xl">
        <CamposVehiculo verCostos={verCostos} marcas={marcas} modelos={modelos}
          sucursales={sucursales} inversores={inversores} proveedores={proveedores}
          estadoInicial={p.estado} sucursalInicial={u.sucursal_id} />

        {verCostos && cuentas.length > 0 && (
          <Panel>
            <Campo label="¿De qué cuenta salió la plata de la compra? (opcional)">
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
          </Panel>
        )}

        <div className="flex gap-2">
          <Boton tipo="submit">Dar de alta la unidad</Boton>
          <Boton href="/vehiculos" variante="suave">Cancelar</Boton>
        </div>
      </form>
    </>
  );
}
