// Base única de proveedores del Círculo, compartida por todas las sedes. El CUIT es la identidad:
// si ya existe, se reutiliza (Starlink, Telecom o Camuzzi se cargan una sola vez).

const { db } = require('../db');
const acceso = require('./acceso');
const { auditar } = require('./auditoria');
const { ErrorNegocio, validarCuit, soloDigitos, normalizarRazon, distancia, limpiarTexto, normalizarEmail } = require('../util');

const CONDICIONES = { ri: 'Responsable inscripto', monotributo: 'Monotributo', exento: 'Exento', no_alcanzado: 'No alcanzado' };

function porId(id) { return db.prepare('SELECT * FROM proveedores WHERE id = ?').get(Number(id)); }
function porCuit(cuit) { return db.prepare('SELECT * FROM proveedores WHERE cuit = ?').get(cuit); }

function buscar(q, limite = 20) {
  const texto = String(q ?? '').trim();
  if (!texto) return db.prepare('SELECT * FROM proveedores WHERE activo = 1 ORDER BY razon_social LIMIT ?').all(limite);
  const digitos = soloDigitos(texto);
  if (digitos.length >= 3 && digitos.length === texto.replace(/[\s-]/g, '').length) {
    return db.prepare('SELECT * FROM proveedores WHERE cuit LIKE ? ORDER BY razon_social LIMIT ?').all(`%${digitos}%`, limite);
  }
  const norm = normalizarRazon(texto);
  if (!norm) return [];
  return db.prepare(`SELECT * FROM proveedores WHERE razon_norm LIKE ? OR razon_social LIKE ? ORDER BY activo DESC, razon_social LIMIT ?`)
    .all(`%${norm}%`, `%${texto}%`, limite);
}

// Razones sociales parecidas (para avisar "¿no será este?" antes de crear un duplicado mal escrito).
function similares(razonSocial, excluirId = null) {
  const norm = normalizarRazon(razonSocial);
  if (norm.length < 3) return [];
  const tope = norm.length <= 6 ? 1 : norm.length <= 12 ? 2 : 3;
  return db.prepare('SELECT * FROM proveedores').all().filter(p => {
    if (p.id === excluirId) return false;
    const otro = p.razon_norm;
    if (!otro) return false;
    if (otro === norm || otro.includes(norm) || norm.includes(otro)) return true;
    // Compara también palabra por palabra contra el comienzo ("telecom" vs "telecom argentina").
    return distancia(otro, norm) <= tope || distancia(otro.slice(0, norm.length), norm) <= Math.min(tope, 1);
  }).slice(0, 5);
}

function validarDatos(datos) {
  const razon_social = limpiarTexto(datos.razon_social, 120);
  if (!razon_social) throw new ErrorNegocio('Completá la razón social');
  if (datos.condicion_iva && !CONDICIONES[datos.condicion_iva]) throw new ErrorNegocio('Condición frente al IVA inválida');
  const email = datos.email ? normalizarEmail(datos.email) : null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ErrorNegocio('El email no es válido');
  const cbu = datos.cbu ? soloDigitos(datos.cbu) : null;
  if (cbu && cbu.length !== 22) throw new ErrorNegocio('El CBU tiene 22 dígitos');
  return {
    razon_social, razon_norm: normalizarRazon(razon_social), condicion_iva: datos.condicion_iva || null,
    domicilio: limpiarTexto(datos.domicilio, 200), email, telefono: limpiarTexto(datos.telefono, 40), cbu
  };
}

// Devuelve { proveedor, existente }. Si el CUIT ya está, no se crea otro: se devuelve el que hay.
const alta = db.transaction((actor, datos) => {
  acceso.exigir(actor, 'proveedores.alta', 'Tu usuario no puede dar de alta proveedores. Pedíselo al administrativo de la sede.');
  const cuit = validarCuit(datos.cuit);
  if (!cuit) throw new ErrorNegocio('El CUIT no es válido: revisá los 11 números (el último es el dígito verificador)', 400, 'CUIT_INVALIDO');
  const existente = porCuit(cuit);
  if (existente) return { proveedor: existente, existente: true };
  const fila = validarDatos(datos);
  if (!datos.confirmar_similar) {
    const parecidos = similares(fila.razon_social);
    if (parecidos.length) {
      throw new ErrorNegocio('Hay proveedores con un nombre parecido. ¿No es alguno de estos?', 409, 'SIMILARES', { similares: parecidos });
    }
  }
  const id = Number(db.prepare(`INSERT INTO proveedores (cuit, razon_social, razon_norm, condicion_iva, domicilio, email, telefono, cbu, creado_por, creado_sede_id)
    VALUES (@cuit, @razon_social, @razon_norm, @condicion_iva, @domicilio, @email, @telefono, @cbu, @creado_por, @creado_sede_id)`)
    .run({ ...fila, cuit, creado_por: actor.id, creado_sede_id: actor.sede_id ?? null }).lastInsertRowid);
  auditar(actor, { accion: 'proveedor.alta', sedeId: actor.sede_id ?? null, entidad: 'proveedor', entidadId: id, despues: { cuit, ...fila } });
  return { proveedor: porId(id), existente: false };
});

// El CUIT no se edita (es la identidad); el resto sí, con motivo y auditoría.
const editar = db.transaction((actor, id, datos) => {
  acceso.exigir(actor, 'proveedores.alta');
  const antes = porId(id);
  if (!antes) throw new ErrorNegocio('Proveedor inexistente', 404);
  const fila = validarDatos({ ...antes, ...datos });
  const activo = datos.activo === undefined ? antes.activo : (datos.activo ? 1 : 0);
  db.prepare(`UPDATE proveedores SET razon_social=@razon_social, razon_norm=@razon_norm, condicion_iva=@condicion_iva, domicilio=@domicilio,
    email=@email, telefono=@telefono, cbu=@cbu, activo=@activo WHERE id=@id`).run({ ...fila, activo, id });
  auditar(actor, { accion: 'proveedor.edicion', entidad: 'proveedor', entidadId: id, antes, despues: { ...fila, activo }, motivo: limpiarTexto(datos.motivo, 200) });
  return porId(id);
});

function listar() {
  return db.prepare(`SELECT p.*, s.nombre AS creado_sede_nombre,
      (SELECT COUNT(*) FROM gastos g WHERE g.proveedor_id = p.id AND g.estado = 'registrado') AS gastos
    FROM proveedores p LEFT JOIN sedes s ON s.id = p.creado_sede_id ORDER BY p.razon_social`).all();
}

module.exports = { CONDICIONES, porId, porCuit, buscar, similares, alta, editar, listar };
