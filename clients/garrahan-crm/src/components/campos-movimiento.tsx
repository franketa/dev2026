"use client";

import { useState } from "react";
import { CATEGORIAS } from "@/lib/constantes";
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
export default function CamposMovimiento({ cuentas, inicial }: {
  cuentas: { id: number; nombre: string }[];
  inicial?: InicialMovimiento;
}) {
  const [tipo, setTipo] = useState(inicial?.tipo || "egreso");
  const [moneda, setMoneda] = useState(inicial?.moneda || "ARS");
  const categorias = CATEGORIAS.filter((c) => (c.tipo === "gasto") === (tipo === "egreso"));
  const inicialCat = categorias.some((c) => c.valor === inicial?.categoria) ? inicial?.categoria : "";

  return (
    <>
      <Campo label="Fecha">
        <input name="fecha" type="date" required className="campo"
          defaultValue={inicial?.fecha || new Date().toISOString().slice(0, 10)} />
      </Campo>
      <Campo label="Tipo">
        <select name="tipo" className="campo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
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
        // La key hace que la lista arranque de nuevo al cambiar el tipo.
        <Campo label="Categoría">
          <select key={tipo} name="categoria" className="campo" defaultValue={inicialCat}>
            <option value="">—</option>
            {categorias.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
          </select>
        </Campo>
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
