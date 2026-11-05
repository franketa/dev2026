"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

/** La misma lista que ofrecía el panel de la web, para tildar en vez de escribir. */
export const EQUIPAMIENTO_SUGERIDO = [
  "Único dueño", "Service oficial", "Aire acondicionado", "Dirección asistida",
  "Levantavidrios eléctricos", "Cierre centralizado", "ABS + Airbags", "Bluetooth",
  "Pantalla multimedia", "Cámara de retroceso", "Sensores de estacionamiento",
  "Control crucero", "Climatizador automático", "Tapizado de cuero",
  "Llantas de aleación", "Faros LED", "Techo panorámico", "Cubiertas nuevas",
  "VTV al día", "Papeles al día", "GNC instalado",
];

/**
 * El equipamiento se tilda. Lo que no está en la lista se agrega a mano y
 * queda tildado. Se guarda igual que antes: un ítem por renglón.
 */
export default function Equipamiento({ inicial = "" }: { inicial?: string }) {
  const previos = inicial.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const [tildados, setTildados] = useState<string[]>(previos);
  const [extras, setExtras] = useState<string[]>(previos.filter((p) => !EQUIPAMIENTO_SUGERIDO.includes(p)));
  const [nuevo, setNuevo] = useState("");

  const alternar = (item: string) =>
    setTildados((t) => (t.includes(item) ? t.filter((x) => x !== item) : [...t, item]));
  const agregar = () => {
    const item = nuevo.trim();
    if (!item) return;
    if (!EQUIPAMIENTO_SUGERIDO.includes(item) && !extras.includes(item)) setExtras([...extras, item]);
    if (!tildados.includes(item)) setTildados([...tildados, item]);
    setNuevo("");
  };
  const quitarExtra = (item: string) => {
    setExtras(extras.filter((x) => x !== item));
    setTildados(tildados.filter((x) => x !== item));
  };

  // El orden de la lista, y después lo agregado a mano.
  const valor = [...EQUIPAMIENTO_SUGERIDO, ...extras].filter((x) => tildados.includes(x)).join("\n");

  return (
    <div>
      <input type="hidden" name="equipamiento" value={valor} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
        {[...EQUIPAMIENTO_SUGERIDO, ...extras].map((item) => (
          <label key={item}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] cursor-pointer hover:bg-[var(--c-hover)]">
            <input type="checkbox" checked={tildados.includes(item)} onChange={() => alternar(item)}
              className="h-4 w-4 accent-[var(--c-primario)]" />
            <span className="flex-1">{item}</span>
            {extras.includes(item) && (
              <button type="button" onClick={() => quitarExtra(item)} aria-label={`Quitar ${item}`}
                className="text-[var(--c-tinta-tenue)] hover:text-[var(--c-rojo-alto)]">
                <X size={13} />
              </button>
            )}
          </label>
        ))}
      </div>
      <div className="flex gap-2 mt-2 max-w-md">
        <input className="campo" value={nuevo} onChange={(e) => setNuevo(e.target.value)}
          placeholder="Otro (ej.: Enganche)"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } }} />
        <button type="button" onClick={agregar}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--c-borde)] px-3 text-[12.5px]
            text-[var(--c-tinta-clara)] hover:bg-[var(--c-hover)] whitespace-nowrap">
          <Plus size={14} /> Agregar
        </button>
      </div>
    </div>
  );
}
