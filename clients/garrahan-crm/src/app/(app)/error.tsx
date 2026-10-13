"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * Si algo se rompe al cargar una pantalla o al guardar, se ve esto dentro del
 * sistema —con el menú a mano— en vez de la página de error de Next.
 */
export default function ErrorPantalla({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="max-w-[520px] mx-auto mt-10 rounded-xl border border-[var(--c-rojo-borde)]
      bg-[var(--c-rojo-fondo)] p-6 text-center">
      <AlertTriangle size={28} className="mx-auto text-[var(--c-rojo-alto)]" />
      <h1 className="mt-3 text-[17px] font-semibold text-[var(--c-rojo-alto)]">Algo falló</h1>
      <p className="mt-2 text-[13px] text-[var(--c-tinta-media)] leading-relaxed">
        No se pudo completar lo que estabas haciendo. Si estabas guardando algo, revisá si quedó
        cargado antes de repetirlo.
      </p>
      {error.digest && (
        <p className="mt-2 text-[11px] text-[var(--c-tinta-tenue)]">Código: {error.digest}</p>
      )}
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={reset}
          className="rounded-lg px-3.5 py-2 text-[13px] font-semibold bg-[var(--c-primario)] text-white">
          Volver a intentar
        </button>
        <Link href="/" className="rounded-lg px-3.5 py-2 text-[13px] font-semibold border border-[var(--c-borde)]
          text-[var(--c-tinta-clara)]">
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
