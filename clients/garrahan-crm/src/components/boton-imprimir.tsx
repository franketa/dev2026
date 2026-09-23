"use client";

import { Printer } from "lucide-react";

export default function BotonImprimir() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-lg bg-[#2f6bff] hover:bg-[#4d81ff]
        px-3.5 py-2 text-[13px] font-semibold text-white transition-colors"
    >
      <Printer size={15} /> Imprimir o guardar PDF
    </button>
  );
}
