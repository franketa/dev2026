"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, MessageCircle, Users } from "lucide-react";
import { leadContactado } from "@/lib/leads-acciones";

export type LeadMenu = {
  id: number;
  nombre: string;
  auto: string | null;
  accion: string | null;
  hace: string;
  whatsapp: string | null;
  grupo: "nuevo" | "vencido" | "hoy";
};

const GRUPOS: { clave: LeadMenu["grupo"]; titulo: string }[] = [
  { clave: "nuevo", titulo: "Nuevos sin contactar" },
  { clave: "vencido", titulo: "Seguimiento vencido" },
  { clave: "hoy", titulo: "Para hoy" },
];
const POR_GRUPO = 6;

/** Clases enteras (no armadas) para que Tailwind las genere. */
const COLORES = {
  rojo: { caja: "border-[var(--c-rojo-borde)] bg-[var(--c-rojo-fondo)] hover:border-[var(--c-rojo)]", tinta: "text-[var(--c-rojo-alto)]" },
  amarillo: { caja: "border-[var(--c-amarillo-borde)] bg-[var(--c-amarillo-fondo)] hover:border-[var(--c-amarillo)]", tinta: "text-[var(--c-amarillo)]" },
  verde: { caja: "border-[var(--c-verde-borde)] bg-[var(--c-verde-fondo)] hover:border-[var(--c-verde)]", tinta: "text-[var(--c-verde-alto)]" },
};

export default function MenuLeads({ leads }: { leads: LeadMenu[] }) {
  const [abierto, setAbierto] = useState(false);
  const [hechos, setHechos] = useState<number[]>([]);
  const [, empezar] = useTransition();
  const caja = useRef<HTMLDivElement>(null);

  // Se cierra al tocar afuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);

  // Lo marcado como contactado desaparece en el momento, sin esperar al servidor.
  const visibles = leads.filter((l) => !hechos.includes(l.id));
  const nuevos = visibles.filter((l) => l.grupo === "nuevo").length;
  const total = visibles.length;
  const tono = nuevos > 0 ? "rojo" : total > 0 ? "amarillo" : "verde";
  const color = COLORES[tono];

  const contactado = (id: number) => {
    setHechos((h) => [...h, id]);
    empezar(async () => {
      const r = await leadContactado(id);
      if (!r?.ok) setHechos((h) => h.filter((x) => x !== id));
    });
  };

  return (
    <div className="relative" ref={caja}>
      <button type="button" onClick={() => setAbierto(!abierto)}
        title={tono === "verde" ? "No hay leads para atender" : `${nuevos} nuevos sin contactar · ${total - nuevos} seguimientos`}
        className={`flex items-center gap-2 rounded-lg border px-2.5 sm:px-3 py-1.5 transition-colors ${color.caja}`}>
        <Users size={14} className={color.tinta} />
        <span className={`text-[12px] font-semibold whitespace-nowrap ${color.tinta}`}>
          {tono === "verde" ? <>Leads <span className="hidden sm:inline">al día</span></>
            : <>{total} <span className="hidden sm:inline">{total === 1 ? "lead" : "leads"}</span></>}
        </span>
      </button>

      {abierto && (
        <div className="fixed left-2 right-2 top-[60px] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[390px]
          max-h-[75vh] overflow-y-auto rounded-xl border border-[var(--c-borde)] bg-[var(--c-panel)] shadow-2xl z-50">
          {total === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-[var(--c-tinta-media)]">
              No hay leads para atender. Todo al día 👌
            </p>
          ) : GRUPOS.map((g) => {
            const lista = visibles.filter((l) => l.grupo === g.clave);
            if (!lista.length) return null;
            return (
              <div key={g.clave} className="border-b border-[var(--c-borde)] last:border-0">
                <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
                  <span className={`etiqueta ${g.clave === "nuevo" ? "text-[var(--c-rojo-alto)]" : ""}`}>{g.titulo}</span>
                  <span className="text-[11.5px] text-[var(--c-tinta-tenue)]">{lista.length}</span>
                </div>
                {lista.slice(0, POR_GRUPO).map((l) => (
                  <div key={l.id} className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--c-hover)]">
                    <Link href={`/leads/${l.id}`} onClick={() => setAbierto(false)} className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{l.nombre}</div>
                      <div className="text-[11.5px] text-[var(--c-tinta-tenue)] truncate">
                        {[l.auto, g.clave === "nuevo" ? `entró ${l.hace}` : l.accion].filter(Boolean).join(" · ")}
                      </div>
                    </Link>
                    {l.whatsapp && (
                      <a href={`https://wa.me/${l.whatsapp}`} target="_blank" rel="noopener noreferrer"
                        title="Abrir el chat de WhatsApp" aria-label={`WhatsApp a ${l.nombre}`}
                        className="grid place-items-center h-8 w-8 shrink-0 rounded-lg border border-[var(--c-verde-borde)]
                          bg-[var(--c-verde-fondo)] text-[var(--c-verde-alto)] hover:bg-[var(--c-verde-fondo-alto)]">
                        <MessageCircle size={15} />
                      </a>
                    )}
                    <button type="button" onClick={() => contactado(l.id)}
                      title={g.clave === "nuevo" ? "Pasarlo a contactado" : "Dar el seguimiento por hecho"}
                      className="inline-flex items-center gap-1 h-8 shrink-0 rounded-lg border border-[var(--c-borde)] px-2
                        text-[11.5px] text-[var(--c-tinta-clara)] hover:bg-[var(--c-activo)] whitespace-nowrap">
                      <Check size={13} /> Ya lo contacté
                    </button>
                  </div>
                ))}
                {lista.length > POR_GRUPO && (
                  <Link href={g.clave === "nuevo" ? "/leads?estado=nuevo" : "/leads"} onClick={() => setAbierto(false)}
                    className="block px-4 pb-3 pt-1 text-[12px] text-[var(--c-enlace)] hover:underline">
                    Ver los {lista.length}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
