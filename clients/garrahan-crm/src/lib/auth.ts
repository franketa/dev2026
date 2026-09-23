import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sql } from "./db";

export type Rol = "dueno" | "gerente" | "vendedor" | "administrativo" | "taller";

export type Usuario = {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  sucursal_id: number | null;
};

const COOKIE = "garrahan_sesion";
const DIAS = 30;

/* ------------------------------------------------------------------ permisos
   El vendedor trabaja con stock, clientes y leads sin ver costos ni margenes.
   Es el pedido textual que hace AutoGestion y tiene sentido: el que negocia
   no deberia ver cuanto se ganó, solo el precio y el minimo autorizado.        */
const PERMISOS: Record<Rol, string[]> = {
  dueno: ["*"],
  gerente: ["*"],
  vendedor: [
    "dashboard", "vehiculos", "vehiculos.ver", "leads", "leads.editar",
    "clientes", "clientes.editar", "ventas", "ventas.crear", "taller",
  ],
  administrativo: [
    "dashboard", "vehiculos", "vehiculos.ver", "vehiculos.costos", "clientes",
    "ventas", "caja", "caja.editar", "cobranzas", "deudas", "proveedores", "reportes",
  ],
  taller: ["dashboard", "vehiculos", "vehiculos.ver", "taller", "taller.editar", "proveedores"],
};

/** Lista plana de permisos, para pasarle al menú (que es client component). */
export function permisosDe(rol: Rol): string[] {
  return PERMISOS[rol] || [];
}

export function puede(u: Usuario | null, permiso: string): boolean {
  if (!u) return false;
  const p = PERMISOS[u.rol] || [];
  if (p.includes("*")) return true;
  if (p.includes(permiso)) return true;
  // "vehiculos" habilita "vehiculos.ver" pero no "vehiculos.costos"
  return p.includes(permiso.split(".")[0]) && !permiso.includes(".");
}

/** Los montos sensibles se ocultan a quien no los tiene que ver. */
export function veCostos(u: Usuario | null): boolean {
  return !!u && ["dueno", "gerente", "administrativo"].includes(u.rol);
}

/* -------------------------------------------------------------------- sesion */
export async function login(email: string, password: string) {
  const [u] = await sql`
    SELECT id, nombre, email, rol, sucursal_id, password_hash, activo
    FROM usuarios WHERE lower(email) = lower(${email}) LIMIT 1`;
  if (!u || !u.activo) return null;
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return null;

  const token = crypto.randomBytes(32).toString("hex");
  const expira = new Date(Date.now() + DIAS * 864e5);
  await sql`INSERT INTO sesiones (token, usuario_id, expira_en) VALUES (${token}, ${u.id}, ${expira})`;
  const ck = await cookies();
  ck.set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: true, path: "/", expires: expira,
  });
  return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, sucursal_id: u.sucursal_id };
}

export async function logout() {
  const ck = await cookies();
  const t = ck.get(COOKIE)?.value;
  if (t) await sql`DELETE FROM sesiones WHERE token = ${t}`;
  ck.delete(COOKIE);
}

export async function usuarioActual(): Promise<Usuario | null> {
  const ck = await cookies();
  const t = ck.get(COOKIE)?.value;
  if (!t) return null;
  const [r] = await sql`
    SELECT u.id, u.nombre, u.email, u.rol, u.sucursal_id
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token = ${t} AND s.expira_en > now() AND u.activo LIMIT 1`;
  return (r as Usuario) ?? null;
}

/** Para usar arriba de cada página protegida. */
export async function requiereSesion(): Promise<Usuario> {
  const u = await usuarioActual();
  if (!u) redirect("/login");
  return u;
}

export const hash = (p: string) => bcrypt.hash(p, 10);

export const ROLES: { valor: Rol; label: string; detalle: string }[] = [
  { valor: "dueno", label: "Dueño", detalle: "Acceso total, incluidos costos y márgenes" },
  { valor: "gerente", label: "Gerente", detalle: "Acceso total a la operación" },
  { valor: "vendedor", label: "Vendedor", detalle: "Stock, leads y ventas. No ve costos ni márgenes" },
  { valor: "administrativo", label: "Administrativo", detalle: "Caja, cobranzas y deudas" },
  { valor: "taller", label: "Taller", detalle: "Solo preparación de unidades" },
];
