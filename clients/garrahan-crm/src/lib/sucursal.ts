"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const COOKIE = "garrahan_sucursal";

/**
 * Sucursal activa, como en AutoGestión: se elige una vez arriba del menú y
 * todos los listados quedan filtrados por ella. Devuelve null cuando está
 * puesto "Todas las sucursales".
 *
 * Va en cookie y no en la URL para que la elección sobreviva al navegar entre
 * pantallas: si viajara por querystring, cada link tendría que acordarse de
 * arrastrarla y alcanzaría con un link olvidado para perderla.
 */
export async function sucursalActiva(): Promise<number | null> {
  const ck = await cookies();
  const v = ck.get(COOKIE)?.value;
  if (!v || v === "todas") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function elegirSucursal(fd: FormData) {
  const valor = String(fd.get("sucursal") || "todas");
  const ck = await cookies();
  ck.set(COOKIE, valor, {
    httpOnly: false, sameSite: "lax", secure: true, path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  // Cambia el alcance de todo lo que se está viendo, así que se revalida entero.
  revalidatePath("/", "layout");
}
