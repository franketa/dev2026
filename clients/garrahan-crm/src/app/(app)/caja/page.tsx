import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Plus, Pencil } from "lucide-react";
import { avisoOk, avisoError, SIN_PERMISO } from "@/lib/aviso";
import { sql } from "@/lib/db";
import { requierePermiso, veCostos } from "@/lib/auth";
import { plata, plataCorta, fecha } from "@/lib/format";
import { CATEGORIAS } from "@/lib/constantes";
import { leerMovimiento, guardarMovimiento } from "@/lib/caja";
import { vehiculosParaCostos } from "@/lib/costos";
import {
  Encabezado, KPI, GrillaKPI, Panel, PanelTitulo, Chip, Tabla, TH, TD,
  FilaVacia, Boton, Campo, Monto,
} from "@/components/ui";
import Exportar from "@/components/exportar";
import ImprimirListado from "@/components/imprimir-listado";
import CamposMovimiento from "@/components/campos-movimiento";

export const dynamic = "force-dynamic";

export default async function Caja({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requierePermiso("caja");
  if (!veCostos(u)) {
    return <Panel><p className="text-[13px] text-[var(--c-tinta-media)] py-8 text-center">
      Tu perfil no tiene acceso a la caja.</p></Panel>;
  }
  const p = await searchParams;
  const cuentaF = p.cuenta || "";
  const esDueno = u.rol === "dueno";

  // Las preparaciones sin auto no suman al costo de ninguna unidad ni al
  // resultado: se listan aparte para asignarles el auto.
  const sinAuto = p.sinauto === "1";
  const where = sinAuto
    ? sql`WHERE m.tipo = 'egreso' AND m.categoria = 'prep_unidad' AND m.vehiculo_id IS NULL`
    : cuentaF ? sql`WHERE m.cuenta_id = ${Number(cuentaF)}` : sql``;

  const [saldos, movimientos, cuentas, mes, porCategoria, vehiculos, [huerfanos]] = await Promise.all([
    sql`SELECT s.* FROM v_saldos s JOIN caja_cuentas c ON c.id = s.id
        WHERE c.activa ORDER BY s.moneda, c.posicion, s.id`,
    sql`SELECT m.*, c.nombre AS cuenta, cd.nombre AS destino, v.dominio, v.marca, v.modelo
        FROM caja_movimientos m
        JOIN caja_cuentas c ON c.id = m.cuenta_id
        LEFT JOIN caja_cuentas cd ON cd.id = m.cuenta_destino_id
        LEFT JOIN vehiculos v ON v.id = m.vehiculo_id
        ${where}
        ORDER BY m.fecha DESC, m.id DESC LIMIT 120`,
    sql`SELECT id, nombre, moneda FROM caja_cuentas WHERE activa ORDER BY posicion, id`,
    sql`SELECT
          COALESCE(SUM(equivalente_ars) FILTER (WHERE tipo = 'ingreso'),0) AS ingresos,
          COALESCE(SUM(equivalente_ars) FILTER (WHERE tipo = 'egreso'),0) AS egresos
        FROM caja_movimientos
        WHERE fecha >= date_trunc('month', current_date) AND tipo <> 'transferencia'`,
    sql`SELECT categoria, SUM(equivalente_ars) AS total
        FROM caja_movimientos
        WHERE tipo = 'egreso' AND fecha >= date_trunc('month', current_date)
          AND categoria IS NOT NULL
        GROUP BY categoria ORDER BY total DESC LIMIT 8`,
    vehiculosParaCostos(sql),
    sql`SELECT count(*)::int AS n, COALESCE(SUM(equivalente_ars),0) AS total FROM caja_movimientos
        WHERE tipo = 'egreso' AND categoria = 'prep_unidad' AND vehiculo_id IS NULL`,
  ]);

  const m = mes[0] || {};
  const totalArs = saldos.filter((s: any) => s.moneda === "ARS")
    .reduce((a: number, s: any) => a + Number(s.saldo), 0);
  const totalUsd = saldos.filter((s: any) => s.moneda === "USD")
    .reduce((a: number, s: any) => a + Number(s.saldo), 0);

  const etiquetaCat = (c: string) => CATEGORIAS.find((x) => x.valor === c)?.label || c || "—";

  async function nuevoMovimiento(fd: FormData) {
    "use server";
    const usr = await requierePermiso("caja");
    if (!veCostos(usr)) return avisoError(SIN_PERMISO);
    const d = leerMovimiento(fd);
    if (typeof d === "string") return avisoError(d);
    await sql.begin((tx) => guardarMovimiento(tx, d, usr.id));
    const tipo = d.tipo;
    revalidatePath("/caja");
    for (const v of d.vehiculos) revalidatePath(`/vehiculos/${v}`);
    await avisoOk(d.vehiculos.length > 1 ? `Egreso registrado y repartido entre ${d.vehiculos.length} autos`
      : d.vehiculos.length ? "Egreso registrado y sumado al costo del auto"
      : tipo === "ingreso" ? "Ingreso registrado" : tipo === "transferencia" ? "Transferencia registrada" : "Egreso registrado");
  }

  return (
    <>
      <Encabezado titulo="Caja" detalle="Todos los movimientos, en las cuentas reales de la agencia."
        acciones={<><ImprimirListado /><Exportar que="caja" />
          <Boton href="/caja/cuentas" variante="suave">Cuentas</Boton></>} />

      <GrillaKPI>
        {/* Pesos y dólares van separados: sumarlos a una cotización del día
            da un número que no existe en ninguna caja. */}
        <KPI label="Caja en pesos" valor={plataCorta(totalArs)}
             detalle={`${saldos.filter((s: any) => s.moneda === "ARS").length} cuentas`} />
        <KPI label="Caja en dólares" valor={plata(totalUsd, "USD")}
             detalle={`${saldos.filter((s: any) => s.moneda === "USD").length} cuentas`} />
        <KPI label="Ingresos del mes" valor={plataCorta(m.ingresos)} tono="verde"
             detalle={`egresos ${plataCorta(m.egresos)}`} />
        <KPI label="Resultado del mes"
             valor={<Monto valor={Number(m.ingresos) - Number(m.egresos)} signo />}
             detalle="sin contar compras de unidades" />
      </GrillaKPI>

      {/* ------------------------------------------------------ cuentas */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
        {saldos.map((s: any) => (
          <Link key={s.id} href={`/caja?cuenta=${s.id}`}
            className={`rounded-xl border px-4 py-3.5 transition-colors
              ${String(s.id) === cuentaF ? "border-[var(--c-primario)] bg-[var(--c-degradado-b)]" : "border-[var(--c-borde)] bg-[var(--c-panel)] hover:border-[var(--c-borde-alto)]"}`}>
            <div className="etiqueta truncate">{s.nombre}</div>
            <div className={`mt-1.5 text-[18px] font-semibold tabular
              ${Number(s.saldo) < 0 ? "text-[var(--c-rojo-alto)]" : ""}`}>
              {plata(s.saldo, s.moneda)}
            </div>
          </Link>
        ))}
      </div>

      {esDueno && huerfanos.n > 0 && !sinAuto && (
        <div className="mt-4 rounded-xl border border-[var(--c-amarillo)] bg-[var(--c-amarillo-fondo)] px-4 py-3
          flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-[var(--c-tinta-clara)] leading-relaxed">
            Hay <b>{huerfanos.n} {huerfanos.n === 1 ? "gasto" : "gastos"} de preparación sin auto</b> ({plata(huerfanos.total)}):
            no {huerfanos.n === 1 ? "suma" : "suman"} al costo de ninguna unidad ni al resultado.
          </p>
          <Boton href="/caja?sinauto=1" variante="suave">Asignarles el auto</Boton>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        {/* ------------------------------------------------- nuevo movimiento */}
        <Panel className="lg:col-span-2">
          <PanelTitulo titulo="Nuevo movimiento"
            detalle="Si el gasto es de un auto para vender, elegí Prep. de unidades y el auto: se suma a su costo." />
          <form action={nuevoMovimiento} className="grid sm:grid-cols-4 gap-3 items-end">
            <CamposMovimiento cuentas={cuentas as any} vehiculos={vehiculos as any} />
            <div className="sm:col-span-4"><Boton tipo="submit"><Plus size={15} /> Registrar</Boton></div>
          </form>
        </Panel>

        {/* --------------------------------------------------- por categoría */}
        <Panel>
          <PanelTitulo titulo="Gastos del mes" detalle="Por categoría" />
          {porCategoria.length === 0 ? (
            <p className="text-[13px] text-[var(--c-tinta-tenue)] py-6 text-center">Sin gastos en el período.</p>
          ) : (
            <div className="space-y-2.5">
              {porCategoria.map((c: any) => (
                <div key={c.categoria} className="flex items-baseline justify-between gap-3">
                  <span className="text-[12.5px] text-[var(--c-tinta-clara)] truncate">{etiquetaCat(c.categoria)}</span>
                  <span className="text-[12.5px] tabular text-[var(--c-tinta-media)] shrink-0">{plata(c.total)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 pt-3 border-t border-[var(--c-borde)] text-[11.5px] text-[var(--c-tinta-tenue)] leading-relaxed">
            La compra y la preparación de unidades no cuentan como gasto del mes:
            son costo de la unidad y pegan en el resultado cuando se vende.
          </p>
        </Panel>
      </div>

      {/* ----------------------------------------------------- movimientos */}
      <div className="flex items-center justify-between mt-6 mb-3">
        <h2 className="text-[15px] font-semibold">
          {sinAuto ? "Preparaciones sin auto: tocá el lápiz y elegí el auto" : "Movimientos"}
        </h2>
        {sinAuto && <Link href="/caja" className="text-[12.5px] text-[var(--c-primario)] hover:underline">Ver todos</Link>}
        {cuentaF && !sinAuto && <Link href="/caja" className="text-[12.5px] text-[var(--c-primario)] hover:underline">Ver todas las cuentas</Link>}
      </div>

      <Tabla>
        <thead>
          <tr>
            <TH>Fecha</TH><TH>Tipo</TH><TH>Cuenta</TH><TH>Categoría</TH>
            <TH>Descripción</TH><TH>Unidad</TH><TH alinear="right">Monto</TH>
            {esDueno && <TH><span className="sr-only">Corregir</span></TH>}
          </tr>
        </thead>
        <tbody>
          {movimientos.length === 0 && <FilaVacia cols={esDueno ? 8 : 7} mensaje="No hay movimientos cargados." />}
          {movimientos.map((mv: any) => (
            <tr key={mv.id} className="hover:bg-[var(--c-hover)]">
              <TD className="text-[var(--c-tinta-media)]">{fecha(mv.fecha)}</TD>
              <TD>
                <Chip tono={mv.tipo === "ingreso" ? "verde" : mv.tipo === "egreso" ? "rojo" : "gris"}>
                  {mv.tipo === "transferencia" ? "Transferencia" : mv.tipo === "ingreso" ? "Ingreso" : "Egreso"}
                </Chip>
              </TD>
              <TD className="text-[var(--c-tinta-media)]">
                {mv.cuenta}{mv.destino && <span className="text-[var(--c-tinta-tenue)]"> → {mv.destino}</span>}
              </TD>
              <TD className="text-[var(--c-tinta-media)] text-[12.5px]">{etiquetaCat(mv.categoria)}</TD>
              <TD>
                {mv.descripcion}
                {mv.contraparte && <div className="text-[11.5px] text-[var(--c-tinta-tenue)]">{mv.contraparte}</div>}
              </TD>
              <TD>
                {mv.vehiculo_id ? (
                  <Link href={`/vehiculos/${mv.vehiculo_id}`} className="text-[12px] text-[var(--c-enlace)] hover:underline">
                    {mv.dominio || `${mv.marca} ${mv.modelo}`}
                  </Link>
                ) : <span className="text-[var(--c-tinta-tenue)]">—</span>}
              </TD>
              <TD alinear="right">
                <Monto valor={mv.tipo === "egreso" ? -Number(mv.equivalente_ars) : Number(mv.equivalente_ars)}
                       signo={mv.tipo !== "transferencia"} />
                {mv.moneda === "USD" && (
                  <div className="text-[11px] text-[var(--c-tinta-tenue)]">{plata(mv.monto, "USD")} @ {mv.cotizacion}</div>
                )}
              </TD>
              {esDueno && (
                <TD alinear="right">
                  <Link href={`/caja/${mv.id}`} aria-label="Corregir el movimiento"
                    className="inline-grid place-items-center h-7 w-7 rounded-lg text-[var(--c-tinta-tenue)]
                      hover:text-[var(--c-tinta)] hover:bg-[var(--c-activo)]">
                    <Pencil size={14} />
                  </Link>
                </TD>
              )}
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
