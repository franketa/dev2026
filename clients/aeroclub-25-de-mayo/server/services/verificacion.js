// Verificación del email: se manda un link de un solo uso y, al abrirlo, el email queda verificado.
// Se guarda sólo el hash del token. Si tesorería le cambia el email a alguien, vuelve a quedar sin verificar.
const crypto = require('crypto');
const { db, auditar, getConfig } = require('../db');
const mail = require('./mail');
const { ErrorNegocio, nombreCompleto } = require('../util');

const HORAS_VALIDEZ = 48;
const MINUTOS_ENTRE_ENVIOS = 2;

const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

// Dirección pública del sistema para armar el link (la de Ajustes, o la del pedido actual).
const base = (req) => (getConfig().url_publica || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

async function pedir(usuarioId, req, actor) {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(usuarioId);
  if (!u || u.rol === 'externo' || !u.email) throw new ErrorNegocio('Ese usuario no tiene email para verificar', 404);
  if (!u.activo) throw new ErrorNegocio(`${nombreCompleto(u)} está dado de baja`);
  if (u.email_verificado_en) throw new ErrorNegocio('Ese email ya está verificado');
  const ultimo = db.prepare(`SELECT (julianday('now') - julianday(?)) * 1440 minutos`).get(u.verif_enviado_en || '1970-01-01').minutos;
  if (ultimo < MINUTOS_ENTRE_ENVIOS) throw new ErrorNegocio('Ya mandamos un mail hace un momento. Revisá la bandeja de entrada (y el spam) o probá en un par de minutos.', 429);

  const token = crypto.randomBytes(24).toString('base64url');
  const link = `${base(req)}/verificar-email/${token}`;
  await mail.enviar({
    para: u.email,
    asunto: 'Confirmá tu email',
    html: mail.plantilla({
      titulo: 'Confirmá tu email',
      parrafos: [
        `Hola ${mail.escapar(u.nombre)}:`,
        `Para confirmar que <b>${mail.escapar(u.email)}</b> es tu email en el sistema del aeroclub, tocá el botón. El link vale por ${HORAS_VALIDEZ} horas.`
      ],
      boton: { texto: 'Confirmar mi email', url: link },
      pie: 'Si no pediste esto, ignorá el mail.'
    }),
    texto: `Hola ${u.nombre}:\n\nPara confirmar que ${u.email} es tu email en el sistema del aeroclub, abrí este link (vale por ${HORAS_VALIDEZ} horas):\n${link}\n\nSi no pediste esto, ignorá el mail.`
  });
  // Se guarda recién cuando el mail salió: si falla, el link anterior sigue valiendo.
  db.prepare(`UPDATE usuarios SET verif_token_hash = ?, verif_enviado_en = datetime('now') WHERE id = ?`).run(hash(token), u.id);
  auditar(actor.id, 'usuario.verificacion_pedida', actor.id === u.id ? `Pidió verificar su email ${u.email}` : `Mandó la verificación de email a ${nombreCompleto(u)} (${u.email})`);
  return { email: u.email };
}

// Devuelve el usuario verificado, o null si el link no sirve (vencido, usado o inexistente).
function confirmar(token) {
  const u = db.prepare(`
    SELECT * FROM usuarios WHERE verif_token_hash = ? AND activo = 1
      AND julianday(verif_enviado_en) > julianday('now', ?)`).get(hash(token), `-${HORAS_VALIDEZ} hours`);
  if (!u) return null;
  db.prepare(`UPDATE usuarios SET email_verificado_en = datetime('now'), verif_token_hash = NULL WHERE id = ?`).run(u.id);
  auditar(u.id, 'usuario.email_verificado', `Verificó su email ${u.email}`);
  return u;
}

module.exports = { pedir, confirmar, HORAS_VALIDEZ };
