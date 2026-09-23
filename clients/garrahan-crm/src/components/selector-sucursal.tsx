"use client";

import { useRef, useTransition } from "react";
import { Building2, ChevronDown } from "lucide-react";

type Sucursal = { id: number; nombre: string };

/**
 * Selector de sucursal activa, arriba del menú. Filtra todos los listados de
 * una sola vez, en lugar de obligar a elegir la sucursal en cada pantalla.
 */
export default function SelectorSucursal({ sucursales, actual, accion }: {
  sucursales: Sucursal[];
  actual: string;
  accion: (fd: FormData) => Promise<void>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [pendiente, empezar] = useTransition();

  // Con una sola sucursal el selector es ruido: se muestra el nombre y listo.
  if (sucursales.length <= 1) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--c-borde)]
        bg-[var(--c-panel)] px-2.5 py-2 text-[12.5px] text-[var(--c-tinta-clara)]">
        <Building2 size={14} className="text-[var(--c-tinta-tenue)] shrink-0" />
        <span className="truncate">{sucursales[0]?.nombre || "Casa Central"}</span>
      </div>
    );
  }

  return (
    <form ref={form} action={accion}>
      <div className={`relative flex items-center gap-2 rounded-lg border border-[var(--c-borde)]
        bg-[var(--c-panel)] px-2.5 hover:border-[var(--c-borde-alto)] transition-colors
        ${pendiente ? "opacity-50" : ""}`}>
        <Building2 size={14} className="text-[var(--c-tinta-tenue)] shrink-0" />
        <select
          name="sucursal"
          defaultValue={actual}
          disabled={pendiente}
          onChange={() => empezar(() => form.current?.requestSubmit())}
          className="appearance-none bg-transparent py-2 pr-4 text-[12.5px] text-[var(--c-tinta-clara)]
            outline-none cursor-pointer w-full"
        >
          <option value="todas">Todas las sucursales</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>{s.nombre}</option>
          ))}
        </select>
        <ChevronDown size={13} className="text-[var(--c-tinta-tenue)] shrink-0 pointer-events-none absolute right-2.5" />
      </div>
    </form>
  );
}
