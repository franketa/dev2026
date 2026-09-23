"use client";

import { useRef, useTransition } from "react";

/** Selector que guarda solo al cambiar, sin botón. Para editar desde la tabla. */
export default function SelectEstado({ id, valor, opciones, accion }: {
  id: number;
  valor: string;
  opciones: { valor: string; label: string }[];
  accion: (fd: FormData) => Promise<void>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [pendiente, empezar] = useTransition();

  return (
    <form ref={form} action={accion}>
      <input type="hidden" name="id" value={id} />
      <select
        name="estado"
        defaultValue={valor}
        disabled={pendiente}
        onChange={() => empezar(() => form.current?.requestSubmit())}
        className={`bg-[var(--c-hover)] border border-[var(--c-borde)] rounded-md px-2 py-1 text-[12px]
          text-[var(--c-tinta)] hover:border-[var(--c-primario)] transition-colors cursor-pointer
          ${pendiente ? "opacity-50" : ""}`}
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>{o.label}</option>
        ))}
      </select>
    </form>
  );
}
