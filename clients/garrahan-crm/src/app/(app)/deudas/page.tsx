import { revalidatePath } from "next/cache";
import { avisoOk, avisoError } from "@/lib/aviso";
import { sql } from "@/lib/db";
import { requierePermiso } from "@/lib/auth";
import { plata, fecha, numero } from "@/lib/format";
import {
  Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Panel, PanelTitulo, Boton, Campo,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/** El tipo decide en qué categoría de caja cae el pago. */
const TIPOS: { valor: string; label: string; categoria: string }[] = [
  { valor: "proveedor",    label: "Proveedor",    categoria: "otros_gastos" },
  { valor: "alquiler",     label: "Alquiler",     categoria: "alquiler" },
  { valor: "impuesto",     label: "Impuesto",     categoria: "impuestos" },
  { valor: "servicio",     label: "Servicio",     categoria: "servicios" },
  { valor: "sueldo",       label: "Sueldo",       categoria: "sueldos" },
  // Pagarle al dueño de un auto consignado es parte del costo del auto, no un gasto del mes.
  { valor: "consignacion", label: "Consignación", categoria: "compra_unidad" },
  { valor: "prestamo",     label: "Préstamo",     categoria: "otros_gastos" },
  { valor: "otro",         label: "Otro",         categoria: "otros_gastos" },
];
const tipoDe = (v: string) => TIPOS.find((t) => t.valor === v);

const ESTADOS: Record<string, string> = {
  pendiente: "Pendiente", en_curso: "Pago parcial", pagado: "Pagado", vencido: "Vencido",
};

/** Fecha de hoy en Argentina, para el valor por defecto de los pagos. */
const hoy = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

async function crear(fd: FormData) {
  "use server";
  await requierePermiso("deudas");
  const acreedor = String(fd.get("acreedor") || "").trim();
  const monto = Number(fd.get("monto") || 0);
  if (!acreedor) return avisoError("Falta a quién se le debe.");
  if (!(monto > 0)) return avisoError("Falta el monto.");
  const tipo = tipoDe(String(fd.get("tipo"))) ? String(fd.get("tipo")) : "otro";
  await sql`
    INSERT INTO deudas (acreedor, concepto, tipo, monto, vencimiento, observaciones)
    VALUES (${acreedor}, ${String(fd.get("concepto") || "").trim() || null}, ${tipo}, ${monto},
            ${String(fd.get("vencimiento") || "") || null},
            ${String(fd.get("observaciones") || "").trim() || null})`;
  revalidatePath("/deudas");
  await avisoOk(`Deuda con ${acreedor} cargada`);
}

/**
 * Un pago baja el saldo. Si se elige una cuenta, sale también de la caja como
 * egreso, así no hay que cargarlo dos veces.
 */
async function pagar(fd: FormData) {
  "use server";
  const usr = await requierePermiso("deudas");
  const id = Number(fd.get("id") || 0);
  const monto = Number(fd.get("monto") || 0);
  const cuenta = Number(fd.get("cuenta") || 0);
  const dia = String(fd.get("fecha") || "") || hoy();
  const [d] = await sql`SELECT * FROM deudas WHERE id = ${id}`;
  if (!d) return;
  const saldo = Number(d.monto) - Number(d.pagado);
  if (!(monto > 0)) return avisoError("Falta el monto del pago.");
  if (monto > saldo + 0.01) return avisoError(`El pago supera lo que se debe (${plata(saldo)}).`);

  const pagado = Number(d.pagado) + monto;
  const estado = pagado >= Number(d.monto) - 0.01 ? "pagado" : "en_curso";
  await sql.begin(async (tx) => {
    await tx`UPDATE deudas SET pagado = ${pagado}, estado = ${estado} WHERE id = ${id}`;
    if (cuenta) {
      await tx`
        INSERT INTO caja_movimientos
          (fecha, tipo, cuenta_id, categoria, descripcion, contraparte, monto, moneda, cotizacion,
           equivalente_ars, usuario_id)
        VALUES (${dia}, 'egreso', ${cuenta}, ${tipoDe(d.tipo)?.categoria || "otros_gastos"},
                ${"Pago de deuda" + (d.concepto ? ": " + d.concepto : "")}, ${d.acreedor},
                ${monto}, 'ARS', 1, ${monto}, ${usr.id})`;
    }
    await tx`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
             VALUES (${usr.id}, 'deuda', ${id}, 'pago', ${String(monto)})`;
  });
  revalidatePath("/deudas");
  revalidatePath("/caja");
  await avisoOk(estado === "pagado"
    ? `Deuda con ${d.acreedor} saldada${cuenta ? ". Salió de la caja." : "."}`
    : `Pago registrado. Quedan ${plata(saldo - monto)}${cuenta ? ". Salió de la caja." : "."}`);
}

/** Solo se borra lo que no tiene pagos: lo que se cargó por error. */
async function borrar(fd: FormData) {
  "use server";
  const usr = await requierePermiso("deudas");
  const id = Number(fd.get("id") || 0);
  const [d] = await sql`SELECT acreedor, pagado FROM deudas WHERE id = ${id}`;
  if (!d) return;
  if (Number(d.pagado) > 0) return avisoError("Tiene pagos registrados: no se puede borrar.");
  await sql`DELETE FROM deudas WHERE id = ${id}`;
  await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
            VALUES (${usr.id}, 'deuda', ${id}, 'borrada', ${d.acreedor})`;
  revalidatePath("/deudas");
  await avisoOk(`Deuda con ${d.acreedor} borrada`);
}

export default async function Deudas() {
  await requierePermiso("deudas");
  const [filas, cuentas, proveedores] = await Promise.all([
    sql`SELECT *, (monto - pagado) AS saldo,
               (vencimiento < current_date AND estado <> 'pagado') AS vencida
        FROM deudas ORDER BY estado = 'pagado', vencimiento NULLS LAST, id`,
    sql`SELECT id, nombre FROM caja_cuentas WHERE activa AND moneda = 'ARS' ORDER BY posicion, id`,
    sql`SELECT nombre FROM proveedores ORDER BY nombre`,
  ]);
  const pend = filas.filter((f: any) => f.estado !== "pagado");
  const total = pend.reduce((a: number, f: any) => a + Number(f.saldo), 0);

  return (
    <>
      <Encabezado titulo="Deudas a pagar" detalle="Alquiler, impuestos, proveedores y consignaciones." />
      <GrillaKPI cols={3}>
        <KPI label="Total a pagar" valor={plata(total)} />
        <KPI label="Compromisos abiertos" valor={numero(pend.length)} tono="amarillo" />
        <KPI label="Vencidos" valor={numero(pend.filter((f: any) => f.vencida).length)}
             tono={pend.some((f: any) => f.vencida) ? "rojo" : "verde"} />
      </GrillaKPI>

      <Panel className="mt-6">
        <PanelTitulo titulo="Nueva deuda"
          detalle="Lo que hay que pagar y cuándo. Los pagos se registran después, en la fila de cada una." />
        <form action={crear} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Campo label="A quién *">
            <input name="acreedor" required className="campo" list="deudas-proveedores"
              placeholder="Proveedor, dueño del local…" />
            <datalist id="deudas-proveedores">
              {proveedores.map((p: any) => <option key={p.nombre} value={p.nombre} />)}
            </datalist>
          </Campo>
          <Campo label="Concepto">
            <input name="concepto" className="campo" placeholder="Alquiler de octubre, IIBB…" />
          </Campo>
          <Campo label="Tipo">
            <select name="tipo" className="campo" defaultValue="proveedor">
              {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
            </select>
          </Campo>
          <Campo label="Monto *">
            <input name="monto" type="number" step="0.01" min="0.01" required className="campo" />
          </Campo>
          <Campo label="Vence">
            <input name="vencimiento" type="date" className="campo" />
          </Campo>
          <Campo label="Observaciones" ancho="sm:col-span-2">
            <input name="observaciones" className="campo" />
          </Campo>
          <div className="flex items-end">
            <Boton tipo="submit" className="w-full">Cargar deuda</Boton>
          </div>
        </form>
      </Panel>

      <div className="mt-6" />
      <Tabla>
        <thead><tr>
          <TH>Acreedor</TH><TH>Concepto</TH><TH>Tipo</TH><TH>Vencimiento</TH>
          <TH alinear="right">Monto</TH><TH alinear="right">Saldo</TH><TH>Estado</TH><TH> </TH>
        </tr></thead>
        <tbody>
          {filas.length === 0 && <FilaVacia cols={8} mensaje="No hay deudas registradas." />}
          {filas.map((f: any) => (
            <tr key={f.id} className="hover:bg-[var(--c-hover)] align-top">
              <TD className="font-medium">{f.acreedor}</TD>
              <TD className="text-[var(--c-tinta-media)]">
                {f.concepto || "—"}
                {f.observaciones && <div className="text-[11.5px] text-[var(--c-tinta-tenue)]">{f.observaciones}</div>}
              </TD>
              <TD className="text-[var(--c-tinta-media)]">{tipoDe(f.tipo)?.label || f.tipo}</TD>
              <TD>{f.vencida
                ? <Chip tono="rojo">{fecha(f.vencimiento)}</Chip>
                : <span className="text-[var(--c-tinta-media)]">{fecha(f.vencimiento)}</span>}</TD>
              <TD alinear="right">{plata(f.monto)}</TD>
              <TD alinear="right" className="font-medium">{plata(f.saldo)}</TD>
              <TD><Chip tono={f.estado === "pagado" ? "verde" : f.vencida ? "rojo" : "amarillo"}>
                {f.vencida ? "Vencida" : ESTADOS[f.estado] || f.estado}</Chip></TD>
              <TD>
                {f.estado !== "pagado" && (
                  <div className="flex items-start gap-3">
                    <details>
                      <summary className="cursor-pointer list-none text-[12.5px] text-[var(--c-enlace)] hover:underline whitespace-nowrap">
                        Registrar pago
                      </summary>
                      <form action={pagar} className="mt-3 w-[250px] space-y-2.5 p-3
                        bg-[var(--c-superficie)] border border-[var(--c-borde)] rounded-lg">
                        <input type="hidden" name="id" value={f.id} />
                        <Campo label="Monto">
                          <input name="monto" type="number" step="0.01" min="0.01" required className="campo"
                            defaultValue={Number(f.saldo)} />
                        </Campo>
                        <Campo label="Fecha">
                          <input name="fecha" type="date" className="campo" defaultValue={hoy()} />
                        </Campo>
                        <Campo label="Sale de la cuenta">
                          <select name="cuenta" className="campo" defaultValue={cuentas[0]?.id ?? ""}>
                            {cuentas.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            <option value="">No mover la caja</option>
                          </select>
                        </Campo>
                        <Boton tipo="submit" className="w-full">Registrar</Boton>
                      </form>
                    </details>
                    {Number(f.pagado) === 0 && (
                      <form action={borrar}>
                        <input type="hidden" name="id" value={f.id} />
                        <button type="submit"
                          className="text-[12.5px] text-[var(--c-rojo-alto)] hover:underline">Borrar</button>
                      </form>
                    )}
                  </div>
                )}
              </TD>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
