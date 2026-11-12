import { revalidatePath } from "next/cache";
import { avisoOk, avisoError } from "@/lib/aviso";
import { sql } from "@/lib/db";
import { requierePermiso } from "@/lib/auth";
import { plata, numero } from "@/lib/format";
import {
  Encabezado, KPI, GrillaKPI, Tabla, TH, TD, FilaVacia, Panel, PanelTitulo, Boton, Campo,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const RUBROS = ["Chapa y pintura", "Mecánica", "Gomería", "Detailing / lavado", "Tapicería", "Electricidad",
  "Repuestos", "Gestoría", "Grúa / traslado", "Vidrios", "Otro"];

const datos = (fd: FormData) => {
  const t = (k: string) => String(fd.get(k) || "").trim() || null;
  return { nombre: t("nombre"), rubro: t("rubro"), cuit: t("cuit"), telefono: t("telefono"), email: t("email") };
};

async function crear(fd: FormData) {
  "use server";
  const usr = await requierePermiso("proveedores");
  const d = datos(fd);
  if (!d.nombre) return avisoError("Falta el nombre del proveedor.");
  const [igual] = await sql`SELECT id, activo FROM proveedores WHERE lower(nombre) = lower(${d.nombre})`;
  if (igual?.activo) return avisoError(`${d.nombre} ya está cargado.`);
  const [p] = igual
    ? await sql`UPDATE proveedores SET activo = true, rubro = COALESCE(${d.rubro}, rubro), cuit = COALESCE(${d.cuit}, cuit),
                  telefono = COALESCE(${d.telefono}, telefono), email = COALESCE(${d.email}, email)
                WHERE id = ${igual.id} RETURNING id`
    : await sql`INSERT INTO proveedores (nombre, rubro, cuit, telefono, email)
                VALUES (${d.nombre}, ${d.rubro}, ${d.cuit}, ${d.telefono}, ${d.email}) RETURNING id`;
  await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
            VALUES (${usr.id}, 'proveedor', ${p.id}, 'alta', ${d.nombre})`;
  revalidatePath("/proveedores");
  await avisoOk(`${d.nombre} cargado. Ya aparece al cargar costos y órdenes de taller.`);
}

async function editar(fd: FormData) {
  "use server";
  const usr = await requierePermiso("proveedores");
  const id = Number(fd.get("id") || 0);
  const d = datos(fd);
  if (!d.nombre) return avisoError("El proveedor tiene que tener nombre.");
  await sql`UPDATE proveedores SET nombre = ${d.nombre}, rubro = ${d.rubro}, cuit = ${d.cuit},
              telefono = ${d.telefono}, email = ${d.email}
            WHERE id = ${id}`;
  await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
            VALUES (${usr.id}, 'proveedor', ${id}, 'editado', ${d.nombre})`;
  revalidatePath("/proveedores");
  await avisoOk("Proveedor guardado");
}

/** No se borra: sus trabajos y costos lo siguen nombrando. Deja de aparecer en las listas. */
async function darDeBaja(fd: FormData) {
  "use server";
  const usr = await requierePermiso("proveedores");
  const id = Number(fd.get("id") || 0);
  const [p] = await sql`UPDATE proveedores SET activo = false WHERE id = ${id} RETURNING nombre`;
  if (!p) return;
  await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
            VALUES (${usr.id}, 'proveedor', ${id}, 'baja', ${p.nombre})`;
  revalidatePath("/proveedores");
  await avisoOk(`${p.nombre} dado de baja`);
}

export default async function Proveedores() {
  await requierePermiso("proveedores");
  const filas = await sql`
    SELECT p.*,
      (SELECT COALESCE(SUM(monto),0) FROM vehiculo_costos c WHERE c.proveedor_id = p.id) AS facturado,
      (SELECT count(*) FROM vehiculo_costos c WHERE c.proveedor_id = p.id)::int AS trabajos
    FROM proveedores p WHERE p.activo ORDER BY p.nombre`;
  const total = filas.reduce((a: number, p: any) => a + Number(p.facturado), 0);

  return (
    <>
      <Encabezado titulo="Proveedores" detalle="Chapistas, gomerías, gestoría y todo lo que le factura a la agencia." />
      <GrillaKPI cols={2}>
        <KPI label="Proveedores activos" valor={numero(filas.length)} />
        <KPI label="Facturado histórico" valor={plata(total)} />
      </GrillaKPI>

      <Panel className="mt-6">
        <PanelTitulo titulo="Nuevo proveedor"
          detalle="Después se elige al cargar un costo de un auto o una orden de taller." />
        <form action={crear} className="grid sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <Campo label="Nombre *" ancho="lg:col-span-2">
            <input name="nombre" required className="campo" placeholder="Taller Gómez" />
          </Campo>
          <Campo label="Rubro">
            <input name="rubro" className="campo" list="rubros-proveedor" />
            <datalist id="rubros-proveedor">{RUBROS.map((r) => <option key={r} value={r} />)}</datalist>
          </Campo>
          <Campo label="Teléfono"><input name="telefono" className="campo" inputMode="tel" /></Campo>
          <Campo label="CUIT"><input name="cuit" className="campo" /></Campo>
          <Campo label="Email"><input name="email" type="email" className="campo" /></Campo>
          <div><Boton tipo="submit">Cargar proveedor</Boton></div>
        </form>
      </Panel>

      <div className="mt-6" />
      <Tabla>
        <thead><tr>
          <TH>Proveedor</TH><TH>Rubro</TH><TH>CUIT</TH><TH>Teléfono</TH>
          <TH alinear="right">Trabajos</TH><TH alinear="right">Facturado</TH><TH></TH>
        </tr></thead>
        <tbody>
          {filas.length === 0 && <FilaVacia cols={7} mensaje="No hay proveedores cargados." />}
          {filas.map((p: any) => (
            <tr key={p.id} className="hover:bg-[var(--c-hover)] align-top">
              <TD className="font-medium">
                {p.nombre}
                {p.email && <div className="text-[11.5px] font-normal text-[var(--c-tinta-tenue)]">{p.email}</div>}
              </TD>
              <TD className="text-[var(--c-tinta-media)]">{p.rubro || "—"}</TD>
              <TD className="text-[var(--c-tinta-media)]">{p.cuit || "—"}</TD>
              <TD className="text-[var(--c-tinta-media)]">{p.telefono || "—"}</TD>
              <TD alinear="right">{p.trabajos || "—"}</TD>
              <TD alinear="right">{Number(p.facturado) > 0 ? plata(p.facturado) : "—"}</TD>
              <TD alinear="right">
                <details className="text-left">
                  <summary className="cursor-pointer list-none text-[12.5px] text-[var(--c-enlace)] hover:underline whitespace-nowrap">
                    Editar
                  </summary>
                  <div className="mt-2 w-[260px] p-3 bg-[var(--c-superficie)] border border-[var(--c-borde)] rounded-lg">
                    <form action={editar} className="space-y-2.5">
                      <input type="hidden" name="id" value={p.id} />
                      <Campo label="Nombre"><input name="nombre" required className="campo" defaultValue={p.nombre} /></Campo>
                      <Campo label="Rubro">
                        <input name="rubro" className="campo" list="rubros-proveedor" defaultValue={p.rubro ?? ""} />
                      </Campo>
                      <Campo label="Teléfono"><input name="telefono" className="campo" defaultValue={p.telefono ?? ""} /></Campo>
                      <Campo label="CUIT"><input name="cuit" className="campo" defaultValue={p.cuit ?? ""} /></Campo>
                      <Campo label="Email"><input name="email" type="email" className="campo" defaultValue={p.email ?? ""} /></Campo>
                      <Boton tipo="submit" className="w-full">Guardar</Boton>
                    </form>
                    <form action={darDeBaja} className="mt-3 pt-3 border-t border-[var(--c-borde)]">
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="text-[12px] text-[var(--c-rojo-alto)] hover:underline">
                        Dar de baja (deja de aparecer en las listas)
                      </button>
                    </form>
                  </div>
                </details>
              </TD>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
