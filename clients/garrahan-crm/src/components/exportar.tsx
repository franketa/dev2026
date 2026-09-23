import { Download } from "lucide-react";

/**
 * Descarga el listado en un CSV que Excel abre bien. Va como <a> y no como
 * Link: una descarga no es una navegación, y el router se la comería.
 */
export default function Exportar({ que, label = "Exportar" }: { que: string; label?: string }) {
  return (
    <a href={`/api/exportar/${que}`} download
      className="inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2
        text-[13px] font-semibold transition-colors bg-[var(--c-activo)] hover:bg-[var(--c-activo-alto)]
        text-[var(--c-tinta-clara)] border border-[var(--c-borde)]">
      <Download size={15} /> {label}
    </a>
  );
}
