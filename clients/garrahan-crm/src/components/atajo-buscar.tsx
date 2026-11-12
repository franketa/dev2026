"use client";

import { useEffect } from "react";

/**
 * La barra "/" enfoca el buscador del listado, como en AutoGestión y como en
 * casi cualquier herramienta que se usa todo el día. Ctrl+K sigue abriendo el
 * buscador global; esto es para filtrar la tabla que ya se está mirando.
 */
export default function AtajoBuscar() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const activo = document.activeElement as HTMLElement | null;
      const escribiendo = activo && (
        activo.tagName === "INPUT" || activo.tagName === "TEXTAREA" ||
        activo.tagName === "SELECT" || activo.isContentEditable
      );
      if (escribiendo) return; // si ya está escribiendo, la barra es una barra

      const caja = document.querySelector<HTMLInputElement>('input[name="q"]');
      if (!caja) return;
      e.preventDefault();
      caja.focus();
      caja.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
