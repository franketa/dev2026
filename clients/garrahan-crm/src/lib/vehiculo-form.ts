/**
 * Lectura del formulario de una unidad. La usan el alta y la edición, así un
 * campo nuevo se agrega en un solo lugar y no queda a medias en uno de los dos.
 */
export function leerVehiculo(fd: FormData, puedeCostos: boolean) {
  const txt = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const num = (k: string) => {
    const v = fd.get(k);
    return v === null || String(v).trim() === "" ? null : Number(v);
  };
  const si = (k: string) => fd.get(k) === "on" || fd.get(k) === "1";

  return {
    dominio: txt("dominio")?.toUpperCase().replace(/\s+/g, "") ?? null,
    marca: txt("marca"),
    modelo: txt("modelo"),
    version: txt("version"),
    anio: num("anio"),
    km: num("km") ?? 0,
    color: txt("color"),
    combustible: txt("combustible"),
    transmision: txt("transmision"),
    nro_motor: txt("nro_motor"),
    nro_chasis: txt("nro_chasis"),
    titular: txt("titular"),
    dni_titular: txt("dni_titular"),
    condicion: String(fd.get("condicion") || "usado"),
    tipo_adquisicion: String(fd.get("tipo_adquisicion") || "compra_directa"),
    fecha_ingreso: txt("fecha_ingreso") ?? new Date().toISOString().slice(0, 10),
    sucursal_id: num("sucursal_id"),
    // Lo que el vendedor no ve, tampoco lo puede pisar.
    inversor_id: puedeCostos ? num("inversor_id") : undefined,
    proveedor_id: puedeCostos ? num("proveedor_id") : undefined,
    valor_compra: puedeCostos ? (num("valor_compra") ?? 0) : undefined,
    moneda_compra: puedeCostos ? String(fd.get("moneda_compra") || "ARS") : undefined,
    cotizacion_compra: puedeCostos ? (num("cotizacion_compra") ?? 1) : undefined,
    precio_venta: num("precio_venta") ?? 0,
    precio_minimo: num("precio_minimo"),
    estado: String(fd.get("estado") || "disponible"),
    observaciones: txt("observaciones"),

    // ------------------------------------------------------------- la web
    publicado: si("publicado"),
    destacado: si("destacado"),
    carroceria: txt("carroceria"),
    motor: txt("motor"),
    puertas: num("puertas"),
    traccion: txt("traccion"),
    moneda_venta: String(fd.get("moneda_venta") || "ARS") === "USD" ? "USD" : "ARS",
    precio_oferta: num("precio_oferta"),
    mostrar_precio: si("mostrar_precio"),
    acepta_permuta: si("acepta_permuta"),
    acepta_financiacion: si("acepta_financiacion"),
    equipamiento: txt("equipamiento"),
    descripcion_web: txt("descripcion_web"),
  };
}

export type DatosVehiculo = ReturnType<typeof leerVehiculo>;

/** Saca las claves undefined: lo que no se mandó no se actualiza. */
export function definidos<T extends Record<string, any>>(o: T) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export const CARROCERIAS = [
  "SUV", "Pickup", "Sedán", "Hatchback", "Rural", "Monovolumen", "Utilitario",
  "Coupé", "Cabriolet", "Moto", "Otro",
];
export const TRACCIONES = ["4x2", "4x4", "AWD"];
