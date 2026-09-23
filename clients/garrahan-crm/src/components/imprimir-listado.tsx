"use client";

import { Printer } from "lucide-react";

/**
 * Imprime el listado que se está viendo. No hace falta una librería de PDF:
 * el navegador ofrece "Guardar como PDF" en el mismo diálogo, y la hoja de
 * estilos de impresión ya saca el menú y pasa la tabla a blanco y negro.
 *
 * Imprime lo filtrado, no todo: si alguien filtró por sucursal y antigüedad,
 * eso es exactamente lo que quiere llevarse en papel.
 */
export default function ImprimirListado({ label = "Imprimir" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()}
      className="no-imprimir inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2
        text-[13px] font-semibold bg-[var(--c-activo)] hover:bg-[var(--c-activo-alto)] text-[var(--c-tinta-clara)]
        border border-[var(--c-borde)] transition-colors">
      <Printer size={15} /> {label}
    </button>
  );
}
