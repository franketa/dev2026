import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { requiereSesion, hash, ROLES } from "@/lib/auth";
import { Encabezado, Panel, PanelTitulo, Boton, Campo, Dato, Chip } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Cuenta({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requiereSesion();
  const p = await searchParams;

  const [yo] = await sql`SELECT nombre, email, telefono, rol, creado_en FROM usuarios WHERE id = ${u.id}`;
  const rol = ROLES.find((r) => r.valor === u.rol);

  async function cambiarClave(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    const actual = String(fd.get("actual") || "");
    const nueva = String(fd.get("nueva") || "");
    const repetir = String(fd.get("repetir") || "");

    if (nueva.length < 8) redirect("/cuenta?e=corta");
    if (nueva !== repetir) redirect("/cuenta?e=distintas");

    // Se pide la clave actual aunque haya sesión: si alguien deja la pantalla
    // abierta, que no le puedan cambiar la clave y dejarlo afuera.
    const [row] = await sql`SELECT password_hash FROM usuarios WHERE id = ${usr.id}`;
    if (!row || !(await bcrypt.compare(actual, row.password_hash))) redirect("/cuenta?e=actual");

    await sql`UPDATE usuarios SET password_hash = ${await hash(nueva)} WHERE id = ${usr.id}`;
    // Las demás sesiones se caen: cambiar la clave tiene que echar al que la sepa.
    await sql`DELETE FROM sesiones WHERE usuario_id = ${usr.id}`;
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'usuario', ${usr.id}, 'clave_cambiada', 'propia')`;
    redirect("/login?m=clave");
  }

  async function guardarDatos(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    const nombre = String(fd.get("nombre") || "").trim();
    if (!nombre) return;
    await sql`UPDATE usuarios SET nombre = ${nombre},
                telefono = ${String(fd.get("telefono") || "") || null}
              WHERE id = ${usr.id}`;
    revalidatePath("/cuenta");
  }

  const ERRORES: Record<string, string> = {
    corta: "La clave nueva tiene que tener al menos 8 caracteres.",
    distintas: "Las dos claves nuevas no coinciden.",
    actual: "La clave actual no es correcta.",
  };

  return (
    <>
      <Encabezado titulo="Mi cuenta" detalle="Tus datos y tu contraseña." />

      <div className="grid lg:grid-cols-2 gap-4 max-w-4xl">
        <Panel>
          <PanelTitulo titulo="Tus datos" />
          <form action={guardarDatos} className="space-y-4">
            <Campo label="Nombre">
              <input name="nombre" defaultValue={yo?.nombre ?? ""} required className="campo" />
            </Campo>
            <Campo label="Teléfono">
              <input name="telefono" defaultValue={yo?.telefono ?? ""} className="campo" />
            </Campo>
            <Boton tipo="submit">Guardar</Boton>
          </form>

          <div className="mt-5 pt-4 border-t border-[#1f2937]">
            <Dato label="Email">{yo?.email}</Dato>
            <Dato label="Rol"><Chip tono="violeta">{rol?.label || u.rol}</Chip></Dato>
          </div>
          {rol && (
            <p className="mt-3 text-[11.5px] text-[#64748b] leading-relaxed">{rol.detalle}.
              {" "}El email y el rol los cambia el dueño desde Usuarios.</p>
          )}
        </Panel>

        <Panel>
          <PanelTitulo titulo="Cambiar contraseña"
            detalle="Al cambiarla se cierran todas tus sesiones y tenés que volver a entrar." />

          {p.e && ERRORES[p.e] && (
            <p className="mb-4 rounded-lg border border-[#991b1b] bg-[#2e0a0a] px-3.5 py-2.5
              text-[12.5px] text-[#f87171]">{ERRORES[p.e]}</p>
          )}

          <form action={cambiarClave} className="space-y-4">
            <Campo label="Contraseña actual">
              <input name="actual" type="password" required autoComplete="current-password" className="campo" />
            </Campo>
            <Campo label="Contraseña nueva">
              <input name="nueva" type="password" required minLength={8}
                autoComplete="new-password" className="campo" />
            </Campo>
            <Campo label="Repetir la nueva">
              <input name="repetir" type="password" required minLength={8}
                autoComplete="new-password" className="campo" />
            </Campo>
            <Boton tipo="submit">Cambiar contraseña</Boton>
          </form>

          <p className="mt-4 pt-3 border-t border-[#1f2937] text-[11.5px] text-[#64748b] leading-relaxed">
            Mínimo 8 caracteres. Evitá la fecha de nacimiento o la patente de un auto: son lo
            primero que prueba cualquiera que conozca el negocio.
          </p>
        </Panel>
      </div>
    </>
  );
}
