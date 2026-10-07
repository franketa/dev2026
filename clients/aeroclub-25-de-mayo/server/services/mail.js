// Envío de mails con Resend (https://resend.com). La API key va en RESEND_API_KEY; sin ella el
// sistema funciona igual, pero las funciones que mandan mails avisan que no está configurado.
const { getConfig } = require('../db');
const { ErrorNegocio } = require('../util');

const REMITENTE = process.env.MAIL_FROM || 'Aeroclub 25 de Mayo <no-responder@aeroclub25demayo.com.ar>';

const configurado = () => !!process.env.RESEND_API_KEY;

const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Plantilla común: encabezado con el nombre del club, párrafos y, si hay, un botón.
function plantilla({ titulo, parrafos, boton = null, pie = null }) {
  const club = escapar(getConfig().club_nombre || 'Aeroclub 25 de Mayo');
  const ps = parrafos.map(p => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1d2a44">${p}</p>`).join('');
  const btn = boton
    ? `<p style="margin:22px 0"><a href="${escapar(boton.url)}" style="display:inline-block;background:#d43a2f;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">${escapar(boton.texto)}</a></p>
       <p style="margin:0 0 14px;font-size:12px;color:#6b7690">Si el botón no funciona, copiá este link en el navegador:<br><span style="word-break:break-all">${escapar(boton.url)}</span></p>`
    : '';
  return `<!doctype html><html lang="es"><body style="margin:0;background:#eef3f9;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px">
    <div style="background:#16284a;color:#fff;padding:16px 22px;border-radius:12px 12px 0 0;font-weight:700;font-size:17px">${club}</div>
    <div style="background:#fff;padding:24px 22px;border-radius:0 0 12px 12px">
      <h1 style="margin:0 0 16px;font-size:20px;color:#16284a">${escapar(titulo)}</h1>
      ${ps}${btn}
    </div>
    <p style="margin:14px 0 0;font-size:12px;color:#6b7690;text-align:center">${pie ? escapar(pie) : 'Mail automático del sistema del aeroclub. No hace falta responderlo.'}</p>
  </div></body></html>`;
}

// `html` ya armado (con plantilla()); `texto` es la versión sin formato.
async function enviar({ para, asunto, html, texto, responderA = null }) {
  if (!configurado()) throw new ErrorNegocio('El envío de mails todavía no está configurado. Avisale a soporte.', 503);
  let r;
  try {
    r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: REMITENTE, to: [para], subject: asunto, html, text: texto, ...(responderA ? { reply_to: responderA } : {}) }),
      signal: AbortSignal.timeout(15000)
    });
  } catch (e) {
    console.error('[mail] no se pudo conectar con Resend:', e.message);
    throw new ErrorNegocio('No se pudo mandar el mail. Probá de nuevo en un rato.', 502);
  }
  if (!r.ok) {
    console.error('[mail] Resend respondió', r.status, await r.text().catch(() => ''));
    throw new ErrorNegocio('No se pudo mandar el mail. Probá de nuevo en un rato.', 502);
  }
  return r.json();
}

module.exports = { enviar, plantilla, configurado, escapar };
