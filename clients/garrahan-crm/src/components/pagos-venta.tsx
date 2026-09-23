"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

type Fila = { medio: string; monto: string; moneda: string; cotizacion: string; referencia: string };

const MEDIOS: [string, string][] = [
  ["efectivo", "Efectivo"],
  ["transferencia", "Transferencia"],
  ["permuta", "Permuta"],
  ["financiacion", "Financiación"],
  ["cheque", "Cheque"],
  ["tarjeta", "Tarjeta"],
  ["mercadopago", "Mercado Pago"],
  ["otro", "Otro"],
];

const vacia = (): Fila => ({ medio: "efectivo", monto: "", moneda: "ARS", cotizacion: "1", referencia: "" });

const pesos = (n: number) => "$ " + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });

/**
 * Precio y formas de pago viven juntos porque son la misma pregunta: cuánto
 * vale y cómo lo paga. Una venta casi nunca se cobra de una sola forma —hay
 * una seña en efectivo, un usado en permuta y el resto financiado—, así que
 * el cobro se carga por renglones y acá abajo se ve qué queda sin cubrir.
 */
export default function PagosVenta({ precioSugerido = 0 }: { precioSugerido?: number }) {
  const [precio, setPrecio] = useState(precioSugerido ? String(precioSugerido) : "");
  const [descuento, setDescuento] = useState("0");
  const [filas, setFilas] = useState<Fila[]>([vacia()]);

  const cambiar = (i: number, campo: keyof Fila, valor: string) =>
    setFilas((f) => f.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));

  const total = Math.max(0, Number(precio || 0) - Number(descuento || 0));
  const sumado = filas.reduce((a, f) => {
    const m = Number(f.monto || 0);
    const c = f.moneda === "USD" ? Number(f.cotizacion || 1) : 1;
    return a + m * c;
  }, 0);
  const resta = total - sumado;

  return (
    <div className="space-y-5">
      {/* --------------------------------------------------------- precio */}
      <div className="grid sm:grid-cols-3 gap-4">
        <label className="block">
          <span className="etiqueta block mb-1.5">Precio de venta *</span>
          <input name="precio" type="number" step="0.01" min="0" required value={precio}
            className="campo" onChange={(e) => setPrecio(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiqueta block mb-1.5">Descuento</span>
          <input name="descuento" type="number" step="0.01" min="0" value={descuento}
            className="campo" onChange={(e) => setDescuento(e.target.value)} />
        </label>
        <div>
          <span className="etiqueta block mb-1.5">Total de la operación</span>
          <div className="h-[38px] flex items-center px-3 rounded-lg bg-[var(--c-hover)] border border-[var(--c-borde)]
            text-[15px] font-semibold tabular text-[var(--c-tinta)]">
            {pesos(total)}
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------- renglones */}
      <div className="space-y-3">
        {filas.map((f, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-12 sm:col-span-3">
              {i === 0 && <span className="etiqueta block mb-1.5">Medio</span>}
              <select name="pago_medio" value={f.medio} className="campo"
                onChange={(e) => cambiar(i, "medio", e.target.value)}>
                {MEDIOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="col-span-5 sm:col-span-3">
              {i === 0 && <span className="etiqueta block mb-1.5">Monto</span>}
              <input name="pago_monto" type="number" step="0.01" min="0" value={f.monto} className="campo"
                onChange={(e) => cambiar(i, "monto", e.target.value)} />
            </div>
            <div className="col-span-3 sm:col-span-2">
              {i === 0 && <span className="etiqueta block mb-1.5">Moneda</span>}
              <select name="pago_moneda" value={f.moneda} className="campo"
                onChange={(e) => cambiar(i, "moneda", e.target.value)}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="col-span-4 sm:col-span-2">
              {i === 0 && <span className="etiqueta block mb-1.5">Cotización</span>}
              <input name="pago_cotizacion" type="number" step="0.01" min="0" value={f.cotizacion}
                disabled={f.moneda !== "USD"} className="campo disabled:opacity-40"
                onChange={(e) => cambiar(i, "cotizacion", e.target.value)} />
            </div>
            <div className="col-span-7 sm:col-span-1">
              {i === 0 && <span className="etiqueta block mb-1.5">Ref.</span>}
              <input name="pago_referencia" value={f.referencia} className="campo"
                onChange={(e) => cambiar(i, "referencia", e.target.value)} />
            </div>
            <div className="col-span-1 flex justify-end">
              <button type="button" aria-label="Quitar renglón"
                onClick={() => setFilas((x) => (x.length === 1 ? [vacia()] : x.filter((_, j) => j !== i)))}
                className="h-[38px] w-9 grid place-items-center rounded-lg text-[var(--c-tinta-tenue)] hover:text-[var(--c-rojo-alto)] hover:bg-[var(--c-activo)]">
                <X size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setFilas((f) => [...f, vacia()])}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--c-enlace)] hover:text-[var(--c-enlace-alto)]">
          <Plus size={14} /> Agregar forma de pago
        </button>

        {total > 0 && (
          <div className="text-[12.5px] tabular">
            <span className="text-[var(--c-tinta-tenue)]">Cargado </span>
            <span className="text-[var(--c-tinta)]">{pesos(sumado)}</span>
            <span className="text-[var(--c-tinta-tenue)]"> · </span>
            <span className={Math.abs(resta) < 1 ? "text-[var(--c-verde)]" : resta > 0 ? "text-[var(--c-amarillo)]" : "text-[var(--c-rojo-alto)]"}>
              {Math.abs(resta) < 1
                ? "coincide con el total"
                : resta > 0
                  ? "quedan " + pesos(resta) + " a cobrar"
                  : "se pasó " + pesos(Math.abs(resta))}
            </span>
          </div>
        )}
      </div>

      <p className="text-[11.5px] text-[var(--c-tinta-tenue)] leading-relaxed">
        Lo que se cargue en efectivo, transferencia, tarjeta o Mercado Pago entra a la cuenta
        de caja que elijas abajo. Si queda un saldo sin cubrir, se abre solo en Cobranzas.
      </p>
    </div>
  );
}
