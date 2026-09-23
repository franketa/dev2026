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

/**
 * El Location va relativo. Detrás de Traefik, `req.url` es la dirección
 * interna del contenedor, así que armar la URL absoluta desde ahí manda al
 * navegador a un host que no existe fuera de la red de Docker.
 */
const irA = (destino: string) =>
  new NextResponse(null, { status: 303, headers: { Location: destino } });

export async function POST() {
  await logout();
  return irA("/login");
}

/** Si alguien llega por GET (un link viejo, un favorito), no se cierra nada. */
export async function GET() {
  return irA("/");
}
