"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type Resultado = { grupo: string; titulo: string; detalle: string; href: string };

/**
 * Una sola caja para buscar cualquier cosa: dominio, cliente, teléfono o
 * número de venta. Se abre con Ctrl+K o con la barra de arriba, y se
 * navega con las flechas sin tocar el mouse.
 */
export default function Buscador() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Resultado[]>([]);
  const [sel, setSel] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Ctrl+K abre, Escape cierra. Es el atajo que ya tienen en la cabeza.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierto(true);
      }
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (abierto) setTimeout(() => input.current?.focus(), 30);
    else { setQ(""); setRes([]); setSel(0); }
  }, [abierto]);

  // Se espera a que deje de tipear: si no, cada tecla pega contra la base.
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); setBuscando(false); return; }
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/buscar?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        setRes(d.resultados || []);
        setSel(0);
      } catch {
        setRes([]);
      } finally {
        setBuscando(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const ir = (href: string) => { setAbierto(false); router.push(href); };

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, res.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && res[sel]) { e.preventDefault(); ir(res[sel].href); }
  };

  let grupoPrevio = "";

  return (
    <>
      <button onClick={() => setAbierto(true)}
        className="flex items-center gap-2 rounded-lg border border-[var(--c-borde)] bg-[var(--c-panel)]
          px-3 py-1.5 text-[12.5px] text-[var(--c-tinta-tenue)] hover:border-[var(--c-borde-alto)] transition-colors
          min-w-[180px] sm:min-w-[260px]">
        <Search size={14} />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="hidden sm:inline text-[10.5px] px-1.5 py-0.5 rounded border
          border-[var(--c-borde)] bg-[var(--c-superficie)] text-[var(--c-tinta-apagada)]">Ctrl K</kbd>
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[60] bg-black/70 px-4 pt-[12vh]"
          onClick={() => setAbierto(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="mx-auto w-full max-w-xl bg-[var(--c-panel)] border border-[var(--c-borde)]
              rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 border-b border-[var(--c-borde)]">
              <Search size={16} className="text-[var(--c-tinta-tenue)] shrink-0" />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={teclas}
                placeholder="Dominio, cliente, teléfono, modelo o N° de venta"
                className="flex-1 bg-transparent py-3.5 text-[14px] text-[var(--c-tinta)]
                  placeholder:text-[var(--c-tinta-apagada)] outline-none" />
              <button onClick={() => setAbierto(false)}
                className="text-[11px] text-[var(--c-tinta-apagada)] px-1.5 py-0.5 rounded border border-[var(--c-borde)]">esc</button>
            </div>

            <div className="max-h-[52vh] overflow-y-auto py-1.5">
              {q.trim().length < 2 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-[var(--c-tinta-apagada)]">
                  Escribí al menos dos letras.
                </p>
              ) : buscando && res.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-[var(--c-tinta-apagada)]">Buscando…</p>
              ) : res.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-[var(--c-tinta-apagada)]">
                  Nada que coincida con «{q}».
                </p>
              ) : (
                res.map((r, i) => {
                  const nuevoGrupo = r.grupo !== grupoPrevio;
                  grupoPrevio = r.grupo;
                  return (
                    <div key={r.href + i}>
                      {nuevoGrupo && <div className="etiqueta px-4 pt-2.5 pb-1">{r.grupo}</div>}
                      <button onClick={() => ir(r.href)} onMouseEnter={() => setSel(i)}
                        className={`w-full text-left px-4 py-2 transition-colors
                          ${i === sel ? "bg-[var(--c-activo)]" : "hover:bg-[var(--c-hover)]"}`}>
                        <div className="text-[13px] text-[var(--c-tinta)]">{r.titulo}</div>
                        {r.detalle && (
                          <div className="text-[11.5px] text-[var(--c-tinta-tenue)] mt-0.5">{r.detalle}</div>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {res.length > 0 && (
              <div className="border-t border-[var(--c-borde)] px-4 py-2 text-[11px] text-[var(--c-tinta-apagada)]
                flex gap-4">
                <span>↑↓ moverse</span><span>Enter abrir</span><span>Esc cerrar</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
