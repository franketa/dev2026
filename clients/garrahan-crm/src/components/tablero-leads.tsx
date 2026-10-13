"use client";

import Link from "next/link";
import { useOptimistic, useTransition, useState } from "react";

type Lead = {
  id: number; nombre: string; telefono: string | null; estado: string; origen: string;
  asesor: string | null; interes: string | null; proxima: string | null;
  vencida: boolean; horasSinContactar: number | null;
};
type Columna = { valor: string; label: string; tono: string };

/**
 * Tablero por estado. En la compu se arrastra la tarjeta de una columna a
 * otra; en el celular, donde arrastrar es incómodo, cada tarjeta tiene su
 * selector. Las dos cosas guardan lo mismo.
 */
export default function TableroLeads({ leads, columnas, accion, horasLimite }: {
  leads: Lead[];
  columnas: Columna[];
  accion: (fd: FormData) => Promise<void>;
  horasLimite: number;
}) {
  const [, empezar] = useTransition();
  const [vista, mover] = useOptimistic(leads, (actual, { id, estado }: { id: number; estado: string }) =>
    actual.map((l) => (l.id === id ? { ...l, estado } : l)));
  const [sobre, setSobre] = useState<string | null>(null);

  function cambiar(id: number, estado: string) {
    const fd = new FormData();
    fd.set("id", String(id));
    fd.set("estado", estado);
    empezar(async () => {
      mover({ id, estado });
      // Si falla, el aviso de error lo muestra <Avisos /> y la tarjeta vuelve
      // sola a su columna: el movimiento optimista se descarta al terminar.
      try { await accion(fd); } catch { /* ya avisado */ }
    });
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 lg:mx-0 lg:px-0 snap-x">
      {columnas.map((c) => {
        const tarjetas = vista.filter((l) => l.estado === c.valor);
        return (
          <div key={c.valor}
            onDragOver={(e) => { e.preventDefault(); setSobre(c.valor); }}
            onDragLeave={() => setSobre((s) => (s === c.valor ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setSobre(null);
              const id = Number(e.dataTransfer.getData("text/plain"));
              if (id) cambiar(id, c.valor);
            }}
            className={`snap-start shrink-0 w-[260px] rounded-xl border p-2.5 transition-colors
              ${sobre === c.valor ? "border-[var(--c-primario)] bg-[var(--c-activo)]" : "border-[var(--c-borde)] bg-[var(--c-superficie)]"}`}>
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-[12.5px] font-semibold">{c.label}</span>
              <span className="text-[11.5px] text-[var(--c-tinta-tenue)] tabular">{tarjetas.length}</span>
            </div>
            <div className="space-y-2 min-h-[60px]">
              {tarjetas.map((l) => {
                const atrasado = l.horasSinContactar !== null && l.horasSinContactar >= horasLimite;
                return (
                  <div key={l.id} draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", String(l.id))}
                    className={`rounded-lg border bg-[var(--c-panel)] p-2.5 cursor-grab active:cursor-grabbing
                      ${atrasado ? "border-[var(--c-rojo-borde,#e3242b)]" : "border-[var(--c-borde)]"}`}>
                    <Link href={`/leads/${l.id}`} className="block text-[13px] font-medium hover:text-[var(--c-primario)]">
                      {l.nombre}
                    </Link>
                    {l.interes && <div className="text-[11.5px] text-[var(--c-tinta-media)] truncate">{l.interes}</div>}
                    <div className="text-[11px] text-[var(--c-tinta-tenue)] mt-0.5">
                      {l.origen}{l.asesor ? ` · ${l.asesor}` : " · sin asesor"}
                    </div>
                    {atrasado && (
                      <div className="mt-1.5 text-[11px] font-semibold text-[var(--c-rojo-alto)]">
                        Sin contactar hace {l.horasSinContactar} h
                      </div>
                    )}
                    {l.proxima && (
                      <div className={`mt-1.5 text-[11px] ${l.vencida ? "text-[var(--c-rojo-alto)] font-semibold" : "text-[var(--c-tinta-media)]"}`}>
                        {l.proxima}
                      </div>
                    )}
                    <select value={l.estado} onChange={(e) => cambiar(l.id, e.target.value)}
                      aria-label="Mover a"
                      className="mt-2 w-full bg-[var(--c-hover)] border border-[var(--c-borde)] rounded-md px-2 py-1 text-[11.5px] lg:hidden">
                      {columnas.map((x) => <option key={x.valor} value={x.valor}>{x.label}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
