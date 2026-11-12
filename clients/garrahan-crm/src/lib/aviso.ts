import { cookies } from "next/headers";

/**
 * Avisos de "Guardado" y de error para las acciones del servidor.
 *
 * La acción deja el aviso en una cookie corta y <Avisos /> (en el navegador)
 * la lee apenas vuelve la respuesta, lo muestra y la borra. Funciona igual si
 * la acción termina en redirect, porque la cookie viaja en esa misma respuesta.
 *
 *   await avisoOk("Cobro registrado");
 *   return avisoError("La contraseña tiene que tener al menos 8 caracteres");
 */

export type Aviso = { id: string; tipo: "ok" | "error"; texto: string };

async function poner(tipo: Aviso["tipo"], texto: string) {
  const aviso: Aviso = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), tipo, texto };
  (await cookies()).set("aviso", JSON.stringify(aviso), {
    path: "/", maxAge: 60, sameSite: "lax", httpOnly: false,
  });
}

export const avisoOk = (texto: string) => poner("ok", texto);
export const avisoError = (texto: string) => poner("error", texto);

export const SIN_PERMISO = "No tenés permiso para hacer esto.";
