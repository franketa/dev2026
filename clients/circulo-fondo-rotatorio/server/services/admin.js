// Administración: sedes, usuarios, rubros, parámetros con vigencia, alícuotas, matriz de permisos y
// configuración. Todo queda en la auditoría con el antes y el después.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, getConfig, sedeCentral } = require('../db');
const { auditar } = require('./auditoria');
const acceso = require('./acceso');
const { ROLES, PERMISOS, INTOCABLES } = require('../permisos');
const { ErrorNegocio, limpiarTexto, normalizarEmail, esFecha, validarCuit, centavos } = require('../util');

const tx = (fn) => db.transaction(fn);

// ── Sedes ───────────────────────────────────────────────────────────────────
function listarSedes({ todas = false } = {}) {
  return db.prepare(`SELECT * FROM sedes ${todas ? '' : 'WHERE activa = 1'} ORDER BY es_central DESC, orden, nombre`).all();
}

const guardarSede = tx((actor, id, datos) => {
  acceso.exigir(actor, 'admin.sedes');
  const nombre = limpiarTexto(datos.nombre, 80);
  const codigo = limpiarTexto(datos.codigo, 10)?.toUpperCase();
  if (!nombre || !codigo) throw new ErrorNegocio('Completá el nombre y el código de la sede');
  const fila = { nombre, codigo, descripcion: limpiarTexto(datos.descripcion, 200), orden: Number(datos.orden) || 0, activa: datos.activa === false ? 0 : 1 };
  try {
    if (id) {
      const antes = db.prepare('SELECT * FROM sedes WHERE id = ?').get(id);
      if (!antes) throw new ErrorNegocio('Sede inexistente', 404);
      if (antes.es_central && !fila.activa) throw new ErrorNegocio('La Sede Central no se puede dar de baja');
      db.prepare('UPDATE sedes SET nombre=@nombre, codigo=@codigo, descripcion=@descripcion, orden=@orden, activa=@activa WHERE id=@id').run({ ...fila, id });
      auditar(actor, { accion: 'sede.edicion', sedeId: id, entidad: 'sede', entidadId: id, antes, despues: fila });
      return id;
    }
    const nuevo = Number(db.prepare('INSERT INTO sedes (nombre, codigo, descripcion, orden, activa) VALUES (@nombre, @codigo, @descripcion, @orden, @activa)').run(fila).lastInsertRowid);
    auditar(actor, { accion: 'sede.alta', sedeId: nuevo, entidad: 'sede', entidadId: nuevo, despues: fila });
    return nuevo;
  } catch (e) {
    if (/UNIQUE/.test(e.message)) throw new ErrorNegocio('Ya hay una sede con ese nombre o código');
    throw e;
  }
});

// ── Usuarios ────────────────────────────────────────────────────────────────
const COLS_USUARIO = 'u.id, u.nombre, u.apellido, u.email, u.telefono, u.rol, u.sede_id, u.activo, u.debe_cambiar_password, u.ultimo_acceso, u.creado_en, s.nombre AS sede_nombre';

function listarUsuarios() {
  return db.prepare(`SELECT ${COLS_USUARIO} FROM usuarios u LEFT JOIN sedes s ON s.id = u.sede_id ORDER BY s.es_central DESC, s.orden, u.apellido, u.nombre`).all();
}

function validarRolSede(rol, sedeId) {
  if (!ROLES[rol]) throw new ErrorNegocio('Rol inválido');
  const ambito = ROLES[rol].ambito;
  if (ambito === 'sistema') return null;
  if (ambito === 'central') return sedeCentral().id;
  const s = db.prepare('SELECT * FROM sedes WHERE id = ?').get(Number(sedeId));
  if (!s || s.es_central) throw new ErrorNegocio('Elegí la sede a la que pertenece el usuario');
  return s.id;
}

const passwordTemporal = () => crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x');

