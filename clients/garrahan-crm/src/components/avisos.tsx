"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import type { Aviso } from "@/lib/aviso";

/**
 * Los avisos que aparecen abajo después de guardar algo.
 *
 * Las acciones del servidor dejan el aviso en la cookie "aviso" (lib/aviso.ts).
 * Para leerla justo cuando vuelve la respuesta, se envuelve window.fetch: Next
 * manda cada acción como un POST con el encabezado "next-action". Ahí mismo se
 * detecta lo que no tiene aviso propio: una caída del servidor o sin conexión.
 */

let ultimoError = 0;
/** Si hubo un aviso de error desde ese momento. Para deshacer un cambio en pantalla. */
export const huboErrorDesde = (t: number) => ultimoError >= t;

const oyentes = new Set<(a: Aviso) => void>();
function emitir(a: Aviso) {
  if (a.tipo === "error") ultimoError = Date.now();
  oyentes.forEach((f) => f(a));
}

function leerCookie() {
  const crudo = document.cookie.split("; ").find((c) => c.startsWith("aviso="))?.slice(6);
  if (!crudo) return false;
  document.cookie = "aviso=; Max-Age=0; path=/";
  let texto = crudo;
  for (let i = 0; i < 2; i++) {
    try { emitir(JSON.parse(texto)); return true; } catch { texto = decodeURIComponent(texto); }
  }
  return false;
}

const esAccion = (init?: RequestInit) => {
  const h = init?.headers;
  if (!h) return false;
  if (h instanceof Headers) return h.has("next-action");
  if (Array.isArray(h)) return h.some(([k]) => k.toLowerCase() === "next-action");
  return Object.keys(h).some((k) => k.toLowerCase() === "next-action");
};

function instalar() {
  const w = window as any;
  if (w.__avisosInstalados) return;
  w.__avisosInstalados = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!esAccion(init)) return original(input, init);
    try {
      const r = await original(input, init);
      const tuvo = leerCookie();
      if (!tuvo && r.status >= 500) {
        emitir({ id: "e" + Date.now(), tipo: "error", texto: "Algo falló y no se guardó. Probá de nuevo." });
      }
      return r;
    } catch (err) {
      emitir({ id: "c" + Date.now(), tipo: "error", texto: "Sin conexión: no se guardó. Revisá internet y probá de nuevo." });
      throw err;
    }
  };
}

export default function Avisos() {
  const [lista, setLista] = useState<Aviso[]>([]);

  useEffect(() => {
    const agregar = (a: Aviso) => {
      setLista((l) => [...l.filter((x) => x.id !== a.id), a].slice(-3));
      setTimeout(() => setLista((l) => l.filter((x) => x.id !== a.id)), a.tipo === "error" ? 7000 : 3500);
    };
    oyentes.add(agregar);
    instalar();
    leerCookie(); // por si el aviso llegó con una carga completa de la página
    return () => { oyentes.delete(agregar); };
  }, []);

  return (
    <div aria-live="polite" role="status"
      className="no-imprimir fixed z-[60] bottom-4 inset-x-4 sm:inset-x-auto sm:right-5 sm:bottom-5
        flex flex-col gap-2 items-stretch sm:items-end pointer-events-none">
      {lista.map((a) => (
        <div key={a.id}
          className={`aviso-entra pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3
            shadow-lg text-[13px] sm:max-w-[380px]
            ${a.tipo === "error"
              ? "border-[var(--c-rojo-borde)] bg-[var(--c-rojo-fondo)] text-[var(--c-rojo-alto)]"
              : "border-[var(--c-verde-borde)] bg-[var(--c-verde-fondo)] text-[var(--c-verde-alto)]"}`}>
          {a.tipo === "error"
            ? <AlertTriangle size={16} className="shrink-0 mt-px" />
            : <CheckCircle2 size={16} className="shrink-0 mt-px" />}
          <span className="flex-1 leading-snug font-medium">{a.texto}</span>
          <button type="button" aria-label="Cerrar" className="shrink-0 opacity-70 hover:opacity-100"
            onClick={() => setLista((l) => l.filter((x) => x.id !== a.id))}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
