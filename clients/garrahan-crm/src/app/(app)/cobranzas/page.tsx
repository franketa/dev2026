import Link from "next/link";
import { revalidatePath } from "next/cache";
import { avisoOk, avisoError } from "@/lib/aviso";
import { sql } from "@/lib/db";
import { requierePermiso } from "@/lib/auth";
import { plata, fecha, numero } from "@/lib/format";
import {
  Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Panel, PanelTitulo, Boton, Campo,
} from "@/components/ui";
import Exportar from "@/components/exportar";
import ImprimirListado from "@/components/imprimir-listado";

export const dynamic = "force-dynamic";

/** Fecha de hoy en Argentina, para los valores por defecto. */
const hoy = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const nombreCliente = (c: any) => [c.apellido, c.nombre].filter(Boolean).join(", ");

/**
 * Una cobranza a mano: lo que alguien le debe a la agencia y no sale de una
 * venta cargada en el sistema (un saldo viejo, un préstamo, un trabajo de taller).
 * El cliente se busca por nombre; si no está, se crea con ese nombre.
 */
async function crear(fd: FormData) {
  "use server";
  const usr = await requierePermiso("cobranzas");
  const quien = String(fd.get("cliente") || "").trim();
  const concepto = String(fd.get("concepto") || "").trim();
  const monto = Number(fd.get("monto") || 0);
  const moneda = String(fd.get("moneda") || "ARS") === "USD" ? "USD" : "ARS";
  if (!concepto) return avisoError("Falta el concepto: qué se está cobrando.");
  if (!(monto > 0)) return avisoError("Falta el monto.");

  let clienteId: number | null = null;
  if (quien) {
    const [c] = await sql`
      SELECT id FROM clientes
      WHERE lower(concat_ws(', ', apellido, nombre)) = lower(${quien})
         OR lower(concat_ws(' ', nombre, apellido)) = lower(${quien})
      ORDER BY id LIMIT 1`;
    clienteId = c ? c.id : (await sql`INSERT INTO clientes (nombre) VALUES (${quien}) RETURNING id`)[0].id;
  }
  const [co] = await sql`
    INSERT INTO cobranzas (cliente_id, concepto, monto, moneda, cotizacion, vencimiento, cuota, estado, observaciones)
    VALUES (${clienteId}, ${concepto}, ${monto}, ${moneda}, 1, ${String(fd.get("vencimiento") || "") || hoy()},
            ${String(fd.get("cuota") || "").trim() || null}, 'pendiente',
            ${String(fd.get("observaciones") || "").trim() || null})
    RETURNING id`;
  await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
            VALUES (${usr.id}, 'cobranza', ${co.id}, 'alta', ${`${concepto} · ${plata(monto, moneda)}`})`;
  revalidatePath("/cobranzas");
  await avisoOk("Cobranza cargada");
}

/**
 * Cobrar una cobranza cargada a mano. Las de una venta se cobran desde la
 * venta, que además baja el saldo de la operación y saca el recibo.
 */
async function cobrar(fd: FormData) {
  "use server";
  const usr = await requierePermiso("cobranzas");
  const id = Number(fd.get("id") || 0);
  const monto = Number(fd.get("monto") || 0);
  const cuenta = Number(fd.get("cuenta") || 0);
  const dia = String(fd.get("fecha") || "") || hoy();
  const [c] = await sql`SELECT co.*, concat_ws(', ', cl.apellido, cl.nombre) AS cliente
                        FROM cobranzas co LEFT JOIN clientes cl ON cl.id = co.cliente_id WHERE co.id = ${id}`;
  if (!c) return;
  if (c.venta_id) return avisoError("Esta cobranza es de una venta: se cobra desde la venta.");
  const saldo = Number(c.monto) - Number(c.cobrado);
  if (!(monto > 0)) return avisoError("Falta el monto.");
  if (monto > saldo + 0.01) return avisoError(`El cobro supera el saldo (${plata(saldo, c.moneda)}).`);

  const cobrado = Number(c.cobrado) + monto;
  const saldada = cobrado >= Number(c.monto) - 0.01;
  const [cot] = c.moneda === "USD" ? await sql`SELECT valor FROM cotizaciones ORDER BY fecha DESC LIMIT 1` : [];
  const cotizacion = c.moneda === "USD" ? Number(cot?.valor || 1) : 1;
  await sql.begin(async (tx) => {
    await tx`UPDATE cobranzas SET cobrado = ${cobrado}, estado = ${saldada ? "cobrado" : "pendiente"},
               fecha_cobro = ${saldada ? dia : null}
             WHERE id = ${id}`;
    if (cuenta) {
      await tx`
        INSERT INTO caja_movimientos
          (fecha, tipo, cuenta_id, categoria, descripcion, contraparte, monto, moneda, cotizacion,
           equivalente_ars, usuario_id)
        VALUES (${dia}, 'ingreso', ${cuenta}, 'otros_ingresos', ${"Cobranza: " + c.concepto}, ${c.cliente || ""},
                ${monto}, ${c.moneda}, ${cotizacion}, ${monto * cotizacion}, ${usr.id})`;
    }
    await tx`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
             VALUES (${usr.id}, 'cobranza', ${id}, 'cobro', ${plata(monto, c.moneda) + (cuenta ? " · entró a Caja" : "")})`;
  });
  revalidatePath("/cobranzas");
  revalidatePath("/caja");
  await avisoOk(saldada ? `Cobranza saldada${cuenta ? ". Entró a la caja." : "."}`
    : `Cobro registrado. Quedan ${plata(saldo - monto, c.moneda)}${cuenta ? ". Entró a la caja." : "."}`);
}

/**
 * Borrar una cobranza que no corresponde (repetida, ya cobrada por fuera, mal
 * cargada). Si era de una venta, los cobros de la venta quedan como están.
 * Una cargada a mano con cobros no se borra: esos cobros ya entraron a la caja.
 */
async function borrar(fd: FormData) {
  "use server";
  const usr = await requierePermiso("cobranzas");
  const id = Number(fd.get("id") || 0);
  const [c] = await sql`SELECT * FROM cobranzas WHERE id = ${id}`;
  if (!c) return;
  if (!c.venta_id && Number(c.cobrado) > 0) {
    return avisoError("Tiene cobros registrados que ya entraron a la caja: no se puede borrar.");
  }
  await sql`DELETE FROM cobranzas WHERE id = ${id}`;
  await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
            VALUES (${usr.id}, 'cobranza', ${id}, 'borrada',
                    ${`${c.concepto} · ${plata(c.monto, c.moneda)} · cobrado ${plata(c.cobrado, c.moneda)}`})`;
  revalidatePath("/cobranzas");
  await avisoOk("Cobranza borrada");
}

