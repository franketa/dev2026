"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutGrid, Car, Receipt, Users, Flame, Wrench, Truck, Wallet,
  HandCoins, CreditCard, TrendingUp, BarChart3, Building2, UserCog,
  History, BookMarked, Settings, Menu, X, LogOut, HeartHandshake, LifeBuoy, Rocket,
} from "lucide-react";
import { iniciales } from "@/lib/format";
import SelectorSucursal from "./selector-sucursal";

type Item = { href: string; label: string; icono: any; permiso?: string };
type Grupo = { titulo: string; items: Item[] };

const MENU: Grupo[] = [
  {
    titulo: "Operaciones",
    items: [
      { href: "/", label: "Inicio", icono: LayoutGrid },
      { href: "/vehiculos", label: "Vehículos", icono: Car },
      { href: "/ventas", label: "Ventas", icono: Receipt },
      { href: "/clientes", label: "Clientes", icono: Users },
      { href: "/leads", label: "Leads", icono: Flame },
      { href: "/taller", label: "Taller", icono: Wrench },
      { href: "/postventa", label: "Postventa", icono: HeartHandshake, permiso: "ventas" },
      { href: "/proveedores", label: "Proveedores", icono: Truck, permiso: "proveedores" },
    ],
  },
  {
    titulo: "Finanzas",
    items: [
      { href: "/caja", label: "Caja", icono: Wallet, permiso: "caja" },
      { href: "/cobranzas", label: "Cobranzas", icono: HandCoins, permiso: "cobranzas" },
      { href: "/deudas", label: "Deudas a pagar", icono: CreditCard, permiso: "deudas" },
      { href: "/inversores", label: "Inversores", icono: TrendingUp, permiso: "inversores" },
    ],
  },
  {
    titulo: "Reportes",
    items: [{ href: "/reportes", label: "Reportes", icono: BarChart3, permiso: "reportes" }],
  },
  {
    titulo: "Administración",
    items: [
      { href: "/sucursales", label: "Sucursales", icono: Building2, permiso: "sucursales" },
      { href: "/usuarios", label: "Usuarios", icono: UserCog, permiso: "usuarios" },
      { href: "/catalogo", label: "Catálogo", icono: BookMarked, permiso: "catalogo" },
      { href: "/auditoria", label: "Auditoría", icono: History, permiso: "auditoria" },
      { href: "/configuracion", label: "Configuración", icono: Settings, permiso: "configuracion" },
    ],
  },
  {
    titulo: "Ayuda",
    items: [
      { href: "/puesta-en-marcha", label: "Puesta en marcha", icono: Rocket },
      { href: "/guia", label: "Guía del sistema", icono: LifeBuoy },
    ],
  },
];

export default function Sidebar({ usuario, permisos, sucursales, sucursalActual, elegirSucursal }: {
  usuario: { nombre: string; rol: string };
  permisos: string[];
  sucursales: { id: number; nombre: string }[];
  sucursalActual: string;
  elegirSucursal: (fd: FormData) => Promise<void>;
}) {
  const path = usePathname();
  const [abierto, setAbierto] = useState(false);

  const visible = (i: Item) =>
    !i.permiso || permisos.includes("*") || permisos.includes(i.permiso);

  const activo = (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(href + "/");

  const grupos = MENU
    .map((g) => ({ ...g, items: g.items.filter(visible) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      {/* botón móvil */}
      <button onClick={() => setAbierto(true)}
        className="lg:hidden fixed top-3 left-3 z-40 h-9 w-9 grid place-items-center rounded-lg
          bg-[var(--c-panel)] border border-[var(--c-borde)] text-[var(--c-tinta-media)]" aria-label="Abrir menú">
        <Menu size={17} />
      </button>

      {abierto && (
        <div onClick={() => setAbierto(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/60" />
      )}

      <aside className={`fixed lg:sticky top-0 z-50 lg:z-auto h-screen w-[228px] shrink-0
        bg-[var(--c-superficie)] border-r border-[var(--c-borde)] flex flex-col transition-transform
        ${abierto ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>

        {/* marca */}
        <div className="h-[57px] flex items-center gap-2.5 px-4 border-b border-[var(--c-borde)] shrink-0">
          <div className="h-7 w-7 rounded-lg bg-[#e3242b] grid place-items-center text-[13px] font-bold text-white shrink-0">G</div>
          <span className="font-semibold text-[13.5px] truncate">Garrahan</span>
          <button onClick={() => setAbierto(false)}
            className="lg:hidden ml-auto text-[var(--c-tinta-tenue)]" aria-label="Cerrar menú"><X size={17} /></button>
        </div>

        {/* sucursal activa: filtra todos los listados de una sola vez */}
        <div className="px-2.5 pt-3 shrink-0">
          <SelectorSucursal sucursales={sucursales} actual={sucursalActual} accion={elegirSucursal} />
        </div>

        {/* navegación */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5">
          {grupos.map((g) => (
            <div key={g.titulo} className="mb-4">
              <div className="etiqueta px-2.5 mb-1.5">{g.titulo}</div>
              {g.items.map((i) => {
                const Ico = i.icono;
                const on = activo(i.href);
                return (
                  <Link key={i.href} href={i.href} onClick={() => setAbierto(false)}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] mb-0.5 text-[13px] transition-colors
                      ${on ? "bg-[var(--c-activo)] text-[var(--c-tinta)] font-medium" : "text-[var(--c-tinta-media)] hover:bg-[var(--c-hover)] hover:text-[var(--c-tinta-clara)]"}`}>
                    <Ico size={15.5} className={on ? "text-[var(--c-primario)]" : ""} />
                    {i.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* usuario */}
        <div className="border-t border-[var(--c-borde)] p-2.5 shrink-0">
          <div className="flex items-center gap-2.5 px-1.5 py-1.5">
            <div className="h-7 w-7 rounded-full bg-[var(--c-primario)] grid place-items-center text-[11px] font-semibold text-white shrink-0">
              {iniciales(usuario.nombre)}
            </div>
            <Link href="/cuenta" onClick={() => setAbierto(false)}
              className="min-w-0 flex-1 rounded-md hover:bg-[var(--c-hover)] px-1 -mx-1 py-0.5"
              title="Mi cuenta">
              <div className="text-[12.5px] font-medium truncate">{usuario.nombre}</div>
              <div className="text-[11px] text-[var(--c-tinta-tenue)] capitalize">{usuario.rol}</div>
            </Link>
            {/* Form y no Link: /salir es POST porque un link se precarga solo
                y cerraba la sesión sin que nadie hiciera clic. */}
            <form action="/salir" method="post">
              <button type="submit" title="Cerrar sesión" aria-label="Cerrar sesión"
                className="h-7 w-7 grid place-items-center rounded-lg text-[var(--c-tinta-tenue)]
                  hover:bg-[var(--c-activo)] hover:text-[var(--c-rojo-alto)] transition-colors">
                <LogOut size={14} />
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
