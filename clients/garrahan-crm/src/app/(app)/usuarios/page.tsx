import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requiereSesion, hash, ROLES, type Rol } from "@/lib/auth";

import {
  Encabezado, Chip, Tabla, TH, TD, Panel, PanelTitulo, Boton, Campo,
} from "@/components/ui";
import SelectEstado from "@/components/select-estado";

export const dynamic = "force-dynamic";

/** Solo el dueño y el gerente administran usuarios. */
const ADMINISTRA: Rol[] = ["dueno", "gerente"];

export default async function Usuarios({ searchParams }: { searchParams: Promise<any> }) {
  const u = await requiereSesion();
  const p = await searchParams;
  const administra = ADMINISTRA.includes(u.rol);

  const [filas, sucursales] = await Promise.all([
    sql`SELECT us.*, s.nombre AS sucursal,
          (SELECT count(*) FROM ventas v WHERE v.vendedor_id = us.id AND v.estado='completada')::int AS ventas
        FROM usuarios us LEFT JOIN sucursales s ON s.id = us.sucursal_id
        ORDER BY us.activo DESC, us.nombre`,
    sql`SELECT id, nombre FROM sucursales WHERE activa ORDER BY nombre`,
  ]);

  /* ------------------------------------------------------------ acciones */
  async function crear(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    if (!ADMINISTRA.includes(usr.rol)) return;

    const nombre = String(fd.get("nombre") || "").trim();
    const email = String(fd.get("email") || "").trim().toLowerCase();
    const clave = String(fd.get("clave") || "");
    if (!nombre || !email) return;
    if (clave.length < 8) redirect("/usuarios?e=corta");

    const [existe] = await sql`SELECT id FROM usuarios WHERE lower(email) = ${email}`;
    if (existe) redirect("/usuarios?e=repetido");

    const [nuevo] = await sql`
      INSERT INTO usuarios (nombre, email, password_hash, rol, sucursal_id, telefono,
                            meta_unidades, comision_pct)
      VALUES (${nombre}, ${email}, ${await hash(clave)},
              ${String(fd.get("rol") || "vendedor")},
              ${fd.get("sucursal_id") ? Number(fd.get("sucursal_id")) : null},
              ${String(fd.get("telefono") || "") || null},
              ${Number(fd.get("meta_unidades") || 0)},
              ${Number(fd.get("comision_pct") || 0)})
      RETURNING id`;

    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'usuario', ${nuevo.id}, 'alta', ${nombre + " · " + email})`;
    revalidatePath("/usuarios");
    redirect("/usuarios?ok=alta");
  }

  async function resetearClave(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    if (!ADMINISTRA.includes(usr.rol)) return;

    const id = Number(fd.get("id") || 0);
    const clave = String(fd.get("clave") || "");
    if (!id) return;
    if (clave.length < 8) redirect("/usuarios?e=corta");

    await sql`UPDATE usuarios SET password_hash = ${await hash(clave)} WHERE id = ${id}`;
    // Se cortan las sesiones abiertas de esa persona: si le resetean la clave,
    // no puede quedar nadie adentro con la anterior.
    await sql`DELETE FROM sesiones WHERE usuario_id = ${id}`;
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'usuario', ${id}, 'clave_reseteada', 'por administrador')`;
    revalidatePath("/usuarios");
    redirect("/usuarios?ok=reset");
  }

  async function cambiarRol(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    if (!ADMINISTRA.includes(usr.rol)) return;
    const id = Number(fd.get("id") || 0);
    const rol = String(fd.get("estado") || "");
    if (!id || !ROLES.some((r) => r.valor === rol)) return;

    // Nadie se saca a sí mismo el acceso: quedaría el sistema sin dueño.
    if (id === usr.id) return;

    await sql`UPDATE usuarios SET rol = ${rol} WHERE id = ${id}`;
    await sql`DELETE FROM sesiones WHERE usuario_id = ${id}`;
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'usuario', ${id}, 'rol', ${rol})`;
    revalidatePath("/usuarios");
  }

  async function alternarActivo(fd: FormData) {
    "use server";
    const usr = await requiereSesion();
    if (!ADMINISTRA.includes(usr.rol)) return;
    const id = Number(fd.get("id") || 0);
    if (!id || id === usr.id) return;

    const [row] = await sql`SELECT activo, nombre FROM usuarios WHERE id = ${id}`;
    if (!row) return;
    const nuevo = !row.activo;

    // Si se desactiva al último dueño activo, el sistema queda sin quien administre.
    if (!nuevo) {
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM usuarios
                                WHERE activo AND rol IN ('dueno','gerente') AND id <> ${id}`;
      if (n === 0) redirect("/usuarios?e=ultimo");
    }

    await sql`UPDATE usuarios SET activo = ${nuevo} WHERE id = ${id}`;
    if (!nuevo) await sql`DELETE FROM sesiones WHERE usuario_id = ${id}`;
    await sql`INSERT INTO auditoria (usuario_id, entidad, entidad_id, accion, detalle)
              VALUES (${usr.id}, 'usuario', ${id}, ${nuevo ? "reactivado" : "desactivado"}, ${row.nombre})`;
    revalidatePath("/usuarios");
  }

  const MENSAJES: Record<string, { texto: string; mal?: boolean }> = {
    corta: { texto: "La contraseña tiene que tener al menos 8 caracteres.", mal: true },
    repetido: { texto: "Ya existe un usuario con ese email.", mal: true },
    ultimo: { texto: "No se puede desactivar al último dueño o gerente activo.", mal: true },
    alta: { texto: "Usuario creado. Pasale la contraseña y que la cambie desde Mi cuenta." },
    reset: { texto: "Contraseña cambiada. Se cerraron las sesiones de esa persona." },
  };
  const aviso = MENSAJES[p.e] || MENSAJES[p.ok];

  return (
    <>
      <Encabezado titulo="Usuarios" detalle="Quién entra al sistema y qué puede ver." />

      {aviso && (
        <p className={`mb-4 rounded-lg px-3.5 py-2.5 text-[12.5px] border
          ${aviso.mal
            ? "border-[#991b1b] bg-[#2e0a0a] text-[#f87171]"
            : "border-[#14532d] bg-[#052e1a] text-[#4ade80]"}`}>
          {aviso.texto}
        </p>
      )}

      <Panel className="mb-4">
        <PanelTitulo titulo="Los roles" detalle="El rol define qué ve cada uno, no es solo una etiqueta." />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ROLES.map((r) => (
            <div key={r.valor} className="rounded-lg border border-[#1f2937] bg-[#0f1520] px-3.5 py-3">
              <div className="text-[13px] font-semibold">{r.label}</div>
              <div className="text-[11.5px] text-[#64748b] mt-1 leading-relaxed">{r.detalle}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Tabla className="mb-4">
        <thead><tr>
          <TH>Nombre</TH><TH>Email</TH><TH>Rol</TH><TH>Sucursal</TH>
          <TH alinear="right">Ventas</TH><TH alinear="right">Meta</TH><TH>Estado</TH>
          {administra && <TH></TH>}
        </tr></thead>
        <tbody>
          {filas.map((x: any) => (
            <tr key={x.id} className="hover:bg-[#151d29] align-top">
              <TD className="font-medium">
                {x.nombre}
                {x.id === u.id && <span className="ml-2 text-[11px] text-[#64748b]">(vos)</span>}
              </TD>
              <TD className="text-[#9aa7b8]">{x.email}</TD>
              <TD>
                {administra && x.id !== u.id ? (
                  <SelectEstado id={x.id} valor={x.rol} accion={cambiarRol}
                    opciones={ROLES.map((r) => ({ valor: r.valor, label: r.label }))} />
                ) : (
                  <Chip tono={x.rol === "dueno" ? "violeta" : x.rol === "vendedor" ? "azul" : "gris"}>
                    {ROLES.find((r) => r.valor === x.rol)?.label || x.rol}
                  </Chip>
                )}
              </TD>
              <TD className="text-[#9aa7b8]">{x.sucursal || "—"}</TD>
              <TD alinear="right">{x.ventas || "—"}</TD>
              <TD alinear="right" className="text-[#9aa7b8]">{x.meta_unidades || "—"}</TD>
              <TD><Chip tono={x.activo ? "verde" : "gris"}>{x.activo ? "Activo" : "Inactivo"}</Chip></TD>

              {administra && (
                <TD>
                  <div className="flex items-start gap-3">
                    <details>
                      <summary className="cursor-pointer list-none text-[12.5px] text-[#60a5fa] hover:underline">
                        Cambiar clave
                      </summary>
                      <form action={resetearClave} className="mt-3 w-[250px] space-y-2.5 p-3
                        bg-[#0d131c] border border-[#1f2937] rounded-lg">
                        <input type="hidden" name="id" value={x.id} />
                        <Campo label="Contraseña nueva">
                          <input name="clave" type="password" required minLength={8}
                            autoComplete="new-password" className="campo" />
                        </Campo>
                        <Boton tipo="submit" className="w-full">Cambiar</Boton>
                        <p className="text-[11px] text-[#64748b] leading-relaxed">
                          Se le cierran las sesiones abiertas.
                        </p>
                      </form>
                    </details>

                    {x.id !== u.id && (
                      <form action={alternarActivo}>
                        <input type="hidden" name="id" value={x.id} />
                        <button type="submit"
                          className={`text-[12.5px] hover:underline whitespace-nowrap
                            ${x.activo ? "text-[#f87171]" : "text-[#4ade80]"}`}>
                          {x.activo ? "Desactivar" : "Reactivar"}
                        </button>
                      </form>
                    )}
                  </div>
                </TD>
              )}
            </tr>
          ))}
        </tbody>
      </Tabla>

      {administra ? (
        <Panel>
          <PanelTitulo titulo="Nuevo usuario"
            detalle="Creás la cuenta con una contraseña provisoria y esa persona la cambia desde Mi cuenta." />
          <form action={crear} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Campo label="Nombre *">
              <input name="nombre" required className="campo" />
            </Campo>
            <Campo label="Email *">
              <input name="email" type="email" required className="campo" />
            </Campo>
            <Campo label="Contraseña provisoria *">
              <input name="clave" type="password" required minLength={8}
                autoComplete="new-password" className="campo" />
            </Campo>
            <Campo label="Rol">
              <select name="rol" className="campo" defaultValue="vendedor">
                {ROLES.map((r) => <option key={r.valor} value={r.valor}>{r.label}</option>)}
              </select>
            </Campo>
            <Campo label="Sucursal">
              <select name="sucursal_id" className="campo" defaultValue="">
                <option value="">—</option>
                {sucursales.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Teléfono">
              <input name="telefono" className="campo" />
            </Campo>
            <Campo label="Meta de unidades">
              <input name="meta_unidades" type="number" min="0" className="campo" defaultValue={0} />
            </Campo>
            <Campo label="Comisión %">
              <input name="comision_pct" type="number" step="0.01" min="0" className="campo" defaultValue={0} />
            </Campo>
            <div className="sm:col-span-2 lg:col-span-4">
              <Boton tipo="submit">Crear usuario</Boton>
            </div>
          </form>
        </Panel>
      ) : (
        <Panel>
          <p className="text-[13px] text-[#9aa7b8]">
            Para dar de alta o modificar usuarios hace falta perfil de dueño o gerente.
            Tu contraseña la cambiás desde <b>Mi cuenta</b>.
          </p>
        </Panel>
      )}
    </>
  );
}