const guardarUsuario = tx((actor, id, datos) => {
  acceso.exigir(actor, 'admin.usuarios');
  const nombre = limpiarTexto(datos.nombre, 60);
  const apellido = limpiarTexto(datos.apellido, 60) || '';
  const email = normalizarEmail(datos.email);
  if (!nombre) throw new ErrorNegocio('Completá el nombre');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ErrorNegocio('El email no es válido');
  const sede_id = validarRolSede(datos.rol, datos.sede_id);
  const fila = { nombre, apellido, email, telefono: limpiarTexto(datos.telefono, 30), rol: datos.rol, sede_id, activo: datos.activo === false ? 0 : 1 };
  try {
    if (id) {
      const antes = db.prepare('SELECT id, nombre, apellido, email, telefono, rol, sede_id, activo FROM usuarios WHERE id = ?').get(id);
      if (!antes) throw new ErrorNegocio('Usuario inexistente', 404);
      if (id === actor.id && (fila.rol !== antes.rol || !fila.activo)) throw new ErrorNegocio('No podés cambiarte el rol ni darte de baja a vos mismo');
      // Cambiar rol, sede o darlo de baja cierra sus sesiones abiertas.
      const cierra = fila.rol !== antes.rol || fila.sede_id !== antes.sede_id || !fila.activo;
      db.prepare(`UPDATE usuarios SET nombre=@nombre, apellido=@apellido, email=@email, telefono=@telefono, rol=@rol, sede_id=@sede_id, activo=@activo
        ${cierra ? ', token_version = token_version + 1' : ''} WHERE id=@id`).run({ ...fila, id });
      auditar(actor, { accion: 'usuario.edicion', sedeId: sede_id, entidad: 'usuario', entidadId: id, antes, despues: fila, motivo: limpiarTexto(datos.motivo, 200) });
      return { id };
    }
    const temporal = limpiarTexto(datos.password, 100) || passwordTemporal();
    if (temporal.length < 8) throw new ErrorNegocio('La contraseña temporal tiene que tener al menos 8 caracteres');
    const nuevo = Number(db.prepare(`INSERT INTO usuarios (nombre, apellido, email, telefono, rol, sede_id, activo, password_hash, debe_cambiar_password)
      VALUES (@nombre, @apellido, @email, @telefono, @rol, @sede_id, @activo, @hash, 1)`).run({ ...fila, hash: bcrypt.hashSync(temporal, 10) }).lastInsertRowid);
    auditar(actor, { accion: 'usuario.alta', sedeId: sede_id, entidad: 'usuario', entidadId: nuevo, despues: fila });
    return { id: nuevo, password_temporal: temporal };
  } catch (e) {
    if (/UNIQUE/.test(e.message)) throw new ErrorNegocio('Ya hay un usuario con ese email');
    throw e;
  }
});

const resetearPassword = tx((actor, id) => {
  acceso.exigir(actor, 'admin.usuarios');
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!u) throw new ErrorNegocio('Usuario inexistente', 404);
  const temporal = passwordTemporal();
  db.prepare('UPDATE usuarios SET password_hash = ?, debe_cambiar_password = 1, token_version = token_version + 1 WHERE id = ?').run(bcrypt.hashSync(temporal, 10), id);
  auditar(actor, { accion: 'usuario.reset', sedeId: u.sede_id, entidad: 'usuario', entidadId: id });
  return { password_temporal: temporal };
});

// ── Rubros ──────────────────────────────────────────────────────────────────
function listarRubros({ todos = false } = {}) {
  const filas = db.prepare(`SELECT r.*, p.nombre AS padre_nombre, p.es_fijo AS padre_fijo,
      (SELECT COUNT(*) FROM rubros h WHERE h.padre_id = r.id AND h.activo = 1) AS hijos
    FROM rubros r LEFT JOIN rubros p ON p.id = r.padre_id
    ${todos ? '' : 'WHERE r.activo = 1 AND (p.id IS NULL OR p.activo = 1)'}
    ORDER BY COALESCE(p.orden, r.orden), COALESCE(p.id, r.id), r.padre_id IS NOT NULL, r.orden, r.nombre`).all();
  return filas.map(r => ({
    ...r,
    fijo: !!(r.es_fijo || r.padre_fijo),
    nombre_completo: r.padre_nombre ? `${r.padre_nombre} › ${r.nombre}` : r.nombre,
    imputable: r.hijos === 0
  }));
}

