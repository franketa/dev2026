import { NextResponse } from "next/server";
import { logout } from "@/lib/auth";

/**
 * Cerrar sesión es POST y no GET a propósito.
 *
 * Con GET esto era un bug feo: el link de salir vive en el menú, o sea en
 * todas las pantallas, y Next.js precarga los links que entran en viewport.
 * Cada cambio de pantalla disparaba un GET a /salir y borraba la sesión del
 * usuario sin que nadie hiciera clic. Un GET tiene que poder repetirse sin
 * consecuencias: lo dispara el navegador, el prefetch, un antivirus o un bot.
 */
export async function POST(req: Request) {
  await logout();
  // 303 y no 307: con 307 el navegador repetiría el POST contra /login.
  return NextResponse.redirect(new URL("/login", req.url), 303);
}

/** Si alguien llega por GET (un link viejo, un favorito), no se cierra nada. */
export async function GET(req: Request) {
  return NextResponse.redirect(new URL("/", req.url), 303);
}
