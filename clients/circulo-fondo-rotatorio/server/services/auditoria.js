// Registro de auditoría ("que sea buchón"): toda mutación deja quién, cuándo, desde qué IP, el antes,
// el después y el motivo. La tabla es append-only (la base rechaza UPDATE y DELETE) y cada registro guarda
// el hash del anterior: si alguien altera o borra una fila directo en la base, verificarCadena() lo detecta.

const { db } = require('../db');
const { canonico, sha256 } = require('../util');

const GENESIS = '0'.repeat(64);

function calcularHash(r) {
  return sha256([
    r.usuario_id ?? '', r.sede_id ?? '', r.accion, r.entidad ?? '', r.entidad_id ?? '',
    r.antes ?? '', r.despues ?? '', r.motivo ?? '', r.ip ?? '', r.creado_en, r.hash_anterior
  ].join('|'));
}

const qUltimo = db.prepare('SELECT hash FROM auditoria ORDER BY id DESC LIMIT 1');
const qInsert = db.prepare(`INSERT INTO auditoria (usuario_id, sede_id, accion, entidad, entidad_id, antes, despues, motivo, ip, creado_en, hash_anterior, hash)
  VALUES (@usuario_id, @sede_id, @accion, @entidad, @entidad_id, @antes, @despues, @motivo, @ip, @creado_en, @hash_anterior, @hash)`);

const json = (v) => (v == null ? null : typeof v === 'string' ? v : canonico(v));

// actor: { id, ip } (o null para procesos automáticos). Siempre dentro de la transacción de la operación:
// si la operación falla, el registro tampoco queda.
const auditar = db.transaction((actor, { accion, sedeId = null, entidad = null, entidadId = null, antes = null, despues = null, motivo = null }) => {
  const r = {
    usuario_id: actor?.id ?? null,
    sede_id: sedeId,
    accion,
    entidad,
    entidad_id: entidadId,
    antes: json(antes),
    despues: json(despues),
    motivo: motivo || null,
    ip: actor?.ip ?? null,
    creado_en: new Date().toISOString(),
    hash_anterior: qUltimo.get()?.hash || GENESIS
  };
  r.hash = calcularHash(r);
  qInsert.run(r);
});

function verificarCadena() {
  let anterior = GENESIS;
  let n = 0;
  let idAnterior = 0;
  for (const r of db.prepare('SELECT * FROM auditoria ORDER BY id').iterate()) {
    n++;
    if (r.hash_anterior !== anterior) {
      return { ok: false, registros: n, id: r.id, error: `El registro #${r.id} no continúa la cadena: falta o se alteró un registro anterior (último válido #${idAnterior}).` };
    }
    if (calcularHash(r) !== r.hash) {
      return { ok: false, registros: n, id: r.id, error: `El contenido del registro #${r.id} fue alterado por fuera del sistema.` };
    }
    anterior = r.hash;
    idAnterior = r.id;
  }
  return { ok: true, registros: n, ultimo_hash: anterior };
}

const ACCIONES = {
  'sesion.ingreso': 'Ingresó al sistema',
  'usuario.password': 'Cambió su contraseña',
  'usuario.alta': 'Alta de usuario', 'usuario.edicion': 'Edición de usuario', 'usuario.reset': 'Reseteo de contraseña',
  'sede.alta': 'Alta de sede', 'sede.edicion': 'Edición de sede',
  'rubro.alta': 'Alta de rubro', 'rubro.edicion': 'Edición de rubro',
  'parametro.alta': 'Nuevo valor de parámetro', 'alicuota.alta': 'Nueva alícuota', 'alicuota.edicion': 'Edición de alícuota',
  'permisos.edicion': 'Cambio en la matriz de permisos', 'config.edicion': 'Cambio de configuración',
  'central.saldo_inicial': 'Saldo inicial de la Central', 'central.ingreso': 'Ingreso a la Central',
  'fondo.asignacion': 'Asignación del fondo mensual', 'fondo.asignacion_anulada': 'Anulación de asignación',
  'fondo.extraccion': 'Extracción (banco → efectivo)', 'fondo.deposito': 'Depósito (efectivo → banco)',
  'fondo.pedido_extra': 'Pedido de fondos extra', 'fondo.extra_autorizado': 'Fondos extra autorizados', 'fondo.extra_rechazado': 'Fondos extra rechazados',
  'proveedor.alta': 'Alta de proveedor', 'proveedor.edicion': 'Edición de proveedor',
  'gasto.alta': 'Gasto registrado', 'gasto.correccion': 'Corrección de gasto', 'gasto.anulacion': 'Gasto anulado',
  'gasto.duplicado_rechazado': 'Comprobante duplicado rechazado',
  'retencion.certificado': 'Comprobante de retención emitido',
  'solicitud.alta': 'Solicitud de gasto', 'solicitud.estado': 'Cambio de estado de solicitud',
  'rendicion.cierre': 'Rendición cerrada y firmada', 'rendicion.envio': 'Rendición enviada a la Central', 'rendicion.reapertura': 'Período reabierto',
  'adjunto.alta': 'Adjunto subido',
  'respaldo.diario': 'Copia de seguridad'
};

module.exports = { auditar, verificarCadena, calcularHash, ACCIONES, GENESIS };
