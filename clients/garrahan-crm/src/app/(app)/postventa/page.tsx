import Link from "next/link";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requiereSesion } from "@/lib/auth";
import { fecha, numero } from "@/lib/format";
import {
  Encabezado, KPI, GrillaKPI, Panel, PanelTitulo, Chip, Tabla, TH, TD,
  FilaVacia, Boton, Campo,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * El seguimiento después de la entrega: a los 30 días y a los 90. No es
 * cortesía — de acá salen los referidos, que son el lead más barato que hay.
 */
export default async function Postventa({ searchParams }: { searchParams: Promise<any> }) {
  await requiereSesion();
  const p = await searchParams;
  const filtro = p.ver || "pendientes";

  const filas = await sql`
    SELECT pv.*, v.id AS venta_id, v.fecha AS fecha_venta,
           c.nombre AS cliente, c.apellido, c.telefono,
           x.marca, x.modelo, x.anio,
           (current_date - v.fecha) AS dias
    FROM postventa pv
    JOIN ventas v ON v.id = pv.venta_id
    LEFT JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN vehiculos x ON x.id = v.vehiculo_id
    ORDER BY v.fecha DESC`;

  const pendientes = filas.filter((f: any) =>
    (!f.contacto_30 && Number(f.dias) >= 30) || (!f.contacto_90 && Number(f.dias) >= 90));
  const referidos = filas.filter((f: any) => f.referido);
  const conNps = filas.filter((f: any) => f.nps !== null);
  const nps = conNps.length
    ? conNps.reduce((a: number, f: any) => a + Number(f.nps), 0) / conNps.length
    : 0;

  const lista = filtro === "pendientes" ? pendientes
    : filtro === "referidos" ? referidos
    : filas;

  async function registrar(fd: FormData) {
    "use server";
    await requiereSesion();
    const id = Number(fd.get("id") || 0);
    const hito = String(fd.get("hito") || "30");
    const resultado = String(fd.get("resultado") || "").trim();
    const hoy = new Date().toISOString().slice(0, 10);
    if (!id) return;

    if (hito === "30") {
      await sql`UPDATE postventa SET contacto_30 = ${hoy}, resultado_30 = ${resultado || null}
                WHERE id = ${id}`;
    } else {
      await sql`UPDATE postventa SET contacto_90 = ${hoy}, resultado_90 = ${resultado || null}
                WHERE id = ${id}`;
    }

    const nota = Number(fd.get("nps") || 0);
    if (nota) await sql`UPDATE postventa SET nps = ${nota} WHERE id = ${id}`;

    const ref = String(fd.get("referido") || "").trim();
    if (ref) {
      await sql`UPDATE postventa SET referido = true, nombre_referido = ${ref},
                                     estado_referido = 'nuevo' WHERE id = ${id}`;
      // Un referido es un lead: entra al embudo como cualquier otro.
      await sql`INSERT INTO leads (nombre, origen, estado, etapa, observaciones)
                VALUES (${ref}, 'referido', 'nuevo', 'captacion',
                        ${"Referido por un cliente (postventa #" + id + ")"})`;
    }
    revalidatePath("/postventa");
  }

  const TABS = [
    ["pendientes", "Por contactar", pendientes.length],
    ["referidos", "Referidos", referidos.length],
    ["todos", "Todas las entregas", filas.length],
  ] as const;

  return (
    <>
      <Encabezado titulo="Postventa"
        detalle="Contacto a los 30 y a los 90 días de cada entrega." />

      <GrillaKPI>
        <KPI label="Entregas con seguimiento" valor={numero(filas.length)} />
        <KPI label="Por contactar" valor={numero(pendientes.length)}
          tono={pendientes.length > 0 ? "amarillo" : "verde"} />
        <KPI label="Referidos generados" valor={numero(referidos.length)} tono="verde"
          detalle="pasan al embudo como leads" />
        <KPI label="Satisfacción promedio" valor={conNps.length ? nps.toFixed(1) + " / 10" : "—"}
          detalle={conNps.length ? `sobre ${conNps.length} respuestas` : "sin respuestas todavía"} />
      </GrillaKPI>

      <div className="flex flex-wrap gap-1 my-4 border-b border-[var(--c-borde)]">
        {TABS.map(([v, l, n]) => (
          <Link key={v} href={`/postventa?ver=${v}`}
            className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors
              ${filtro === v ? "border-[var(--c-primario)] text-[var(--c-tinta)]" : "border-transparent text-[var(--c-tinta-media)] hover:text-[var(--c-tinta-clara)]"}`}>
            {l} <span className="text-[var(--c-tinta-tenue)]">({n})</span>
          </Link>
        ))}
      </div>

      <Tabla>
        <thead>
          <tr>
            <TH>Cliente</TH><TH>Unidad</TH><TH>Entrega</TH>
            <TH alinear="center">30 días</TH><TH alinear="center">90 días</TH>
            <TH alinear="center">Nota</TH><TH>Referido</TH><TH></TH>
          </tr>
        </thead>
        <tbody>
          {lista.length === 0 && (
            <FilaVacia cols={8} mensaje={
              filtro === "pendientes" ? "No hay contactos pendientes. Al día."
                : filtro === "referidos" ? "Todavía no se registró ningún referido."
                : "No hay entregas con seguimiento abierto."} />
          )}
          {lista.map((f: any) => (
            <tr key={f.id} className="hover:bg-[var(--c-hover)] align-top">
              <TD>
                <div className="font-medium">{f.cliente ? `${f.cliente} ${f.apellido || ""}` : "—"}</div>
                <div className="text-[11.5px] text-[var(--c-tinta-tenue)]">{f.telefono || ""}</div>
              </TD>
              <TD className="text-[var(--c-tinta-media)]">
                <Link href={`/ventas/${f.venta_id}`} className="hover:text-[var(--c-primario)]">
                  {f.marca} {f.modelo} {f.anio || ""}
                </Link>
              </TD>
              <TD className="text-[var(--c-tinta-media)]">
                {fecha(f.fecha_venta)}
                <div className="text-[11.5px] text-[var(--c-tinta-tenue)]">hace {numero(f.dias)} días</div>
              </TD>
              <TD alinear="center">
                {f.contacto_30
                  ? <Chip tono="verde">{fecha(f.contacto_30)}</Chip>
                  : Number(f.dias) >= 30 ? <Chip tono="amarillo">Vencido</Chip>
                  : <span className="text-[var(--c-tinta-apagada)]">—</span>}
              </TD>
              <TD alinear="center">
                {f.contacto_90
                  ? <Chip tono="verde">{fecha(f.contacto_90)}</Chip>
                  : Number(f.dias) >= 90 ? <Chip tono="amarillo">Vencido</Chip>
                  : <span className="text-[var(--c-tinta-apagada)]">—</span>}
              </TD>
              <TD alinear="center">{f.nps !== null ? `${f.nps}/10` : "—"}</TD>
              <TD className="text-[var(--c-tinta-media)]">{f.nombre_referido || "—"}</TD>
              <TD>
                <details className="group">
                  <summary className="cursor-pointer list-none text-[12.5px] text-[var(--c-enlace)] hover:underline">
                    Registrar
                  </summary>
                  <form action={registrar} className="mt-3 w-[300px] space-y-2.5 p-3
                    bg-[var(--c-superficie)] border border-[var(--c-borde)] rounded-lg">
                    <input type="hidden" name="id" value={f.id} />
                    <Campo label="Hito">
                      <select name="hito" className="campo" defaultValue={f.contacto_30 ? "90" : "30"}>
                        <option value="30">Contacto a 30 días</option>
                        <option value="90">Contacto a 90 días</option>
                      </select>
                    </Campo>
                    <Campo label="Qué dijo">
                      <input name="resultado" className="campo" placeholder="Conforme, sin reclamos" />
                    </Campo>
                    <Campo label="Nota del 1 al 10">
                      <input name="nps" type="number" min="1" max="10" className="campo" />
                    </Campo>
                    <Campo label="¿Refirió a alguien?">
                      <input name="referido" className="campo" placeholder="Nombre del referido" />
                    </Campo>
                    <Boton tipo="submit" className="w-full">Guardar</Boton>
                  </form>
                </details>
              </TD>
            </tr>
          ))}
        </tbody>
      </Tabla>

      <p className="mt-4 text-[11.5px] text-[var(--c-tinta-tenue)] leading-relaxed max-w-2xl">
        El seguimiento se abre solo cuando una venta pasa a completada. Si cargás un
        referido, se crea el lead en Captación para que alguien lo trabaje.
      </p>
    </>
  );
}
