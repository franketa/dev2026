import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Plus } from "lucide-react";
import { sql } from "@/lib/db";
import { requiereSesion, veCostos } from "@/lib/auth";
import { plata, plataCorta, fecha } from "@/lib/format";
import { CATEGORIAS, CATEGORIAS_INVENTARIO } from "@/lib/constantes";
import {
  Encabezado, KPI, GrillaKPI, Panel, PanelTitulo, Chip, Tabla, TH, TD,
  FilaVacia, Boton, Campo, Monto,
} from "@/components/ui";
import Exportar from "@/components/exportar";

export const dynamic = "force-dynamic";

export default async function Caja({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requiereSesion();
  if (!veCostos(u)) {
    return <Panel><p className="text-[13px] text-[#9aa7b8] py-8 text-center">
      Tu perfil no tiene acceso a la caja.</p></Panel>;
  }
  const p = await searchParams;
  const cuentaF = p.cuenta || "";

  const where = cuentaF ? sql`WHERE m.cuenta_id = ${Number(cuentaF)}` : sql``;

  const [saldos, movimientos, cuentas, mes, porCategoria] = await Promise.all([
    sql`SELECT * FROM v_saldos ORDER BY id`,
    sql`SELECT m.*, c.nombre AS cuenta, cd.nombre AS destino, v.dominio
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
  ]);

  const m = mes[0] || {};
  const totalArs = saldos.filter((s: any) => s.moneda === "ARS")
    .reduce((a: number, s: any) => a + Number(s.saldo), 0);
  const totalUsd = saldos.filter((s: any) => s.moneda === "USD")
    .reduce((a: number, s: any) => a + Number(s.saldo), 0);

  const etiquetaCat = (c: string) => CATEGORIAS.find((x) => x.valor === c)?.label || c || "—";

  async function nuevoMovimiento(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    if (!veCostos(usr)) return;
    const monto = Number(fd.get("monto") || 0);
    if (!monto) return;
    const moneda = String(fd.get("moneda") || "ARS");
    const cot = Number(fd.get("cotizacion") || 1) || 1;
    const tipo = String(fd.get("tipo") || "egreso");
    await sql`
      INSERT INTO caja_movimientos
        (fecha, tipo, cuenta_id, cuenta_destino_id, categoria, descripcion, contraparte,
         monto, moneda, cotizacion, equivalente_ars, forma_pago, usuario_id)
      VALUES (${String(fd.get("fecha"))}, ${tipo}, ${Number(fd.get("cuenta"))},
              ${fd.get("destino") ? Number(fd.get("destino")) : null},
              ${tipo === "transferencia" ? null : String(fd.get("categoria") || "")},
              ${String(fd.get("descripcion") || "")}, ${String(fd.get("contraparte") || "")},
              ${monto}, ${moneda}, ${cot},
              ${moneda === "USD" ? monto * cot : monto},
              ${String(fd.get("forma_pago") || "")}, ${usr.id})`;
    revalidatePath("/caja");
  }

  return (
    <>
      <Encabezado titulo="Caja" detalle="Todos los movimientos, en las cuentas reales de la agencia."
        acciones={<Exportar que="caja" />} />

      <GrillaKPI>
        <KPI label="Ingresos del mes" valor={plataCorta(m.ingresos)} tono="verde" />
        <KPI label="Egresos del mes" valor={plataCorta(m.egresos)} tono="rojo" />
        <KPI label="Resultado del mes"
             valor={<Monto valor={Number(m.ingresos) - Number(m.egresos)} signo />}
             detalle="sin contar compras de unidades" />
        <KPI label="Saldo total" valor={plataCorta(totalArs)}
             detalle={totalUsd !== 0 ? `+ ${plata(totalUsd, "USD")}` : undefined} />
      </GrillaKPI>

      {/* ------------------------------------------------------ cuentas */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
        {saldos.map((s: any) => (
          <Link key={s.id} href={`/caja?cuenta=${s.id}`}
            className={`rounded-xl border px-4 py-3.5 transition-colors
              ${String(s.id) === cuentaF ? "border-[#2f6bff] bg-[#0f1a33]" : "border-[#1f2937] bg-[#111721] hover:border-[#334155]"}`}>
            <div className="etiqueta truncate">{s.nombre}</div>
            <div className={`mt-1.5 text-[18px] font-semibold tabular
              ${Number(s.saldo) < 0 ? "text-[#f87171]" : ""}`}>
              {plata(s.saldo, s.moneda)}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        {/* ------------------------------------------------- nuevo movimiento */}
        <Panel className="lg:col-span-2">
          <PanelTitulo titulo="Nuevo movimiento"
            detalle="Si el gasto es de un auto, cargalo desde la ficha de la unidad." />
          <form action={nuevoMovimiento} className="grid sm:grid-cols-4 gap-3 items-end">
            <Campo label="Fecha">
              <input name="fecha" type="date" required className="campo"
                defaultValue={new Date().toISOString().slice(0, 10)} />
            </Campo>
            <Campo label="Tipo">
              <select name="tipo" className="campo">
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
                <option value="transferencia">Transferencia interna</option>
              </select>
            </Campo>
            <Campo label="Cuenta">
              <select name="cuenta" required className="campo">
                {cuentas.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Cuenta destino">
              <select name="destino" className="campo">
                <option value="">— (solo transferencias)</option>
                {cuentas.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Categoría" ancho="sm:col-span-2">
              <select name="categoria" className="campo">
                <option value="">—</option>
                {CATEGORIAS.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
              </select>
            </Campo>
            <Campo label="Descripción" ancho="sm:col-span-2">
              <input name="descripcion" required className="campo" placeholder="Qué se pagó o cobró" />
            </Campo>
            <Campo label="Cliente / Proveedor" ancho="sm:col-span-2">
              <input name="contraparte" className="campo" placeholder="A quién" />
            </Campo>
            <Campo label="Monto">
              <input name="monto" type="number" step="0.01" required className="campo" placeholder="0" />
            </Campo>
            <Campo label="Moneda">
              <select name="moneda" className="campo">
                <option value="ARS">Pesos</option>
                <option value="USD">Dólares</option>
              </select>
            </Campo>
            <Campo label="Cotización (si es USD)">
              <input name="cotizacion" type="number" step="0.01" className="campo" placeholder="1" defaultValue={1} />
            </Campo>
            <Campo label="Forma de pago">
              <input name="forma_pago" className="campo" placeholder="Efectivo, transferencia…" />
            </Campo>
            <div className="sm:col-span-4"><Boton tipo="submit"><Plus size={15} /> Registrar</Boton></div>
          </form>
        </Panel>

        {/* --------------------------------------------------- por categoría */}
        <Panel>
          <PanelTitulo titulo="Gastos del mes" detalle="Por categoría" />
          {porCategoria.length === 0 ? (
            <p className="text-[13px] text-[#64748b] py-6 text-center">Sin gastos en el período.</p>
          ) : (
            <div className="space-y-2.5">
              {porCategoria.map((c: any) => (
                <div key={c.categoria} className="flex items-baseline justify-between gap-3">
                  <span className="text-[12.5px] text-[#cbd5e1] truncate">{etiquetaCat(c.categoria)}</span>
                  <span className="text-[12.5px] tabular text-[#9aa7b8] shrink-0">{plata(c.total)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 pt-3 border-t border-[#1f2937] text-[11.5px] text-[#64748b] leading-relaxed">
            La compra y la preparación de unidades no cuentan como gasto del mes:
            son costo de la unidad y pegan en el resultado cuando se vende.
          </p>
        </Panel>
      </div>

      {/* ----------------------------------------------------- movimientos */}
      <div className="flex items-center justify-between mt-6 mb-3">
        <h2 className="text-[15px] font-semibold">Movimientos</h2>
        {cuentaF && <Link href="/caja" className="text-[12.5px] text-[#2f6bff] hover:underline">Ver todas las cuentas</Link>}
      </div>

      <Tabla>
        <thead>
          <tr>
            <TH>Fecha</TH><TH>Tipo</TH><TH>Cuenta</TH><TH>Categoría</TH>
            <TH>Descripción</TH><TH>Unidad</TH><TH alinear="right">Monto</TH>
          </tr>
        </thead>
        <tbody>
          {movimientos.length === 0 && <FilaVacia cols={7} mensaje="No hay movimientos cargados." />}
          {movimientos.map((mv: any) => (
            <tr key={mv.id} className="hover:bg-[#151d29]">
              <TD className="text-[#9aa7b8]">{fecha(mv.fecha)}</TD>
              <TD>
                <Chip tono={mv.tipo === "ingreso" ? "verde" : mv.tipo === "egreso" ? "rojo" : "gris"}>
                  {mv.tipo === "transferencia" ? "Transferencia" : mv.tipo === "ingreso" ? "Ingreso" : "Egreso"}
                </Chip>
              </TD>
              <TD className="text-[#9aa7b8]">
                {mv.cuenta}{mv.destino && <span className="text-[#64748b]"> → {mv.destino}</span>}
              </TD>
              <TD className="text-[#9aa7b8] text-[12.5px]">{etiquetaCat(mv.categoria)}</TD>
              <TD>
                {mv.descripcion}
                {mv.contraparte && <div className="text-[11.5px] text-[#64748b]">{mv.contraparte}</div>}
              </TD>
              <TD>
                {mv.dominio ? (
                  <Link href={`/vehiculos/${mv.vehiculo_id}`} className="text-[12px] text-[#60a5fa] hover:underline">
                    {mv.dominio}
                  </Link>
                ) : <span className="text-[#64748b]">—</span>}
              </TD>
              <TD alinear="right">
                <Monto valor={mv.tipo === "egreso" ? -Number(mv.equivalente_ars) : Number(mv.equivalente_ars)}
                       signo={mv.tipo !== "transferencia"} />
                {mv.moneda === "USD" && (
                  <div className="text-[11px] text-[#64748b]">{plata(mv.monto, "USD")} @ {mv.cotizacion}</div>
                )}
              </TD>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
