// Mails con Resend (https://resend.com/docs/api-reference/emails/send-email), texto plano.
// Sin RESEND_API_KEY no se manda nada: el alta funciona igual y la contraseña se pasa por WhatsApp.
// MAIL_FROM tiene que ser de un dominio verificado en Resend (ej.: Aeroclub 25 de Mayo <no-responder@dominio>).

const PARA_QUE = {
  piloto: 'cargar tus vuelos', admin: 'administrar el club', consulta: 'consultar la administración del club', rampa: 'cargar tickets de servicios en la rampa'
};

async function enviar({ para, asunto, texto }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !para) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'Aeroclub 25 de Mayo <onboarding@resend.dev>',
        to: [para], subject: asunto, text: texto
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) console.error(`Resend respondió ${r.status}: ${await r.text()}`);
    return r.ok;
  } catch (e) {
    console.error('No se pudo mandar el mail:', e.message);
    return false;
  }
}

// Confirma el alta con los datos para entrar (los mismos que el mensaje de WhatsApp). Nunca falla:
// devuelve si se mandó.
function bienvenida(u, password, url) {
  return enviar({
    para: u.email,
    asunto: 'Tu usuario en el Aeroclub 25 de Mayo',
    texto: `Hola ${u.nombre}. Ya tenés usuario en el sistema del Aeroclub 25 de Mayo para ${PARA_QUE[u.rol] || PARA_QUE.piloto}.\n\n`
      + `Entrá en ${url}\nEmail: ${u.email}\nContraseña temporal: ${password}\n\n`
      + 'Al entrar te va a pedir que elijas una propia.\n\nSi no esperabas este mail, ignoralo.'
  });
}

module.exports = { enviar, bienvenida };
