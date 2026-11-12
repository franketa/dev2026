"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

const CLAVE = "garrahan_tema";

/**
 * Se ejecuta antes de pintar, en un script inline, para que quien haya
 * elegido el tema claro no vea un fogonazo oscuro en cada carga. Por eso no
 * puede vivir en un useEffect: ese corre después del primer render.
 */
export const scriptTema = `
try {
  var t = localStorage.getItem("${CLAVE}");
  if (t === "claro") document.documentElement.setAttribute("data-tema", "claro");
} catch (e) {}
`;

export default function Tema() {
  const [claro, setClaro] = useState(false);

  useEffect(() => {
    try {
      setClaro(localStorage.getItem(CLAVE) === "claro");
    } catch {
      // Modo incógnito o storage bloqueado: se queda en oscuro y listo.
    }
  }, []);

  const alternar = () => {
    const nuevo = !claro;
    setClaro(nuevo);
    const raiz = document.documentElement;
    if (nuevo) raiz.setAttribute("data-tema", "claro");
    else raiz.removeAttribute("data-tema");
    try {
      localStorage.setItem(CLAVE, nuevo ? "claro" : "oscuro");
    } catch {
      // Si no se puede guardar, el cambio vale para esta pestaña igual.
    }
  };

  return (
    <button type="button" onClick={alternar}
      title={claro ? "Pasar a tema oscuro" : "Pasar a tema claro"}
      aria-label={claro ? "Pasar a tema oscuro" : "Pasar a tema claro"}
      className="h-8 w-8 grid place-items-center rounded-lg border border-[var(--c-borde)]
        bg-[var(--c-panel)] text-[var(--c-tinta-tenue)] hover:text-[var(--c-tinta-clara)]
        hover:border-[var(--c-borde-alto)] transition-colors shrink-0">
      {claro ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}
