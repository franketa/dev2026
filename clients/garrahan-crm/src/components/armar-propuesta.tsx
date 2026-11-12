"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

type Moneda = "ARS" | "USD";
type Opcion = { id: number; etiqueta: string; precio: number; moneda: Moneda };
type Fila = { vehiculo: string; precio: string; moneda: Moneda };
export type InicialPropuesta = {
  cliente: string;
  unidades: { vehiculo_id: number; precio: number; moneda: Moneda }[];
  usado_detalle: string;
  usado_valor: string;
  usado_moneda: Moneda;
  condiciones: string;
  validez_dias: string;
};

const vacia = (): Fila => ({ vehiculo: "", precio: "", moneda: "ARS" });

/**
 * Los campos de la propuesta. Al elegir un auto se completan su precio y su
 * moneda, pero los dos se pueden cambiar: es lo que se le ofrece a este
 * cliente, no el precio de lista. Todo controlado: si el servidor rechaza el
 * envío, lo cargado no se borra.
 */
export default function ArmarPropuesta({ vehiculos, inicial, max }:
  { vehiculos: Opcion[]; inicial: InicialPropuesta; max: number }) {
  const [cliente, setCliente] = useState(inicial.cliente);
  const [filas, setFilas] = useState<Fila[]>(
    inicial.unidades.length
      ? inicial.unidades.map((u) => ({ vehiculo: String(u.vehiculo_id), precio: String(u.precio), moneda: u.moneda }))
      : [vacia()]);
  const [usado, setUsado] = useState(inicial.usado_detalle);
  const [toma, setToma] = useState(inicial.usado_valor);
  const [monedaToma, setMonedaToma] = useState<Moneda>(inicial.usado_moneda);
  const [condiciones, setCondiciones] = useState(inicial.condiciones);
  const [validez, setValidez] = useState(inicial.validez_dias);

  const cambiar = (i: number, cambio: Partial<Fila>) =>
    setFilas((f) => f.map((x, j) => (j === i ? { ...x, ...cambio } : x)));

  const elegir = (i: number, id: string) => {
    const v = vehiculos.find((x) => String(x.id) === id);
    cambiar(i, v ? { vehiculo: id, precio: v.precio ? String(v.precio) : "", moneda: v.moneda } : { vehiculo: id });
  };

  return (
    <div className="space-y-6">
      <label className="block max-w-md">
        <span className="etiqueta block mb-1.5">Para *</span>
        <input name="cliente" required value={cliente} className="campo"
          onChange={(e) => setCliente(e.target.value)} placeholder="Nombre y apellido del cliente" />
      </label>

      {/* ------------------------------------------------------- unidades */}
      <div>
        <span className="etiqueta block mb-2">Unidades</span>
        <div className="space-y-3">
          {filas.map((f, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg border border-[var(--c-borde)]
              sm:p-0 sm:border-0">
              <div className="col-span-12 sm:col-span-7">
                <select name="u_vehiculo" value={f.vehiculo} required className="campo"
                  onChange={(e) => elegir(i, e.target.value)}>
                  <option value="">Elegí un auto del stock</option>
                  {vehiculos.map((v) => (
                    <option key={v.id} value={v.id}
                      disabled={filas.some((x, j) => j !== i && x.vehiculo === String(v.id))}>
                      {v.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-6 sm:col-span-3">
                <input name="u_precio" type="number" step="1" min="1" required value={f.precio}
                  className="campo" placeholder="Precio" aria-label="Precio"
                  onChange={(e) => cambiar(i, { precio: e.target.value })} />
              </div>
              <div className="col-span-4 sm:col-span-1">
                <select name="u_moneda" value={f.moneda} className="campo px-2" aria-label="Moneda"
                  onChange={(e) => cambiar(i, { moneda: e.target.value as Moneda })}>
                  <option value="ARS">$</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1 flex justify-end">
                <button type="button" aria-label="Quitar este auto"
                  onClick={() => setFilas((x) => (x.length === 1 ? [vacia()] : x.filter((_, j) => j !== i)))}
                  className="h-[38px] w-9 grid place-items-center rounded-lg text-[var(--c-tinta-tenue)]
                    hover:text-[var(--c-rojo-alto)] hover:bg-[var(--c-activo)]">
                  <X size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {filas.length < max && (
          <button type="button" onClick={() => setFilas((f) => [...f, vacia()])}
            className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--c-enlace)]
              hover:text-[var(--c-enlace-alto)]">
            <Plus size={14} /> Agregar otro auto
          </button>
        )}
      </div>

      {/* ---------------------------------------------------------- usado */}
      <div className="grid grid-cols-12 gap-2 sm:gap-4 items-end">
        <label className="block col-span-12 sm:col-span-7">
          <span className="etiqueta block mb-1.5">Usado que entrega</span>
          <input name="usado_detalle" value={usado} className="campo"
            onChange={(e) => setUsado(e.target.value)} placeholder="Gol Trend 2015, 120.000 km" />
        </label>
        <label className="block col-span-8 sm:col-span-3">
          <span className="etiqueta block mb-1.5">Valor de toma</span>
          <input name="usado_valor" type="number" step="1" min="0" value={toma} className="campo"
            onChange={(e) => setToma(e.target.value)} />
        </label>
        <label className="block col-span-4 sm:col-span-2">
          <span className="etiqueta block mb-1.5">Moneda</span>
          <select name="usado_moneda" value={monedaToma} className="campo px-2"
            onChange={(e) => setMonedaToma(e.target.value as Moneda)}>
            <option value="ARS">$</option>
            <option value="USD">USD</option>
          </select>
        </label>
      </div>

      <label className="block">
        <span className="etiqueta block mb-1.5">Condiciones</span>
        <textarea name="condiciones" rows={4} value={condiciones} className="campo"
          onChange={(e) => setCondiciones(e.target.value)}
          placeholder={"Financiación: 40% de anticipo y el saldo en 12 cuotas.\nGastos de transferencia a cargo del comprador."} />
      </label>

      <label className="block w-40">
        <span className="etiqueta block mb-1.5">Válida por (días)</span>
        <input name="validez_dias" type="number" min="1" max="90" required value={validez} className="campo"
          onChange={(e) => setValidez(e.target.value)} />
      </label>
    </div>
  );
}
