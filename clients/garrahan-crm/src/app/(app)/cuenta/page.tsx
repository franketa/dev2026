import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { avisoOk, avisoError } from "@/lib/aviso";
import { sql } from "@/lib/db";
import crypto from "crypto";
import { requiereSesion, hash, ROLES } from "@/lib/auth";
import { datosDelBot, telegramConfigurado } from "@/lib/telegram";
import { asistenteConfigurado } from "@/lib/bot";
import { Encabezado, Panel, PanelTitulo, Boton, Campo, Dato, Chip } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Sin O/0 ni I/1/L: el código a veces se tipea a mano en el grupo. */
const LETRAS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MINUTOS_CODIGO = 15;

export default async function Cuenta() {
  const u = await requiereSesion();

  const [yo] = await sql`SELECT nombre, email, telefono, rol, creado_en, telegram_id FROM usuarios WHERE id = ${u.id}`;
  const rol = ROLES.find((r) => r.valor === u.rol);

  // El asistente de Telegram: solo se ofrece si el bot existe en el servidor.
  const hayBot = telegramConfigurado();
  const [codigo] = hayBot && !yo?.telegram_id
    ? await sql`SELECT codigo FROM bot_vinculos WHERE usuario_id = ${u.id} AND vence > now() ORDER BY vence DESC LIMIT 1`
    : [];
  const bot = hayBot && codigo ? await datosDelBot() : null;

  async function generarCodigo() {
    "use server";
    const usr = await requiereSesion();
    const nuevo = Array.from({ length: 10 }, () => LETRAS[crypto.randomInt(LETRAS.length)]).join("");
    await sql`DELETE FROM bot_vinculos WHERE usuario_id = ${usr.id}`;
    await sql`INSERT INTO bot_vinculos (codigo, usuario_id, vence)
              VALUES (${nuevo}, ${usr.id}, now() + make_interval(mins => ${MINUTOS_CODIGO}))`;
    revalidatePath("/cuenta");
  }

  async function desvincular() {
    "use server";
    const usr = await requiereSesion();
    await sql`UPDATE usuarios SET telegram_id = NULL WHERE id = ${usr.id}`;
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'usuario', ${usr.id}, 'telegram_desvinculado', 'propia')`;
    revalidatePath("/cuenta");
    await avisoOk("Telegram desvinculado");
  }

  async function cambiarClave(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    const actual = String(fd.get("actual") || "");
    const nueva = String(fd.get("nueva") || "");
    const repetir = String(fd.get("repetir") || "");

    if (nueva.length < 8) return avisoError("La clave nueva tiene que tener al menos 8 caracteres.");
    if (nueva !== repetir) return avisoError("Las dos claves nuevas no coinciden.");

    // Se pide la clave actual aunque haya sesión: si alguien deja la pantalla
    // abierta, que no le puedan cambiar la clave y dejarlo afuera.
    const [row] = await sql`SELECT password_hash FROM usuarios WHERE id = ${usr.id}`;
    if (!row || !(await bcrypt.compare(actual, row.password_hash))) return avisoError("La clave actual no es correcta.");

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
    if (!nombre) return avisoError("El nombre no puede quedar vacío.");
    await sql`UPDATE usuarios SET nombre = ${nombre},
                telefono = ${String(fd.get("telefono") || "") || null}
              WHERE id = ${usr.id}`;
    revalidatePath("/cuenta");
    await avisoOk("Tus datos se guardaron");
  }


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

          <div className="mt-5 pt-4 border-t border-[var(--c-borde)]">
            <Dato label="Email">{yo?.email}</Dato>
            <Dato label="Rol"><Chip tono="violeta">{rol?.label || u.rol}</Chip></Dato>
          </div>
          {rol && (
            <p className="mt-3 text-[11.5px] text-[var(--c-tinta-tenue)] leading-relaxed">{rol.detalle}.
              {" "}El email y el rol los cambia el dueño desde Usuarios.</p>
          )}
        </Panel>

        <Panel>
          <PanelTitulo titulo="Cambiar contraseña"
            detalle="Al cambiarla se cierran todas tus sesiones y tenés que volver a entrar." />

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

          <p className="mt-4 pt-3 border-t border-[var(--c-borde)] text-[11.5px] text-[var(--c-tinta-tenue)] leading-relaxed">
            Mínimo 8 caracteres. Evitá la fecha de nacimiento o la patente de un auto: son lo
            primero que prueba cualquiera que conozca el negocio.
          </p>
        </Panel>

        {hayBot && (
          <Panel className="lg:col-span-2">
            <PanelTitulo titulo="Asistente por Telegram"
              detalle="Mandale un audio al bot y carga o consulta en el sistema por vos, con tu usuario y tus permisos. Antes de guardar un cambio te lo muestra y lo confirmás con un botón." />
            {yo?.telegram_id ? (
              <div className="flex flex-wrap items-center gap-3">
                <Chip tono="verde">Tu Telegram está vinculado</Chip>
                <form action={desvincular}><Boton tipo="submit" variante="suave">Desvincular</Boton></form>
              </div>
            ) : codigo ? (
              <div className="space-y-3 text-[13px] text-[var(--c-tinta-clara)]">
                {bot?.username && (
                  <p>
                    Desde el teléfono, abrí este link y tocá <b>Iniciar</b>:{" "}
                    <a href={`https://t.me/${bot.username}?start=${codigo.codigo}`} target="_blank" rel="noopener noreferrer"
                      className="text-[var(--c-enlace)] hover:underline break-all">
                      t.me/{bot.username}?start={codigo.codigo}
                    </a>
                  </p>
                )}
                <p>
                  {bot?.username ? "O mandale" : "Mandale"} al bot este mensaje:{" "}
                  <code className="px-1.5 py-0.5 rounded bg-[var(--c-hover)] text-[var(--c-tinta)] tabular">/vincular {codigo.codigo}</code>
                </p>
                <p className="text-[11.5px] text-[var(--c-tinta-tenue)]">
                  El código vale {MINUTOS_CODIGO} minutos y sirve una sola vez. No lo compartas: quien lo use queda como vos.
                </p>
                <form action={generarCodigo}><Boton tipo="submit" variante="suave">Generar otro código</Boton></form>
              </div>
            ) : (
              <div className="space-y-3">
                {!asistenteConfigurado() && (
                  <p className="text-[12.5px] text-[var(--c-tinta-media)]">
                    El asistente todavía no está activado en el servidor. Podés dejar tu Telegram vinculado igual.
                  </p>
                )}
                <form action={generarCodigo}><Boton tipo="submit">Vincular Telegram</Boton></form>
              </div>
            )}
          </Panel>
        )}
      </div>
    </>
  );
}
