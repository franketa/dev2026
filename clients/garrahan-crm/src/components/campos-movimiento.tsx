"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORIAS, TIPOS_COSTO } from "@/lib/constantes";
import { Campo } from "@/components/ui";

export type InicialMovimiento = {
  fecha: string; tipo: string; cuenta: string; destino: string; categoria: string;
  descripcion: string; contraparte: string; monto: string; moneda: string;
  cotizacion: string; forma_pago: string;
};

/**
 * Los campos de un movimiento de caja, para cargarlo y para corregirlo.
 * La categoría depende del tipo: con Egreso solo se ven gastos y con Ingreso
 * solo ingresos, así un gasto no puede quedar sumando en la caja.
 */
export default function CamposMovimiento({ cuentas, vehiculos = [], inicial }: {
  cuentas: { id: number; nombre: string }[];
  /** Los autos a los que se les puede cargar una preparación. */
  vehiculos?: { id: number; marca: string; modelo: string; anio: number | null; dominio: string | null }[];
  inicial?: InicialMovimiento;
}) {
  const [tipo, setTipo] = useState(inicial?.tipo || "egreso");
  const [moneda, setMoneda] = useState(inicial?.moneda || "ARS");
  const [categoria, setCategoria] = useState(inicial?.categoria || "");
  const [buscar, setBuscar] = useState("");
  const [elegidos, setElegidos] = useState<number[]>([]);
  const categorias = CATEGORIAS.filter((c) => (c.tipo === "gasto") === (tipo === "egreso"));
  const cat = categorias.find((c) => c.valor === categoria);
  const conAutos = tipo === "egreso" && categoria === "prep_unidad";
  const nombreAuto = (v: (typeof vehiculos)[number]) =>
    `${v.marca} ${v.modelo} ${v.anio || ""}${v.dominio ? " · " + v.dominio : ""}`;
  // Al registrar, el formulario se vacía: los autos tildados también, para
  // que el próximo gasto no se cargue sin querer a los mismos.
  const fechaRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = fechaRef.current?.form;
    if (!form) return;
    const limpiar = () => { setElegidos([]); setBuscar(""); };
    form.addEventListener("reset", limpiar);
    return () => form.removeEventListener("reset", limpiar);
  }, []);
  const q = buscar.trim().toLowerCase();
  const visibles = vehiculos.filter((v) => elegidos.includes(v.id) || !q || nombreAuto(v).toLowerCase().includes(q));

  return (
    <>
      <Campo label="Fecha">
        <input ref={fechaRef} name="fecha" type="date" required className="campo"
          defaultValue={inicial?.fecha || new Date().toISOString().slice(0, 10)} />
      </Campo>
      <Campo label="Tipo">
        <select name="tipo" className="campo" value={tipo} onChange={(e) => {
          setTipo(e.target.value);
          // Una categoría de gasto no sirve para un ingreso, ni al revés.
          if (!CATEGORIAS.some((c) => c.valor === categoria && (c.tipo === "gasto") === (e.target.value === "egreso"))) setCategoria("");
        }}>
          <option value="egreso">Egreso (sale plata)</option>
          <option value="ingreso">Ingreso (entra plata)</option>
          <option value="transferencia">Transferencia interna</option>
        </select>
      </Campo>
      <Campo label={tipo === "transferencia" ? "Desde la cuenta" : "Cuenta"}>
        <select name="cuenta" required className="campo" defaultValue={inicial?.cuenta}>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </Campo>
      {tipo === "transferencia" ? (
        <Campo label="A la cuenta">
          <select name="destino" required className="campo" defaultValue={inicial?.destino || ""}>
            <option value="">Elegí la cuenta</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
      ) : (
        <Campo label="Categoría">
          <select name="categoria" className="campo" value={cat ? categoria : ""}
            onChange={(e) => setCategoria(e.target.value)}>
            <option value="">—</option>
            {categorias.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
          </select>
        </Campo>
      )}
      {cat?.ayuda && (
        <p className="sm:col-span-4 -mt-1 text-[12px] text-[var(--c-tinta-media)] leading-relaxed">{cat.ayuda}</p>
      )}
      {conAutos && (
        <div className="sm:col-span-4 rounded-xl border border-[var(--c-borde)] p-3 space-y-3">
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <Campo label="¿De qué auto?" ancho="sm:col-span-2">
              <input className="campo" placeholder="Buscar por marca, modelo o dominio" value={buscar}
                onChange={(e) => setBuscar(e.target.value)} />
            </Campo>
            <Campo label="Tipo de trabajo">
              <select name="tipo_costo" className="campo" defaultValue="Detailing">
                {TIPOS_COSTO.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Campo>
          </div>
          <div className="max-h-56 overflow-y-auto grid sm:grid-cols-2 gap-x-4 gap-y-1">
            {visibles.length === 0 && (
              <p className="text-[12.5px] text-[var(--c-tinta-tenue)] py-2">No hay autos que coincidan.</p>
            )}
            {visibles.map((v) => (
              <label key={v.id} className="flex items-center gap-2 py-1 text-[13px] text-[var(--c-tinta-clara)] cursor-pointer">
                <input type="checkbox" name="vehiculos" value={v.id} checked={elegidos.includes(v.id)}
                  onChange={(e) => setElegidos(e.target.checked ? [...elegidos, v.id] : elegidos.filter((x) => x !== v.id))}
                  className="h-4 w-4 accent-[var(--c-primario)]" />
                {nombreAuto(v)}
              </label>
            ))}
          </div>
          <p className="text-[12px] text-[var(--c-tinta-tenue)]">
            {elegidos.length > 1
              ? `El monto se divide en ${elegidos.length} partes iguales, una para el costo de cada auto.`
              : "Se suma al costo del auto. Si el trabajo fue para varios, elegilos todos y el monto se divide."}
          </p>
        </div>
      )}
      <Campo label="Descripción" ancho="sm:col-span-2">
        <input name="descripcion" required className="campo" placeholder="Qué se pagó o cobró"
          defaultValue={inicial?.descripcion} />
      </Campo>
      <Campo label="Cliente / Proveedor" ancho="sm:col-span-2">
        <input name="contraparte" className="campo" placeholder="A quién" defaultValue={inicial?.contraparte} />
      </Campo>
      <Campo label="Monto">
        <input name="monto" type="number" step="0.01" min="0.01" required className="campo" placeholder="0"
          defaultValue={inicial?.monto} />
      </Campo>
      <Campo label="Moneda">
        <select name="moneda" className="campo" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
          <option value="ARS">Pesos</option>
          <option value="USD">Dólares</option>
        </select>
      </Campo>
      {moneda === "USD" && (
        <Campo label="Cotización">
          <input name="cotizacion" type="number" step="0.01" min="0.01" required className="campo"
            defaultValue={inicial?.moneda === "USD" ? inicial.cotizacion : ""} />
        </Campo>
      )}
      <Campo label="Forma de pago">
        <input name="forma_pago" className="campo" placeholder="Efectivo, transferencia…"
          defaultValue={inicial?.forma_pago} />
      </Campo>
    </>
  );
}
