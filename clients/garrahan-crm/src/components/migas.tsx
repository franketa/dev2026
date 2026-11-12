"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Nombre de cada sección, para no mostrar el slug crudo. */
const NOMBRES: Record<string, string> = {
  vehiculos: "Vehículos",
  ventas: "Ventas",
  clientes: "Clientes",
  leads: "Leads",
  taller: "Taller",
  postventa: "Postventa",
  proveedores: "Proveedores",
  caja: "Caja",
  cobranzas: "Cobranzas",
  deudas: "Deudas a pagar",
  inversores: "Inversores",
  reportes: "Reportes",
  sucursales: "Sucursales",
  usuarios: "Usuarios",
  catalogo: "Catálogo",
  auditoria: "Auditoría",
  configuracion: "Configuración",
  cuenta: "Mi cuenta",
  guia: "Guía del sistema",
  nuevo: "Nuevo",
  nueva: "Nueva",
};

/**
 * Migas de pan en la barra superior. Con fichas anidadas (una unidad, una
 * venta) hace falta saber de dónde se vino sin depender del botón atrás.
 */
export default function Migas() {
  const path = usePathname();
  if (!path || path === "/") {
    return <span className="text-[12.5px] text-[var(--c-tinta-clara)]">Inicio</span>;
  }

  const partes = path.split("/").filter(Boolean);
  const migas = partes.map((parte, i) => {
    const href = "/" + partes.slice(0, i + 1).join("/");
    // Un segmento numérico es el id de una ficha: se muestra como "#12".
    const label = /^\d+$/.test(parte)
      ? "#" + parte
      : NOMBRES[parte] || parte.charAt(0).toUpperCase() + parte.slice(1);
    return { href, label, ultima: i === partes.length - 1 };
  });

  return (
    <nav aria-label="Ubicación" className="flex items-center gap-1.5 min-w-0">
      <Link href="/" className="text-[12.5px] text-[var(--c-tinta-tenue)] hover:text-[var(--c-tinta-clara)] shrink-0">
        Inicio
      </Link>
      {migas.map((m) => (
        <span key={m.href} className="flex items-center gap-1.5 min-w-0">
          <span className="text-[var(--c-borde-alto)] shrink-0">/</span>
          {m.ultima ? (
            <span className="text-[12.5px] text-[var(--c-tinta)] font-medium truncate">{m.label}</span>
          ) : (
            <Link href={m.href} className="text-[12.5px] text-[var(--c-tinta-tenue)] hover:text-[var(--c-tinta-clara)] truncate">
              {m.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