function rubroImputable(id) {
  const r = listarRubros().find(x => x.id === Number(id));
  if (!r) throw new ErrorNegocio('Elegí el rubro del gasto');
  if (!r.imputable) throw new ErrorNegocio(`"${r.nombre}" tiene subrubros: elegí uno de ellos`);
  return r;
}

const guardarRubro = tx((actor, id, datos) => {
  acceso.exigir(actor, 'admin.rubros');
  const nombre = limpiarTexto(datos.nombre, 80);
  if (!nombre) throw new ErrorNegocio('Completá el nombre del rubro');
  const padre_id = datos.padre_id ? Number(datos.padre_id) : null;
  if (padre_id) {
    const p = db.prepare('SELECT * FROM rubros WHERE id = ?').get(padre_id);
    if (!p || p.padre_id) throw new ErrorNegocio('El rubro padre tiene que ser un rubro principal (hay dos niveles: rubro y subrubro)');
    if (p.es_nd) throw new ErrorNegocio('N/D no lleva subrubros');
  }
  const fila = { padre_id, nombre, es_fijo: datos.es_fijo ? 1 : 0, activo: datos.activo === false ? 0 : 1, orden: Number(datos.orden) || 0 };
  try {
    if (id) {
      const antes = db.prepare('SELECT * FROM rubros WHERE id = ?').get(id);
      if (!antes) throw new ErrorNegocio('Rubro inexistente', 404);
      if (antes.es_nd && (!fila.activo || fila.padre_id)) throw new ErrorNegocio('El rubro N/D tiene que existir siempre');
      if (padre_id === id) throw new ErrorNegocio('Un rubro no puede ser subrubro de sí mismo');
      if (padre_id && db.prepare('SELECT 1 FROM rubros WHERE padre_id = ?').get(id)) throw new ErrorNegocio('Este rubro tiene subrubros: no puede pasar a ser subrubro');
      db.prepare('UPDATE rubros SET padre_id=@padre_id, nombre=@nombre, es_fijo=@es_fijo, activo=@activo, orden=@orden WHERE id=@id').run({ ...fila, id });
      auditar(actor, { accion: 'rubro.edicion', entidad: 'rubro', entidadId: id, antes, despues: fila });
      return id;
    }
    const nuevo = Number(db.prepare('INSERT INTO rubros (padre_id, nombre, es_fijo, activo, orden) VALUES (@padre_id, @nombre, @es_fijo, @activo, @orden)').run(fila).lastInsertRowid);
    auditar(actor, { accion: 'rubro.alta', entidad: 'rubro', entidadId: nuevo, despues: fila });
    return nuevo;
  } catch (e) {
    if (/UNIQUE/.test(e.message)) throw new ErrorNegocio('Ya hay un rubro con ese nombre en el mismo nivel');
    throw e;
  }
});

// ── Parámetros con vigencia ─────────────────────────────────────────────────
const PARAMETROS = {
  tope_transferencia: { nombre: 'Tope de caja chica por transferencia', unidad: 'pesos' },
  tope_efectivo: { nombre: 'Tope de caja chica en efectivo', unidad: 'pesos' },
  umbral_retencion: { nombre: 'Umbral de retención (desde este monto se muestran las retenciones)', unidad: 'pesos' },
  umbral_nd_pct: { nombre: 'Alerta de gastos N/D (% de lo gastado)', unidad: 'porcentaje' }
};

