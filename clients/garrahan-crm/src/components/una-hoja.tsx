"use client";

import { useEffect } from "react";

/** Lo que entra en una A4 con los márgenes de @page boleto (10 mm arriba y abajo, 12 mm a los costados). */
const ANCHO_MM = 210 - 24;
const ALTO_MM = 297 - 20 - 3; // 3 mm de aire por redondeos del navegador
const PX_POR_MM = 96 / 25.4;

/**
 * Hace que el documento (.hoja) salga siempre en una sola hoja A4. Al
 * imprimir lo mide con el ancho del papel y, si no entra, lo achica lo justo
 * (y lo ensancha en la misma proporción, para que siga ocupando todo el ancho).
 * Un boleto común entra sin achicarse; uno con muchos pagos u observaciones
 * largas sale apenas más chico, pero en una hoja.
 */
export default function UnaHoja() {
  useEffect(() => {
    const hoja = document.querySelector<HTMLElement>(".hoja");
    if (!hoja) return;

    const volver = () => {
      hoja.style.zoom = "";
      hoja.style.width = "";
      hoja.style.maxWidth = "";
    };
    const ajustar = () => {
      volver();
      // Se mide como va a quedar en papel: con el ancho útil de la A4 y sin el relleno de pantalla.
      hoja.classList.add("hoja--midiendo");
      const alto = hoja.scrollHeight;
      hoja.classList.remove("hoja--midiendo");
      const max = ALTO_MM * PX_POR_MM;
      if (alto <= max) return;
      // Más ancho baja el alto: se repite hasta que entra.
      let z = max / alto;
      for (let i = 0; i < 4; i++) {
        hoja.classList.add("hoja--midiendo");
        hoja.style.width = `${ANCHO_MM / z}mm`;
        hoja.style.maxWidth = "none";
        const a = hoja.scrollHeight * z;
        hoja.classList.remove("hoja--midiendo");
        if (a <= max) break;
        z *= max / a;
      }
      hoja.style.zoom = String(z);
    };

    window.addEventListener("beforeprint", ajustar);
    window.addEventListener("afterprint", volver);
    // Safari no siempre avisa con beforeprint.
    const mq = window.matchMedia("print");
    const cambio = (e: MediaQueryListEvent) => (e.matches ? ajustar() : volver());
    mq.addEventListener?.("change", cambio);
    return () => {
      window.removeEventListener("beforeprint", ajustar);
      window.removeEventListener("afterprint", volver);
      mq.removeEventListener?.("change", cambio);
    };
  }, []);
  return null;
}
