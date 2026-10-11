// Adjuntos opcionales (foto del comprobante, presupuesto de una solicitud). Nunca bloquean la carga: el gasto
// se guarda primero y la foto sube después. El navegador ya la achica (máx. 1600 px, JPEG 0,7).
//
// Driver por variable de entorno: ADJUNTOS_DRIVER=local (volumen de datos, por defecto) o s3 (MinIO u otro
// S3-compatible: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_REGION). Todo detrás del flag `adjuntos`.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, DATA_DIR, flag } = require('../db');
const acceso = require('./acceso');
const { auditar } = require('./auditoria');
const { ErrorNegocio, limpiarTexto } = require('../util');

const TIPOS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const MAX_BYTES = 6 * 1024 * 1024;
const DRIVER = process.env.ADJUNTOS_DRIVER === 's3' ? 's3' : 'local';
const DIR = path.join(DATA_DIR, 'adjuntos');

let s3 = null;
function clienteS3() {
  if (s3) return s3;
  let sdk;
  try { sdk = require('@aws-sdk/client-s3'); } catch { throw new Error('Falta @aws-sdk/client-s3 para ADJUNTOS_DRIVER=s3'); }
  s3 = {
    sdk,
    cliente: new sdk.S3Client({
      endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION || 'us-east-1', forcePathStyle: true,
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY }
    }),
    bucket: process.env.S3_BUCKET || 'fondo-rotatorio'
  };
  return s3;
}

async function guardarArchivo(clave, buffer, mime) {
  if (DRIVER === 's3') {
    const { sdk, cliente, bucket } = clienteS3();
    const subir = () => cliente.send(new sdk.PutObjectCommand({ Bucket: bucket, Key: clave, Body: buffer, ContentType: mime }));
    try {
      await subir();
    } catch (e) {
      // MinIO recién instalado: el bucket todavía no existe.
      if (e.name !== 'NoSuchBucket') throw e;
      await cliente.send(new sdk.CreateBucketCommand({ Bucket: bucket }));
      await subir();
    }
    return;
  }
  const destino = path.join(DIR, clave);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, buffer);
}

async function leerArchivo(clave) {
  if (DRIVER === 's3') {
    const { sdk, cliente, bucket } = clienteS3();
    const r = await cliente.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: clave }));
    return Buffer.from(await r.Body.transformToByteArray());
  }
  return fs.readFileSync(path.join(DIR, clave));
}

function entidadDe(entidad, id) {
  if (entidad === 'gasto') return db.prepare('SELECT id, sede_id, adjunto_estado FROM gastos WHERE id = ?').get(Number(id));
  if (entidad === 'solicitud') return db.prepare('SELECT id, sede_id FROM solicitudes WHERE id = ?').get(Number(id));
  return null;
}

function exigirPuedeAdjuntar(actor, entidad, e) {
  acceso.exigirSede(actor, e.sede_id);
  const permisos = entidad === 'gasto' ? ['gastos.cargar', 'gastos.pago_central', 'gastos.corregir'] : ['solicitudes.crear', 'solicitudes.resolver'];
  if (!permisos.some(p => acceso.puede(actor, p))) throw new ErrorNegocio('Tu usuario no puede adjuntar archivos acá', 403);
}

async function subir(actor, entidad, id, { buffer, mime, nombre }) {
  if (!flag('adjuntos')) throw new ErrorNegocio('Los adjuntos están desactivados', 409);
  const e = entidadDe(entidad, id);
  if (!e) throw new ErrorNegocio('No existe a qué adjuntarlo', 404);
  exigirPuedeAdjuntar(actor, entidad, e);
  if (!TIPOS[mime]) throw new ErrorNegocio('Adjuntá una foto o un PDF');
  if (!buffer?.length) throw new ErrorNegocio('El archivo llegó vacío');
  if (buffer.length > MAX_BYTES) throw new ErrorNegocio('El archivo es muy pesado (máximo 6 MB)');
  const sha = crypto.createHash('sha256').update(buffer).digest('hex');
  const repetido = db.prepare('SELECT id FROM adjuntos WHERE entidad = ? AND entidad_id = ? AND sha256 = ? AND activo = 1').get(entidad, e.id, sha);
  if (repetido) return { id: repetido.id, repetido: true };
  const clave = `${entidad}/${new Date().toISOString().slice(0, 7)}/${e.id}-${sha.slice(0, 16)}.${TIPOS[mime]}`;
  await guardarArchivo(clave, buffer, mime);
  const nuevo = db.transaction(() => {
    const adjId = Number(db.prepare(`INSERT INTO adjuntos (entidad, entidad_id, nombre, mime, bytes, sha256, clave, subido_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(entidad, e.id, limpiarTexto(nombre, 120) || `adjunto.${TIPOS[mime]}`, mime, buffer.length, sha, clave, actor.id).lastInsertRowid);
    if (entidad === 'gasto') db.prepare(`UPDATE gastos SET adjunto_estado = 'subido' WHERE id = ?`).run(e.id);
    auditar(actor, { accion: 'adjunto.alta', sedeId: e.sede_id, entidad, entidadId: e.id, despues: { adjunto_id: adjId, bytes: buffer.length, sha256: sha } });
    return adjId;
  })();
  return { id: nuevo };
}

async function descargar(actor, id) {
  const a = db.prepare('SELECT * FROM adjuntos WHERE id = ? AND activo = 1').get(Number(id));
  if (!a) throw new ErrorNegocio('Adjunto inexistente', 404);
  const e = entidadDe(a.entidad, a.entidad_id);
  acceso.exigirSede(actor, e.sede_id);
  return { adjunto: a, buffer: await leerArchivo(a.clave) };
}

module.exports = { TIPOS, MAX_BYTES, DRIVER, subir, descargar };
