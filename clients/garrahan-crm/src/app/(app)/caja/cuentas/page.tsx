import { revalidatePath } from "next/cache";
import { Plus } from "lucide-react";
import { sql } from "@/lib/db";
import { requierePermiso, puede } from "@/lib/auth";
import { plata } from "@/lib/format";
import {
  Encabezado, Panel, PanelTitulo, Chip, Tabla, TH, TD, FilaVacia, Boton, Campo,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const TIPOS: Record<string, string> = { efectivo: "Efectivo", banco: "Banco", billetera: "Billetera (Mercado Pago)" };

/**
 * Las cuentas de la agencia, tal como están en el Excel: efectivo en pesos,
 * efectivo en dólares, cada cuenta de banco y Mercado Pago. El saldo inicial
 * es con lo que arranca cada una el día que se empieza a usar el sistema.
 */
export default async function Cuentas() {
  const u = await requierePermiso("caja");
  const edita = puede(u, "caja.editar");

  const cuentas = await sql`
    SELECT c.*, s.saldo,
           (SELECT count(*) FROM caja_movimientos m
            WHERE m.cuenta_id = c.id OR m.cuenta_destino_id = c.id)::int AS movimientos
    FROM caja_cuentas c JOIN v_saldos s ON s.id = c.id
    ORDER BY c.activa DESC, c.moneda, c.posicion, c.id`;

  async function crear(fd: FormData) {
    "use server";
    const usr = await requierePermiso("caja.editar");
    const nombre = String(fd.get("nombre") || "").trim();
    if (!nombre) return;
    const tipo = TIPOS[String(fd.get("tipo"))] ? String(fd.get("tipo")) : "efectivo";
    const moneda = String(fd.get("moneda")) === "USD" ? "USD" : "ARS";
    const [c] = await sql`
      INSERT INTO caja_cuentas (nombre, tipo, moneda, saldo_inicial, posicion)
      VALUES (${nombre}, ${tipo}, ${moneda}, ${Number(fd.get("saldo_inicial") || 0)},
              (SELECT COALESCE(MAX(posicion) + 1, 1) FROM caja_cuentas))
      RETURNING id`;
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'cuenta', ${c.id}, 'alta', ${nombre})`;
    revalidatePath("/caja/cuentas");
    revalidatePath("/caja");
  }

  async function guardar(fd: FormData) {
    "use server";
    const usr = await requierePermiso("caja.editar");
    const id = Number(fd.get("id"));
    const nombre = String(fd.get("nombre") || "").trim();
    if (!id || !nombre) return;
    await sql`UPDATE caja_cuentas SET nombre = ${nombre},
                saldo_inicial = ${Number(fd.get("saldo_inicial") || 0)},
                activa = ${fd.get("activa") === "on"}
              WHERE id = ${id}`;
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'cuenta', ${id}, 'edicion', ${nombre})`;
    revalidatePath("/caja/cuentas");
    revalidatePath("/caja");
  }

  return (
    <>
      <Encabezado volver="/caja" titulo="Cuentas de caja"
        detalle="Pesos y dólares por separado. La moneda de una cuenta no se cambia después de crearla." />

      {edita && (
        <Panel className="mb-4">
          <PanelTitulo titulo="Nueva cuenta" detalle="Una por cada lugar donde hay plata: caja, banco, Mercado Pago." />
          <form action={crear} className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <Campo label="Nombre *">
              <input name="nombre" required className="campo" placeholder="Banco Provincia" />
            </Campo>
            <Campo label="Tipo">
              <select name="tipo" className="campo" defaultValue="banco">
                {Object.entries(TIPOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Campo>
            <Campo label="Moneda">
              <select name="moneda" className="campo" defaultValue="ARS">
                <option value="ARS">Pesos</option>
                <option value="USD">Dólares</option>
              </select>
            </Campo>
            <Campo label="Saldo inicial">
              <input name="saldo_inicial" type="number" step="0.01" className="campo" defaultValue={0} />
            </Campo>
            <Boton tipo="submit"><Plus size={15} /> Agregar</Boton>
          </form>
        </Panel>
      )}

      <Tabla>
        <thead>
          <tr>
            <TH>Cuenta</TH><TH>Tipo</TH><TH>Moneda</TH><TH alinear="right">Saldo inicial</TH>
            <TH alinear="right">Saldo actual</TH><TH alinear="right">Movimientos</TH>{edita && <TH></TH>}
          </tr>
        </thead>
        <tbody>
          {cuentas.length === 0 && <FilaVacia cols={7} mensaje="Todavía no hay cuentas." />}
          {cuentas.map((c: any) => (
            <tr key={c.id} className={`hover:bg-[var(--c-hover)] align-top ${c.activa ? "" : "opacity-50"}`}>
              <TD className="font-medium">{c.nombre} {!c.activa && <Chip tono="gris">Inactiva</Chip>}</TD>
              <TD className="text-[var(--c-tinta-media)]">{TIPOS[c.tipo] || c.tipo}</TD>
              <TD><Chip tono={c.moneda === "USD" ? "verde" : "azul"}>{c.moneda}</Chip></TD>
              <TD alinear="right" className="text-[var(--c-tinta-media)]">{plata(c.saldo_inicial, c.moneda)}</TD>
              <TD alinear="right" className="font-semibold">{plata(c.saldo, c.moneda)}</TD>
              <TD alinear="right" className="text-[var(--c-tinta-media)]">{c.movimientos}</TD>
              {edita && (
                <TD>
                  <details>
                    <summary className="cursor-pointer list-none text-[12.5px] text-[var(--c-enlace)] hover:underline">Editar</summary>
                    <form action={guardar} className="mt-2 w-[240px] space-y-2.5 p-3 bg-[var(--c-superficie)]
                      border border-[var(--c-borde)] rounded-lg">
                      <input type="hidden" name="id" value={c.id} />
                      <Campo label="Nombre"><input name="nombre" className="campo" defaultValue={c.nombre} /></Campo>
                      <Campo label="Saldo inicial">
                        <input name="saldo_inicial" type="number" step="0.01" className="campo" defaultValue={c.saldo_inicial} />
                      </Campo>
                      <label className="flex items-center gap-2 text-[13px]">
                        <input type="checkbox" name="activa" defaultChecked={c.activa} className="h-4 w-4" /> Activa
                      </label>
                      <Boton tipo="submit" className="w-full">Guardar</Boton>
                    </form>
                  </details>
                </TD>
              )}
            </tr>
          ))}
        </tbody>
      </Tabla>
      <p className="mt-3 text-[11.5px] text-[var(--c-tinta-tenue)] max-w-2xl leading-relaxed">
        Una cuenta con movimientos no se borra: se desactiva y deja de aparecer para cargar,
        pero su historia queda.
      </p>
    </>
  );
}
