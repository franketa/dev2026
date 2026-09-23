import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Plus, ArrowRight } from "lucide-react";
import { sql } from "@/lib/db";
import { requiereSesion, veCostos } from "@/lib/auth";
import { plata, plataCorta, fecha, numero } from "@/lib/format";
import {
  Encabezado, KPI, GrillaKPI, Panel, PanelTitulo, Chip, Tabla, TH, TD,
  FilaVacia, Boton, Campo,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Inversores() {
  const u = await requiereSesion();
  if (!veCostos(u)) {
    return <Panel><p className="text-[13px] text-[#9aa7b8] py-8 text-center">
      Tu perfil no tiene acceso al panel de inversores.</p></Panel>;
  }

  const [inv, pendientes, ultimos] = await Promise.all([
    sql`SELECT i.id, i.nombre, i.tipo,
          COALESCE(SUM(CASE WHEN m.moneda='ARS' THEN
            CASE WHEN m.tipo IN ('aporte','venta','devolucion') THEN m.monto ELSE -m.monto END
            ELSE 0 END),0) AS saldo_ars,
          COALESCE(SUM(CASE WHEN m.moneda='USD' THEN
            CASE WHEN m.tipo IN ('aporte','venta','devolucion') THEN m.monto ELSE -m.monto END
            ELSE 0 END),0) AS saldo_usd,
          (SELECT count(*) FROM vehiculos v
           WHERE v.inversor_id = i.id AND v.estado NOT IN ('vendido','baja'))::int AS unidades,
          (SELECT COALESCE(SUM(x.costo_total),0) FROM v_vehiculos x
           WHERE x.inversor_id = i.id AND x.estado NOT IN ('vendido','baja')) AS capital
        FROM inversores i
        LEFT JOIN inversor_movimientos m ON m.inversor_id = i.id
        WHERE i.activo
        GROUP BY i.id, i.nombre, i.tipo
        ORDER BY i.tipo DESC, i.nombre`,
    sql`SELECT m.*, i.nombre AS de, c.nombre AS para
        FROM inversor_movimientos m
        JOIN inversores i ON i.id = m.inversor_id
        LEFT JOIN inversores c ON c.id = m.contraparte_id
        WHERE m.tipo = 'prestamo' AND NOT m.devuelto
        ORDER BY m.fecha`,
    sql`SELECT m.*, i.nombre AS inversor, v.dominio
        FROM inversor_movimientos m
        JOIN inversores i ON i.id = m.inversor_id
        LEFT JOIN vehiculos v ON v.id = m.vehiculo_id
        ORDER BY m.fecha DESC, m.id DESC LIMIT 25`,
  ]);

  const totalArs = inv.reduce((a: number, i: any) => a + Number(i.saldo_ars), 0);
  const totalCapital = inv.reduce((a: number, i: any) => a + Number(i.capital), 0);
  const totalUnidades = inv.reduce((a: number, i: any) => a + Number(i.unidades), 0);

  async function nuevoMovimiento(fd: FormData) {
    "use server";
    await requiereSesion();
    const monto = Number(fd.get("monto") || 0);
    if (!monto) return;
    await sql`INSERT INTO inversor_movimientos (inversor_id, tipo, monto, moneda, descripcion, fecha, contraparte_id)
              VALUES (${Number(fd.get("inversor"))}, ${String(fd.get("tipo"))}, ${monto},
                      ${String(fd.get("moneda") || "ARS")}, ${String(fd.get("descripcion") || "")},
                      ${String(fd.get("fecha"))},
                      ${fd.get("contraparte") ? Number(fd.get("contraparte")) : null})`;
    revalidatePath("/inversores");
  }

  async function marcarDevuelta(fd: FormData) {
    "use server";
    await requiereSesion();
    await sql`UPDATE inversor_movimientos SET devuelto = true WHERE id = ${Number(fd.get("id"))}`;
    revalidatePath("/inversores");
  }

  return (
    <>
      <Encabezado titulo="Inversores" detalle="Quién puso la plata de cada unidad y cómo está su cuenta." />

      <GrillaKPI cols={3}>
        <KPI label="Capital en unidades" valor={plataCorta(totalCapital)}
             detalle={`${numero(totalUnidades)} unidades activas`} />
        <KPI label="Saldo consolidado" valor={plataCorta(totalArs)} />
        <KPI label="Préstamos sin devolver" valor={numero(pendientes.length)}
             tono={pendientes.length > 0 ? "amarillo" : "verde"} />
      </GrillaKPI>

      {/* ---------------------------------------------------------- cuentas */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
        {inv.length === 0 && (
          <Panel className="sm:col-span-2 lg:col-span-3">
            <p className="text-[13px] text-[#64748b] py-6 text-center">
              Todavía no hay inversores cargados.
            </p>
          </Panel>
        )}
        {inv.map((i: any) => (
          <Panel key={i.id}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-[14.5px] font-semibold">{i.nombre}</h3>
                <Chip tono={i.tipo === "propio" ? "azul" : "violeta"} className="mt-1.5">
                  {i.tipo === "propio" ? "Capital propio" : "Inversor externo"}
                </Chip>
              </div>
              <Link href={`/vehiculos?inversor=${i.id}`} className="text-[#64748b] hover:text-[#2f6bff]">
                <ArrowRight size={16} />
              </Link>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[13px]">
                <span className="text-[#64748b]">Saldo ARS</span>
                <span className={`tabular ${Number(i.saldo_ars) < 0 ? "text-[#f87171]" : "text-[#22c55e]"}`}>
                  {plata(i.saldo_ars)}
                </span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-[#64748b]">Saldo USD</span>
                <span className={`tabular ${Number(i.saldo_usd) < 0 ? "text-[#f87171]" : "text-[#22c55e]"}`}>
                  {plata(i.saldo_usd, "USD")}
                </span>
              </div>
              <div className="flex justify-between text-[13px] pt-1.5 border-t border-[#1f2937]">
                <span className="text-[#64748b]">Unidades activas</span>
                <span className="tabular">{i.unidades}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-[#64748b]">Capital invertido</span>
                <span className="tabular text-[#9aa7b8]">{plataCorta(i.capital)}</span>
              </div>
            </div>
          </Panel>
        ))}
      </div>

      {/* --------------------------------------------- préstamos pendientes */}
      {pendientes.length > 0 && (
        <div className="mt-6">
          <h2 className="text-[15px] font-semibold mb-3">Préstamos pendientes de devolución</h2>
          <Tabla>
            <thead>
              <tr><TH>De</TH><TH>Para</TH><TH alinear="right">Monto</TH><TH>Descripción</TH><TH>Fecha</TH><TH></TH></tr>
            </thead>
            <tbody>
              {pendientes.map((p: any) => (
                <tr key={p.id} className="hover:bg-[#151d29]">
                  <TD className="font-medium">{p.de}</TD>
                  <TD>{p.para || "—"}</TD>
                  <TD alinear="right">{plata(p.monto, p.moneda)}</TD>
                  <TD className="text-[#9aa7b8]">{p.descripcion || "—"}</TD>
                  <TD className="text-[#9aa7b8]">{fecha(p.fecha)}</TD>
                  <TD alinear="right">
                    <form action={marcarDevuelta}>
                      <input type="hidden" name="id" value={p.id} />
                      <Boton tipo="submit" variante="suave">Marcar devuelta</Boton>
                    </form>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <Panel>
          <PanelTitulo titulo="Registrar movimiento" />
          <form action={nuevoMovimiento} className="space-y-3">
            <Campo label="Inversor">
              <select name="inversor" required className="campo">
                {inv.map((i: any) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Tipo">
              <select name="tipo" className="campo">
                <option value="aporte">Aporte</option>
                <option value="retiro">Retiro</option>
                <option value="prestamo">Préstamo a otro inversor</option>
                <option value="devolucion">Devolución</option>
              </select>
            </Campo>
            <Campo label="Contraparte (si es préstamo)">
              <select name="contraparte" className="campo">
                <option value="">—</option>
                {inv.map((i: any) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
              </select>
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Monto">
                <input name="monto" type="number" step="0.01" required className="campo" />
              </Campo>
              <Campo label="Moneda">
                <select name="moneda" className="campo">
                  <option value="ARS">Pesos</option><option value="USD">Dólares</option>
                </select>
              </Campo>
            </div>
            <Campo label="Descripción">
              <input name="descripcion" className="campo" placeholder="Concepto" />
            </Campo>
            <Campo label="Fecha">
              <input name="fecha" type="date" required className="campo"
                defaultValue={new Date().toISOString().slice(0, 10)} />
            </Campo>
            <Boton tipo="submit"><Plus size={15} /> Registrar</Boton>
          </form>
        </Panel>

        <div className="lg:col-span-2">
          <h2 className="text-[15px] font-semibold mb-3">Últimos movimientos</h2>
          <Tabla>
            <thead>
              <tr><TH>Fecha</TH><TH>Inversor</TH><TH>Tipo</TH><TH>Descripción</TH><TH alinear="right">Monto</TH></tr>
            </thead>
            <tbody>
              {ultimos.length === 0 && <FilaVacia cols={5} mensaje="Sin movimientos registrados." />}
              {ultimos.map((m: any) => (
                <tr key={m.id} className="hover:bg-[#151d29]">
                  <TD className="text-[#9aa7b8]">{fecha(m.fecha)}</TD>
                  <TD className="font-medium">{m.inversor}</TD>
                  <TD><Chip tono={["aporte", "venta", "devolucion"].includes(m.tipo) ? "verde" : "rojo"}>
                    {m.tipo}</Chip></TD>
                  <TD className="text-[#9aa7b8]">
                    {m.descripcion || "—"}
                    {m.dominio && <span className="text-[#64748b]"> · {m.dominio}</span>}
                  </TD>
                  <TD alinear="right">{plata(m.monto, m.moneda)}</TD>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </div>
      </div>
    </>
  );
}
