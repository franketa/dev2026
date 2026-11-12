"use client";

import { useState } from "react";
import { Search, UserCheck, X } from "lucide-react";

export type ClienteVenta = {
  id: number; nombre: string; apellido: string | null; dni_cuit: string | null;
  telefono: string | null; email: string | null; direccion: string | null; localidad: string | null;
};

type Datos = {
  nombre: string; apellido: string; dni: string; telefono: string;
  email: string; direccion: string; localidad: string;
};

const vacio: Datos = { nombre: "", apellido: "", dni: "", telefono: "", email: "", direccion: "", localidad: "" };

const desde = (c: ClienteVenta): Datos => ({
  nombre: c.nombre || "", apellido: c.apellido || "", dni: c.dni_cuit || "", telefono: c.telefono || "",
  email: c.email || "", direccion: c.direccion || "", localidad: c.localidad || "",
});

const nombreDe = (c: ClienteVenta) => [c.apellido, c.nombre].filter(Boolean).join(", ");
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * El comprador de una venta, como en un boleto en papel: se busca por nombre,
 * DNI o teléfono y, si ya está cargado, sus datos se completan solos. Si no
 * está, se completan acá y queda guardado para la próxima. Lo que se corrija
 * (por ejemplo, el domicilio que faltaba) se guarda en el cliente.
 */
export default function CamposCliente({ clientes, inicial = null, sugerido, compacto = false }: {
  clientes: ClienteVenta[];
  /** El cliente ya elegido (al corregir una venta o al venir de un lead con cliente). */
  inicial?: number | null;
  /** Lo que se sabe del comprador cuando no hay cliente todavía (viene de un lead). */
  sugerido?: Partial<Datos>;
  /** En una columna angosta (la ficha de la venta) los campos van de a dos. */
  compacto?: boolean;
}) {
  const primero = inicial ? clientes.find((c) => c.id === inicial) : undefined;
  const [elegido, setElegido] = useState<ClienteVenta | undefined>(primero);
  const [d, setD] = useState<Datos>(primero ? desde(primero) : { ...vacio, ...sugerido });
  const [buscar, setBuscar] = useState("");

  const q = sinAcentos(buscar.trim());
  const qNum = buscar.replace(/\D/g, "");
  const encontrados = q.length < 2 ? [] : clientes.filter((c) => {
    const texto = sinAcentos(`${c.nombre} ${c.apellido || ""} ${c.apellido || ""} ${c.nombre}`);
    if (q.split(/\s+/).every((p) => texto.includes(p))) return true;
    if (qNum.length >= 4) {
      return (c.dni_cuit || "").replace(/\D/g, "").includes(qNum)
        || (c.telefono || "").replace(/\D/g, "").includes(qNum);
    }
    return false;
  }).slice(0, 6);

  const elegir = (c: ClienteVenta) => { setElegido(c); setD(desde(c)); setBuscar(""); };
  const soltar = () => { setElegido(undefined); setD(vacio); };
  const campo = (k: keyof Datos) => ({
    value: d[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value }),
  });
  const faltan = [!d.dni && "DNI", !d.direccion && "domicilio"].filter(Boolean) as string[];

  return (
    <div>
      <input type="hidden" name="cli_id" value={elegido?.id ?? ""} />

      {elegido ? (
        <div className="flex items-center gap-2 mb-4 rounded-lg border border-[var(--c-verde-borde)]
          bg-[var(--c-verde-fondo)] px-3 py-2 text-[13px]">
          <UserCheck size={15} className="text-[var(--c-verde)] shrink-0" />
          <span className="flex-1">Cliente ya cargado: <b>{nombreDe(elegido)}</b>. Si corregís algo, se guarda en su ficha.</span>
          <button type="button" onClick={soltar}
            className="inline-flex items-center gap-1 text-[12px] text-[var(--c-tinta-media)] hover:text-[var(--c-tinta)]">
            <X size={13} /> Es otro
          </button>
        </div>
      ) : (
        <div className="relative mb-4">
          <span className="etiqueta block mb-1.5">Buscar un cliente ya cargado</span>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-tinta-tenue)]" />
            <input className="campo pl-9" value={buscar} onChange={(e) => setBuscar(e.target.value)}
              placeholder="Nombre, apellido, DNI o teléfono" autoComplete="off"
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
          </div>
          {q.length >= 2 && (
            <div className="mt-1.5 rounded-lg border border-[var(--c-borde)] overflow-hidden">
              {encontrados.length === 0 ? (
                <p className="px-3 py-2 text-[12.5px] text-[var(--c-tinta-tenue)]">
                  No está cargado. Completá los datos abajo y queda guardado.
                </p>
              ) : encontrados.map((c) => (
                <button type="button" key={c.id} onClick={() => elegir(c)}
                  className="block w-full text-left px-3 py-2 text-[13px] hover:bg-[var(--c-hover)]
                    border-b border-[var(--c-borde-suave)] last:border-0">
                  <span className="font-medium">{nombreDe(c)}</span>
                  <span className="text-[var(--c-tinta-tenue)]">
                    {c.dni_cuit ? ` · DNI ${c.dni_cuit}` : ""}{c.telefono ? ` · ${c.telefono}` : ""}
                    {c.localidad ? ` · ${c.localidad}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[11.5px] text-[var(--c-tinta-tenue)]">
            Si es nuevo, completá los datos abajo: queda guardado para la próxima.
          </p>
        </div>
      )}

      <div className={`grid gap-4 ${compacto ? "grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        <label className="block"><span className="etiqueta block mb-1.5">Nombre</span>
          <input name="cli_nombre" className="campo" {...campo("nombre")} /></label>
        <label className="block"><span className="etiqueta block mb-1.5">Apellido</span>
          <input name="cli_apellido" className="campo" {...campo("apellido")} /></label>
        <label className="block"><span className="etiqueta block mb-1.5">DNI / CUIT</span>
          <input name="cli_dni" className="campo" inputMode="numeric" {...campo("dni")} /></label>
        <label className="block"><span className="etiqueta block mb-1.5">Teléfono</span>
          <input name="cli_telefono" className="campo" inputMode="tel" {...campo("telefono")} /></label>
        <label className={`block ${compacto ? "col-span-2" : "sm:col-span-2"}`}><span className="etiqueta block mb-1.5">Domicilio</span>
          <input name="cli_direccion" className="campo" placeholder="Calle y número" {...campo("direccion")} /></label>
        <label className="block"><span className="etiqueta block mb-1.5">Localidad</span>
          <input name="cli_localidad" className="campo" {...campo("localidad")} /></label>
        <label className="block"><span className="etiqueta block mb-1.5">Email</span>
          <input name="cli_email" type="email" className="campo" {...campo("email")} /></label>
      </div>
      {(d.nombre || d.apellido) && faltan.length > 0 && (
        <p className="mt-2 text-[11.5px] text-[var(--c-amarillo)]">
          Falta {faltan.join(" y ")}: el boleto sale con ese dato en blanco.
        </p>
      )}
    </div>
  );
}