function listarParametros() {
  return db.prepare(`SELECT p.*, u.nombre || ' ' || u.apellido AS creado_por_nombre FROM parametros p LEFT JOIN usuarios u ON u.id = p.creado_por
    ORDER BY p.clave, p.vigente_desde DESC, p.id DESC`).all();
}

const agregarParametro = tx((actor, datos) => {
  acceso.exigir(actor, 'admin.parametros');
  const def = PARAMETROS[datos.clave];
  if (!def) throw new ErrorNegocio('Parámetro inexistente');
  const valor = def.unidad === 'pesos' ? centavos(datos.valor, { cero: true }) : Number(datos.valor);
  if (valor == null || !Number.isInteger(valor) || valor < 0 || (def.unidad === 'porcentaje' && valor > 100)) throw new ErrorNegocio('El valor no es válido');
  if (!esFecha(datos.vigente_desde)) throw new ErrorNegocio('Indicá desde qué fecha rige');
  const fila = { clave: datos.clave, valor, vigente_desde: datos.vigente_desde, nota: limpiarTexto(datos.nota, 200), creado_por: actor.id };
  const id = Number(db.prepare('INSERT INTO parametros (clave, valor, vigente_desde, nota, creado_por) VALUES (@clave, @valor, @vigente_desde, @nota, @creado_por)').run(fila).lastInsertRowid);
  auditar(actor, { accion: 'parametro.alta', entidad: 'parametro', entidadId: id, despues: fila });
  return id;
});

// ── Alícuotas (a validar con el contador) ───────────────────────────────────
const IMPUESTOS = { iva: 'IVA', ganancias: 'Ganancias', suss: 'SUSS', iibb: 'Ingresos Brutos' };

