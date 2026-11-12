// La conexión o la transacción en curso: las dos se usan igual.
type Tx = any;

/** Lo que el formulario de una venta necesita de cada cliente para precargarlo. */
export const clientesParaVenta = (sql: Tx) => sql`
  SELECT id, nombre, apellido, dni_cuit, telefono, email, direccion, localidad
  FROM clientes ORDER BY apellido NULLS LAST, nombre LIMIT 3000`;

const soloDigitos = (s: string | null) => (s || "").replace(/\D/g, "");

/**
 * El comprador que viene en los campos cli_* del formulario (components/campos-cliente).
 * Si se eligió uno ya cargado se actualiza con lo que se completó; si no, se
 * busca por DNI antes de crearlo, para no duplicar al que ya compró o consultó.
 * Un campo que se deja vacío no borra lo que el cliente ya tenía.
 * Devuelve el id, o null si no se cargó ningún comprador.
 */
export async function guardarCliente(tx: Tx, fd: FormData): Promise<number | null> {
  const txt = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  let id = Number(fd.get("cli_id") || 0) || null;
  const d = {
    nombre: txt("cli_nombre"),
    apellido: txt("cli_apellido"),
    dni: txt("cli_dni"),
    telefono: txt("cli_telefono"),
    email: txt("cli_email"),
    direccion: txt("cli_direccion"),
    localidad: txt("cli_localidad"),
  };

  if (!id && d.dni && soloDigitos(d.dni).length >= 7) {
    const [igual] = await tx`SELECT id FROM clientes
                             WHERE regexp_replace(COALESCE(dni_cuit, ''), '[^0-9]', '', 'g') = ${soloDigitos(d.dni)}
                             ORDER BY id LIMIT 1`;
    if (igual) id = igual.id;
  }

  if (id) {
    const [c] = await tx`
      UPDATE clientes SET
        nombre    = COALESCE(${d.nombre}, nombre),
        apellido  = COALESCE(${d.apellido}, apellido),
        dni_cuit  = COALESCE(${d.dni}, dni_cuit),
        telefono  = COALESCE(${d.telefono}, telefono),
        email     = COALESCE(${d.email}, email),
        direccion = COALESCE(${d.direccion}, direccion),
        localidad = COALESCE(${d.localidad}, localidad)
      WHERE id = ${id} RETURNING id`;
    if (c) return Number(c.id);
  }

  if (!d.nombre && !d.apellido) return null;
  const [nuevo] = await tx`
    INSERT INTO clientes (nombre, apellido, dni_cuit, telefono, email, direccion, localidad)
    VALUES (${d.nombre || d.apellido}, ${d.nombre ? d.apellido : null}, ${d.dni}, ${d.telefono},
            ${d.email}, ${d.direccion}, ${d.localidad})
    RETURNING id`;
  return Number(nuevo.id);
}
