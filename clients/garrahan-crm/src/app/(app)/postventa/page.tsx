import Link from "next/link";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requierePermiso } from "@/lib/auth";
import { fecha, numero } from "@/lib/format";
import { ESTADOS_TRAMITE, DIAS_TRANSFERENCIA, DIAS_VTV, TRAMITE_TERMINADO } from "@/lib/constantes";
import {
  Encabezado, KPI, GrillaKPI, Chip, Tabla, TH, TD, FilaVacia, Boton, Campo,
} from "@/components/ui";
import SelectEstado from "@/components/select-estado";

export const dynamic = "force-dynamic";

/**
 * Lo que pasa después de entregar el auto: el llamado a los 7 días, el
 * seguimiento de la transferencia y la VTV. Después, los contactos a 30 y 90
 * días, que es de donde salen los referidos.
 */
export default async function Postventa({ searchParams }: { searchParams: Promise<any> }) {
  await requierePermiso("ventas");
  const p = await searchParams;
  const filtro = p.ver || "pendientes";

  const filas = await sql`
    SELECT pv.*, v.id AS venta_id, v.estado_tramite,
           c.nombre AS cliente, c.apellido, c.telefono,
           x.marca, x.modelo, x.anio, x.dominio,
           (current_date - pv.entrega) AS dias,
           (pv.vtv_vence - current_date) AS dias_vtv
    FROM postventa pv
    JOIN ventas v ON v.id = pv.venta_id
    LEFT JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN vehiculos x ON x.id = v.vehiculo_id
    WHERE v.estado <> 'cancelada'
    ORDER BY pv.entrega DESC`;

  const debe = (f: any, dias: number, hecho: any) => !hecho && Number(f.dias) >= dias;
  const llamadoPendiente = (f: any) => debe(f, 7, f.contacto_7);
  const contactoPendiente = (f: any) => debe(f, 30, f.contacto_30) || debe(f, 90, f.contacto_90);
  const transferenciaDemorada = (f: any) =>
    !TRAMITE_TERMINADO.includes(f.estado_tramite) && Number(f.dias) >= DIAS_TRANSFERENCIA;
  const vtvPorVencer = (f: any) => f.vtv_vence !== null && Number(f.dias_vtv) <= DIAS_VTV;

  const pendientes = filas.filter((f: any) =>
    llamadoPendiente(f) || contactoPendiente(f) || transferenciaDemorada(f) || vtvPorVencer(f));
  const transferencias = filas.filter((f: any) => !TRAMITE_TERMINADO.includes(f.estado_tramite));
  const vtv = filas.filter((f: any) => f.vtv_vence !== null && Number(f.dias_vtv) <= 60);
  const referidos = filas.filter((f: any) => f.referido);
  const conNps = filas.filter((f: any) => f.nps !== null);
  const nps = conNps.length
    ? conNps.reduce((a: number, f: any) => a + Number(f.nps), 0) / conNps.length
    : 0;

  const lista = filtro === "pendientes" ? pendientes
    : filtro === "transferencias" ? transferencias
    : filtro === "vtv" ? vtv
    : filtro === "referidos" ? referidos
    : filas;

  /* ------------------------------------------------------------ acciones */
  async function registrar(fd: FormData) {
    "use server";
    await requierePermiso("ventas");
    const id = Number(fd.get("id") || 0);
    const hito = String(fd.get("hito") || "7");
    const resultado = String(fd.get("resultado") || "").trim() || null;
    const hoy = new Date().toISOString().slice(0, 10);
    if (!id) return;

    if (hito === "7") {
      await sql`UPDATE postventa SET contacto_7 = ${hoy}, resultado_7 = ${resultado} WHERE id = ${id}`;
    } else if (hito === "30") {
      await sql`UPDATE postventa SET contacto_30 = ${hoy}, resultado_30 = ${resultado} WHERE id = ${id}`;
    } else {
      await sql`UPDATE postventa SET contacto_90 = ${hoy}, resultado_90 = ${resultado} WHERE id = ${id}`;
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

  async function cambiarTramite(fd: FormData) {
    "use server";
    const usr = await requierePermiso("ventas");
    const ventaId = Number(fd.get("id"));
    const nuevo = String(fd.get("estado") || "");
    if (!ventaId || !ESTADOS_TRAMITE[nuevo]) return;
    await sql`UPDATE ventas SET estado_tramite = ${nuevo} WHERE id = ${ventaId}`;
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'venta', ${ventaId}, 'tramite', ${nuevo})`;
    revalidatePath("/postventa");
  }

  async function guardarVtv(fd: FormData) {
    "use server";
    await requierePermiso("ventas");
    const id = Number(fd.get("id"));
    const vence = String(fd.get("vtv_vence") || "") || null;
    if (!id) return;
    await sql`UPDATE postventa SET vtv_vence = ${vence} WHERE id = ${id}`;
    revalidatePath("/postventa");
  }

  const TABS = [
    ["pendientes", "Por hacer", pendientes.length],
    ["transferencias", "Transferencias abiertas", transferencias.length],
    ["vtv", "VTV", vtv.length],
    ["referidos", "Referidos", referidos.length],
    ["todos", "Todas las entregas", filas.length],
  ] as const;

  const hitoSugerido = (f: any) =>
    !f.contacto_7 ? "7" : !f.contacto_30 && Number(f.dias) >= 30 ? "30" : !f.contacto_90 ? "90" : "30";

  return (
    <>
      <Encabezado titulo="Postventa"
        detalle="Llamado a los 7 días de la entrega, transferencia, VTV y contactos a 30 y 90 días." />

      <GrillaKPI>
        <KPI label="Llamados de 7 días pendientes" valor={numero(filas.filter(llamadoPendiente).length)}
          tono={filas.some(llamadoPendiente) ? "rojo" : "verde"} />
        <KPI label="Transferencias demoradas" valor={numero(filas.filter(transferenciaDemorada).length)}
          tono={filas.some(transferenciaDemorada) ? "amarillo" : "verde"}
          detalle={`más de ${DIAS_TRANSFERENCIA} días sin inscribir`} />
        <KPI label="VTV por vencer" valor={numero(filas.filter(vtvPorVencer).length)}
          tono={filas.some(vtvPorVencer) ? "amarillo" : "verde"} detalle={`próximos ${DIAS_VTV} días`} />
        <KPI label="Satisfacción promedio" valor={conNps.length ? nps.toFixed(1) + " / 10" : "—"}
          detalle={conNps.length ? `${conNps.length} respuestas · ${referidos.length} referidos` : "sin respuestas todavía"} />
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
            <TH alinear="center">7 días</TH><TH alinear="center">30 / 90</TH>
            <TH>Transferencia</TH><TH>VTV</TH><TH></TH>
          </tr>
        </thead>
        <tbody>
          {lista.length === 0 && (
            <FilaVacia cols={8} mensaje={
              filtro === "pendientes" ? "No hay nada pendiente. Al día."
                : filtro === "transferencias" ? "No hay transferencias abiertas."
                : filtro === "vtv" ? "Ninguna VTV vence en los próximos 60 días."
                : filtro === "referidos" ? "Todavía no se registró ningún referido."
                : "No hay entregas con seguimiento abierto."} />
          )}
          {lista.map((f: any) => (
            <tr key={f.id} className="hover:bg-[var(--c-hover)] align-top">
              <TD>
                <div className="font-medium">{f.cliente ? `${f.cliente} ${f.apellido || ""}` : "—"}</div>
                {f.telefono && (
                  <a href={`https://wa.me/${soloNumeros(f.telefono)}`} target="_blank" rel="noreferrer"
                    className="text-[11.5px] text-[var(--c-enlace)] hover:underline">{f.telefono}</a>
                )}
              </TD>
              <TD className="text-[var(--c-tinta-media)]">
                <Link href={`/ventas/${f.venta_id}`} className="hover:text-[var(--c-primario)]">
                  {f.marca} {f.modelo} {f.anio || ""}
                </Link>
                {f.dominio && <div className="text-[11.5px] text-[var(--c-tinta-tenue)]">{String(f.dominio).toUpperCase()}</div>}
              </TD>
              <TD className="text-[var(--c-tinta-media)]">
                {fecha(f.entrega)}
                <div className="text-[11.5px] text-[var(--c-tinta-tenue)]">hace {numero(f.dias)} días</div>
              </TD>
              <TD alinear="center">
                {f.contacto_7
                  ? <span title={f.resultado_7 || ""}><Chip tono="verde">Llamado</Chip></span>
                  : Number(f.dias) >= 7 ? <Chip tono="rojo">Llamar</Chip>
                  : <span className="text-[11.5px] text-[var(--c-tinta-tenue)]">en {7 - Number(f.dias)} d</span>}
              </TD>
              <TD alinear="center">
                <div className="flex justify-center gap-1">
                  <Hito hecho={f.contacto_30} debe={Number(f.dias) >= 30} label="30" />
                  <Hito hecho={f.contacto_90} debe={Number(f.dias) >= 90} label="90" />
                </div>
              </TD>
              <TD>
                <SelectEstado id={f.venta_id} valor={f.estado_tramite || "iniciado"} accion={cambiarTramite}
                  opciones={Object.entries(ESTADOS_TRAMITE).map(([k, l]) => ({ valor: k, label: l }))} />
                {transferenciaDemorada(f) && (
                  <div className="mt-1 text-[11px] font-semibold text-[var(--c-amarillo)]">Demorada</div>
                )}
              </TD>
              <TD>
                <form action={guardarVtv} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={f.id} />
                  <input name="vtv_vence" type="date" className="campo py-1 text-[12px] w-[140px]"
                    defaultValue={f.vtv_vence ? new Date(f.vtv_vence).toISOString().slice(0, 10) : ""} />
                  <button type="submit" className="text-[11.5px] text-[var(--c-enlace)] hover:underline">OK</button>
                </form>
                {f.vtv_vence && Number(f.dias_vtv) <= DIAS_VTV && (
                  <div className={`mt-1 text-[11px] font-semibold ${Number(f.dias_vtv) < 0 ? "text-[var(--c-rojo-alto)]" : "text-[var(--c-amarillo)]"}`}>
                    {Number(f.dias_vtv) < 0 ? `Vencida hace ${-Number(f.dias_vtv)} días` : `Vence en ${f.dias_vtv} días`}
                  </div>
                )}
              </TD>
              <TD>
                <details className="group">
                  <summary className="cursor-pointer list-none text-[12.5px] text-[var(--c-enlace)] hover:underline">
                    Registrar
                  </summary>
                  <form action={registrar} className="mt-3 w-[280px] space-y-2.5 p-3
                    bg-[var(--c-superficie)] border border-[var(--c-borde)] rounded-lg">
                    <input type="hidden" name="id" value={f.id} />
                    <Campo label="Contacto">
                      <select name="hito" className="campo" defaultValue={hitoSugerido(f)}>
                        <option value="7">Llamado a los 7 días</option>
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
        El seguimiento se abre solo cuando una venta pasa a completada, con la VTV que tenía
        cargada la unidad. Si cargás un referido, se crea el lead en Captación para que alguien lo trabaje.
      </p>
    </>
  );
}

function Hito({ hecho, debe, label }: { hecho: any; debe: boolean; label: string }) {
  if (hecho) return <Chip tono="verde">{label}</Chip>;
  if (debe) return <Chip tono="amarillo">{label}</Chip>;
  return <Chip tono="gris">{label}</Chip>;
}

function soloNumeros(t: string | null) {
  const n = (t || "").replace(/\D/g, "");
  return n.startsWith("54") ? n : "54" + n;
}