function listarAlicuotas({ vigentesAl = null, todas = false } = {}) {
  const filas = db.prepare(`SELECT * FROM alicuotas ${todas ? '' : 'WHERE activa = 1'} ORDER BY impuesto, regimen, jurisdiccion, vigente_desde DESC, id DESC`).all();
  if (!vigentesAl) return filas;
  // Por impuesto + régimen + jurisdicción, la última vigente a esa fecha.
  const vistas = new Set();
  return filas.filter(a => {
    if (a.vigente_desde > vigentesAl) return false;
    const k = `${a.impuesto}|${a.regimen}|${a.jurisdiccion || ''}`;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

const guardarAlicuota = tx((actor, id, datos) => {
  acceso.exigir(actor, 'admin.parametros');
  if (id) {
    // Una alícuota cargada no se edita (ya se usó en certificados): se da de baja y se carga otra.
    const antes = db.prepare('SELECT * FROM alicuotas WHERE id = ?').get(id);
    if (!antes) throw new ErrorNegocio('Alícuota inexistente', 404);
    const activa = datos.activa ? 1 : 0;
    db.prepare('UPDATE alicuotas SET activa = ? WHERE id = ?').run(activa, id);
    auditar(actor, { accion: 'alicuota.edicion', entidad: 'alicuota', entidadId: id, antes: { activa: antes.activa }, despues: { activa } });
    return id;
  }
  if (!IMPUESTOS[datos.impuesto]) throw new ErrorNegocio('Elegí el impuesto');
  const regimen = limpiarTexto(datos.regimen, 120);
  if (!regimen) throw new ErrorNegocio('Indicá el régimen');
  const alicuota = Number(datos.alicuota);
  if (!Number.isInteger(alicuota) || alicuota < 0 || alicuota > 100000) throw new ErrorNegocio('La alícuota no es válida');
  if (!esFecha(datos.vigente_desde)) throw new ErrorNegocio('Indicá desde qué fecha rige');
  const jurisdiccion = datos.impuesto === 'iibb' ? limpiarTexto(datos.jurisdiccion, 60) : null;
  if (datos.impuesto === 'iibb' && !jurisdiccion) throw new ErrorNegocio('Ingresos Brutos lleva jurisdicción');
  const fila = { impuesto: datos.impuesto, regimen, jurisdiccion, alicuota, vigente_desde: datos.vigente_desde, nota: limpiarTexto(datos.nota, 200), creado_por: actor.id };
  const nuevo = Number(db.prepare(`INSERT INTO alicuotas (impuesto, regimen, jurisdiccion, alicuota, vigente_desde, nota, creado_por)
    VALUES (@impuesto, @regimen, @jurisdiccion, @alicuota, @vigente_desde, @nota, @creado_por)`).run(fila).lastInsertRowid);
  auditar(actor, { accion: 'alicuota.alta', entidad: 'alicuota', entidadId: nuevo, despues: fila });
  return nuevo;
});

// ── Permisos ────────────────────────────────────────────────────────────────
function matrizPermisos() {
  return {
    roles: Object.entries(ROLES).map(([id, r]) => ({ id, ...r, permisos: acceso.permisosDe(id) })),
    permisos: Object.entries(PERMISOS).map(([id, nombre]) => ({ id, nombre }))
  };
}

const cambiarPermiso = tx((actor, rol, permiso, habilitado) => {
  acceso.exigir(actor, 'admin.permisos');
  if (!ROLES[rol] || !PERMISOS[permiso]) throw new ErrorNegocio('Rol o permiso inexistente');
  if (!habilitado && INTOCABLES[rol]?.includes(permiso)) throw new ErrorNegocio('Ese permiso no se puede quitar: el sistema quedaría sin administración');
  const antes = acceso.permisosDe(rol).includes(permiso);
  if (antes === !!habilitado) return;
  if (habilitado) db.prepare('INSERT INTO roles_permisos (rol, permiso) VALUES (?, ?)').run(rol, permiso);
  else db.prepare('DELETE FROM roles_permisos WHERE rol = ? AND permiso = ?').run(rol, permiso);
  acceso.invalidar();
  auditar(actor, { accion: 'permisos.edicion', entidad: 'rol', antes: { rol, permiso, habilitado: antes }, despues: { rol, permiso, habilitado: !!habilitado } });
});

// ── Configuración del Círculo y flags ───────────────────────────────────────
const CLAVES_CONFIG = {
  circulo_razon_social: 'admin.parametros', circulo_cuit: 'admin.parametros', circulo_domicilio: 'admin.parametros',
  flag_adjuntos: 'admin.permisos', flag_cierre_anticipado: 'admin.permisos'
};

const guardarConfig = tx((actor, datos) => {
  const antes = getConfig();
  const cambios = {};
  for (const [clave, valor] of Object.entries(datos || {})) {
    const permiso = CLAVES_CONFIG[clave];
    if (!permiso) continue;
    acceso.exigir(actor, permiso);
    let v = clave.startsWith('flag_') ? (valor ? '1' : '0') : (limpiarTexto(valor, 200) || '');
    if (clave === 'circulo_cuit' && v) {
      const c = validarCuit(v);
      if (!c) throw new ErrorNegocio('El CUIT del Círculo no es válido');
      v = c;
    }
    if (antes[clave] !== v) cambios[clave] = v;
  }
  const ins = db.prepare('INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor');
  for (const [k, v] of Object.entries(cambios)) ins.run(k, v);
  if (Object.keys(cambios).length) {
    auditar(actor, { accion: 'config.edicion', entidad: 'config', antes: Object.fromEntries(Object.keys(cambios).map(k => [k, antes[k]])), despues: cambios });
  }
  return getConfig();
});

module.exports = {
  listarSedes, guardarSede, listarUsuarios, guardarUsuario, resetearPassword,
  listarRubros, rubroImputable, guardarRubro, PARAMETROS, listarParametros, agregarParametro,
  IMPUESTOS, listarAlicuotas, guardarAlicuota, matrizPermisos, cambiarPermiso, guardarConfig
};
