"use client";

import { useEffect, useState, useTransition } from "react";
import { huboErrorDesde } from "./avisos";

/**
 * Selector que guarda solo al cambiar, sin botón. Para editar desde la tabla.
 * El aviso de "Guardado" lo da la acción; si no se pudo guardar, el selector
 * vuelve a mostrar lo que había, para no aparentar un cambio que no existe.
 */
export default function SelectEstado({ id, valor, opciones, accion }: {
  id: number;
  valor: string;
  opciones: { valor: string; label: string }[];
  accion: (fd: FormData) => Promise<void>;
}) {
  const [actual, setActual] = useState(valor);
  const [pendiente, empezar] = useTransition();

  useEffect(() => setActual(valor), [valor]);

  function cambiar(nuevo: string) {
    const anterior = actual;
    setActual(nuevo);
    const fd = new FormData();
    fd.set("id", String(id));
    fd.set("estado", nuevo);
    const desde = Date.now();
    empezar(async () => {
      try {
        await accion(fd);
        if (huboErrorDesde(desde)) setActual(anterior);
      } catch {
        setActual(anterior);
      }
    });
  }

  return (
    <select
      value={actual}
      disabled={pendiente}
      onChange={(e) => cambiar(e.target.value)}
      className={`bg-[var(--c-hover)] border border-[var(--c-borde)] rounded-md px-2 py-1 text-[12px]
        text-[var(--c-tinta)] hover:border-[var(--c-primario)] transition-colors cursor-pointer
        ${pendiente ? "opacity-50" : ""}`}
    >
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>{o.label}</option>
      ))}
    </select>
  );
}
