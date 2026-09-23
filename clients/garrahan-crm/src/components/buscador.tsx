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
        className="flex items-center gap-2 rounded-lg border border-[#1f2937] bg-[#111721]
          px-3 py-1.5 text-[12.5px] text-[#64748b] hover:border-[#334155] transition-colors
          min-w-[180px] sm:min-w-[260px]">
        <Search size={14} />
        <span className="flex-1 text-left">Buscar…</span>
        <kbd className="hidden sm:inline text-[10.5px] px-1.5 py-0.5 rounded border
          border-[#1f2937] bg-[#0d131c] text-[#475569]">Ctrl K</kbd>
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[60] bg-black/70 px-4 pt-[12vh]"
          onClick={() => setAbierto(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="mx-auto w-full max-w-xl bg-[#111721] border border-[#1f2937]
              rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 border-b border-[#1f2937]">
              <Search size={16} className="text-[#64748b] shrink-0" />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={teclas}
                placeholder="Dominio, cliente, teléfono, modelo o N° de venta"
                className="flex-1 bg-transparent py-3.5 text-[14px] text-[#e8edf5]
                  placeholder:text-[#475569] outline-none" />
              <button onClick={() => setAbierto(false)}
                className="text-[11px] text-[#475569] px-1.5 py-0.5 rounded border border-[#1f2937]">esc</button>
            </div>

            <div className="max-h-[52vh] overflow-y-auto py-1.5">
              {q.trim().length < 2 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-[#475569]">
                  Escribí al menos dos letras.
                </p>
              ) : buscando && res.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-[#475569]">Buscando…</p>
              ) : res.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-[#475569]">
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
                          ${i === sel ? "bg-[#1b2433]" : "hover:bg-[#151d29]"}`}>
                        <div className="text-[13px] text-[#e8edf5]">{r.titulo}</div>
                        {r.detalle && (
                          <div className="text-[11.5px] text-[#64748b] mt-0.5">{r.detalle}</div>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {res.length > 0 && (
              <div className="border-t border-[#1f2937] px-4 py-2 text-[11px] text-[#475569]
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