export default async function Cobranzas() {
  await requierePermiso("cobranzas");
  const [filas, clientes, cuentas] = await Promise.all([
    // Si la cobranza no tiene cliente, se muestra el de su venta.
    sql`SELECT co.*, COALESCE(c.nombre, cv.nombre) AS nombre, COALESCE(c.apellido, cv.apellido) AS apellido,
               (co.monto - co.cobrado) AS saldo,
               (co.vencimiento < current_date AND co.estado <> 'cobrado') AS vencida
        FROM cobranzas co
        LEFT JOIN clientes c ON c.id = co.cliente_id
        LEFT JOIN ventas v ON v.id = co.venta_id
        LEFT JOIN clientes cv ON cv.id = v.cliente_id
        ORDER BY co.estado = 'cobrado', co.vencimiento`,
    sql`SELECT nombre, apellido FROM clientes ORDER BY apellido NULLS LAST, nombre LIMIT 3000`,
    sql`SELECT id, nombre, moneda FROM caja_cuentas WHERE activa ORDER BY posicion, id`,
  ]);

  const pend = filas.filter((f: any) => f.estado !== "cobrado");
  const vencidas = pend.filter((f: any) => f.vencida);

  // Los saldos no se suman entre monedas. Un saldo pactado en dólares se
  // reclama en dólares; convertirlo a pesos para el total da un número que
  // no es el que se firmó y que cambia solo cuando se mueve el dólar.
  const sumar = (l: any[], m: string) =>
    l.filter((f) => (f.moneda || "ARS") === m).reduce((a, f) => a + Number(f.saldo), 0);

  const pendARS = sumar(pend, "ARS");
  const pendUSD = sumar(pend, "USD");
  const cobradoUSD = filas
    .filter((f: any) => (f.moneda || "ARS") === "USD")
    .reduce((a: number, f: any) => a + Number(f.cobrado), 0);
  const hayUSD = filas.some((f: any) => (f.moneda || "ARS") === "USD");

  const boton = `inline-flex rounded-md border border-[var(--c-azul-borde)] bg-[var(--c-azul-fondo)]
    px-2 py-1 text-[11.5px] text-[var(--c-enlace)] hover:bg-[var(--c-azul-fondo-alto)] whitespace-nowrap cursor-pointer list-none`;

  return (
    <>
      <Encabezado titulo="Cobranzas" detalle="Lo que falta cobrar y lo que ya se venció."
        acciones={<><ImprimirListado /><Exportar que="cobranzas" /></>} />

      <GrillaKPI cols={hayUSD ? 4 : 3}>
        <KPI label="Saldo pendiente en pesos" valor={plata(pendARS)}
             detalle={`${numero(pend.filter((f: any) => (f.moneda || "ARS") === "ARS").length)} cuentas`} />
        {hayUSD && (
          <KPI label="Saldo pendiente en dólares" valor={plata(pendUSD, "USD")} tono="celeste"
               detalle={`${numero(pend.filter((f: any) => f.moneda === "USD").length)} cuentas`} />
        )}
        <KPI label="Vencidas" valor={numero(vencidas.length)} tono={vencidas.length ? "rojo" : "verde"}
             detalle={vencidas.length ? "hay que reclamar" : "nada vencido"} />
        {hayUSD
          ? <KPI label="Cobrado en dólares" valor={plata(cobradoUSD, "USD")} tono="verde" />
          : <KPI label="Pendientes" valor={numero(pend.length)} tono="amarillo" />}
      </GrillaKPI>

      <Panel className="mt-6 no-imprimir">
        <PanelTitulo titulo="Nueva cobranza"
          detalle="Lo que alguien le debe a la agencia fuera de una venta del sistema. El saldo de una venta se crea solo al cargarla." />
        <form action={crear} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Campo label="Cliente">
            <input name="cliente" className="campo" list="cobranzas-clientes" placeholder="Apellido, nombre" />
            <datalist id="cobranzas-clientes">
              {clientes.map((c: any, i: number) => <option key={i} value={nombreCliente(c)} />)}
            </datalist>
          </Campo>
          <Campo label="Concepto *">
            <input name="concepto" required className="campo" placeholder="Saldo auto, cuota 3 de 6…" />
          </Campo>
          <Campo label="Monto *">
            <input name="monto" type="number" step="0.01" min="0.01" required className="campo" />
          </Campo>
          <Campo label="Moneda">
            <select name="moneda" className="campo" defaultValue="ARS">
              <option value="ARS">Pesos</option>
              <option value="USD">Dólares</option>
            </select>
          </Campo>
          <Campo label="Vence">
            <input name="vencimiento" type="date" className="campo" defaultValue={hoy()} />
          </Campo>
          <Campo label="Cuota">
            <input name="cuota" className="campo" placeholder="Opcional (3/6)" />
          </Campo>
          <Campo label="Observaciones">
            <input name="observaciones" className="campo" />
          </Campo>
          <div className="flex items-end">
            <Boton tipo="submit" className="w-full">Cargar cobranza</Boton>
          </div>
        </form>
      </Panel>

      <div className="mt-6" />
      <Tabla>
        <thead><tr>
          <TH>Cliente</TH><TH>Concepto</TH><TH>Vencimiento</TH>
          <TH alinear="right">Monto</TH><TH alinear="right">Cobrado</TH>
          <TH alinear="right">Saldo</TH><TH>Estado</TH><TH></TH>
        </tr></thead>
        <tbody>
          {filas.length === 0 && <FilaVacia cols={8} mensaje="No hay cobranzas registradas." />}
          {filas.map((f: any) => {
            const moneda = (f.moneda || "ARS") as "ARS" | "USD";
            return (
              <tr key={f.id} className="hover:bg-[var(--c-hover)] align-top">
                <TD className="font-medium">{nombreCliente(f) || "—"}</TD>
                <TD className="text-[var(--c-tinta-media)]">
                  {f.venta_id
                    ? <Link href={`/ventas/${f.venta_id}`} className="hover:underline">{f.concepto}</Link>
                    : f.concepto}
                  {f.cuota && <span className="ml-1.5 text-[11.5px] text-[var(--c-tinta-tenue)]">({f.cuota})</span>}
                  {moneda === "USD" && (
                    <span className="ml-2 text-[11px] text-[var(--c-celeste)]">en dólares</span>
                  )}
                  {f.observaciones && <div className="text-[11.5px] text-[var(--c-tinta-tenue)]">{f.observaciones}</div>}
                </TD>
                <TD>{f.vencida
                  ? <Chip tono="rojo">{fecha(f.vencimiento)}</Chip>
                  : <span className="text-[var(--c-tinta-media)]">{fecha(f.vencimiento)}</span>}</TD>
                <TD alinear="right">{plata(f.monto, moneda)}</TD>
                <TD alinear="right" className="text-[var(--c-tinta-media)]">{plata(f.cobrado, moneda)}</TD>
                <TD alinear="right" className="font-medium">{plata(f.saldo, moneda)}</TD>
                <TD><Chip tono={f.estado === "cobrado" ? "verde" : f.vencida ? "rojo" : "amarillo"}>
                  {f.estado}</Chip></TD>
                <TD alinear="right">
                  <div className="flex items-start justify-end gap-3 no-imprimir">
                    {f.estado !== "cobrado" && (f.venta_id ? (
                      <Link href={`/ventas/${f.venta_id}#cobrar`} className={boton}>Registrar cobro</Link>
                    ) : (
                      <details className="text-left">
                        <summary className={boton}>Registrar cobro</summary>
                        <form action={cobrar} className="mt-2 w-[250px] space-y-2.5 p-3
                          bg-[var(--c-superficie)] border border-[var(--c-borde)] rounded-lg">
                          <input type="hidden" name="id" value={f.id} />
                          <Campo label={`Monto (${moneda})`}>
                            <input name="monto" type="number" step="0.01" min="0.01" required className="campo"
                              defaultValue={Number(f.saldo)} />
                          </Campo>
                          <Campo label="Fecha">
                            <input name="fecha" type="date" className="campo" defaultValue={hoy()} />
                          </Campo>
                          <Campo label="Entra a la cuenta">
                            <select name="cuenta" className="campo"
                              defaultValue={cuentas.find((c: any) => c.moneda === moneda)?.id ?? ""}>
                              {cuentas.filter((c: any) => c.moneda === moneda)
                                .map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                              <option value="">No mover la caja</option>
                            </select>
                          </Campo>
                          <Boton tipo="submit" className="w-full">Registrar</Boton>
                        </form>
                      </details>
                    ))}
                    {(f.venta_id || Number(f.cobrado) === 0) && (
                      <details className="text-left">
                        <summary className="cursor-pointer list-none text-[12px] text-[var(--c-rojo-alto)] hover:underline pt-1">
                          Borrar
                        </summary>
                        <form action={borrar} className="mt-2 w-[220px] space-y-2 p-3
                          bg-[var(--c-superficie)] border border-[var(--c-borde)] rounded-lg">
                          <input type="hidden" name="id" value={f.id} />
                          <p className="text-[12px] text-[var(--c-tinta-clara)]">
                            {f.venta_id
                              ? "Se borra esta cobranza. Los cobros de la venta quedan como están."
                              : "Se borra esta cobranza."}
                          </p>
                          <button type="submit"
                            className="w-full rounded-lg bg-[var(--c-rojo)] hover:bg-[var(--c-rojo-alto)] px-3 py-1.5
                              text-[12.5px] font-semibold text-white">
                            Sí, borrarla
                          </button>
                        </form>
                      </details>
                    )}
                  </div>
                </TD>
              </tr>
            );
          })}
        </tbody>
      </Tabla>

      {hayUSD && (
        <p className="mt-4 text-[11.5px] text-[var(--c-tinta-tenue)] leading-relaxed max-w-2xl">
          Los saldos en dólares no se suman a los de pesos. Un saldo pactado en dólares se
          reclama en dólares: convertirlo daría un número que no es el que se firmó y que
          cambiaría solo cada vez que se mueve la cotización.
        </p>
      )}
    </>
  );
}
