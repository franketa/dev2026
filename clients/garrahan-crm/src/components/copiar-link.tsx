"use client";

import { useState } from "react";
import { Link2, Check } from "lucide-react";

/** Copia el link de la propuesta, para pegarlo donde haga falta. */
export default function CopiarLink({ url, className = "" }: { url: string; className?: string }) {
  const [listo, setListo] = useState(false);
  return (
    <button type="button" className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          // Sin permiso de portapapeles (http, navegador viejo): se muestra para copiar a mano.
          window.prompt("Copiá el link:", url);
          return;
        }
        setListo(true);
        setTimeout(() => setListo(false), 2000);
      }}>
      {listo ? <Check size={15} /> : <Link2 size={15} />} {listo ? "Copiado" : "Copiar link"}
    </button>
  );
}
