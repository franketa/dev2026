"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";

const LADO = 1600;      // lado mayor de la foto guardada: alcanza para la web y pesa poco
const CALIDAD = 0.82;

/** Achica la foto en el navegador. Una foto de celular pasa de ~4 MB a ~250 KB. */
async function achicar(archivo: File): Promise<{ blob: Blob; ancho: number; alto: number }> {
  const bmp = await createImageBitmap(archivo, { imageOrientation: "from-image" } as any);
  const escala = Math.min(1, LADO / Math.max(bmp.width, bmp.height));
  const ancho = Math.round(bmp.width * escala);
  const alto = Math.round(bmp.height * escala);
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  lienzo.getContext("2d")!.drawImage(bmp, 0, 0, ancho, alto);
  bmp.close();
  const blob = await new Promise<Blob>((ok, mal) =>
    lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo procesar la foto"))), "image/jpeg", CALIDAD));
  return { blob, ancho, alto };
}

/**
 * Botón para cargar fotos. Desde el celular abre la cámara o la galería, y se
 * pueden elegir varias de una vez.
 */
export default function SubirFotos({ vehiculoId }: { vehiculoId: number }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function subir(archivos: FileList | null) {
    if (!archivos?.length) return;
    setOcupado(true);
    let errores = 0;
    const lista = Array.from(archivos);
    for (let i = 0; i < lista.length; i++) {
      setEstado(`Subiendo ${i + 1} de ${lista.length}…`);
      try {
        const { blob, ancho, alto } = await achicar(lista[i]);
        const fd = new FormData();
        fd.append("foto", new File([blob], "foto.jpg", { type: "image/jpeg" }));
        fd.append("ancho", String(ancho));
        fd.append("alto", String(alto));
        const r = await fetch(`/api/vehiculos/${vehiculoId}/fotos`, { method: "POST", body: fd });
        if (!r.ok) errores++;
      } catch {
        errores++;
      }
    }
    setEstado(errores ? `${errores} ${errores === 1 ? "foto no se pudo subir" : "fotos no se pudieron subir"}` : "");
    setOcupado(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input ref={input} type="file" accept="image/*" multiple hidden
        onChange={(e) => subir(e.target.files)} />
      <button type="button" disabled={ocupado} onClick={() => input.current?.click()}
        className="inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold
          bg-[var(--c-primario)] hover:bg-[var(--c-primario-alto)] text-white transition-colors disabled:opacity-60">
        <Camera size={15} /> {ocupado ? "Subiendo…" : "Agregar fotos"}
      </button>
      {estado && <span className="text-[12.5px] text-[var(--c-tinta-media)]">{estado}</span>}
    </div>
  );
}
