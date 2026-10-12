// Conexión con el sistema de gestión (crm.garrahanautomotores.com.ar).
//
// Con CRM_URL configurada, el stock de la web sale del CRM: se carga un auto
// allá y aparece acá; se seña o se vende y desaparece. Sin CRM_URL, el sitio
// sigue usando su propia base como siempre.

const CRM_URL = (process.env.CRM_URL || '').replace(/\/$/, '');
const WEB_API_KEY = process.env.WEB_API_KEY || '';

const FRESCO_MS = 30 * 1000;   // tiempo en que la lista se reusa sin volver a pedirla
const TIMEOUT_MS = 6000;

const activo = () => Boolean(CRM_URL);

let cache = { lista: null, en: 0 };

async function pedir(ruta, opciones = {}) {
  const r = await fetch(CRM_URL + ruta, { ...opciones, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const cuerpo = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, cuerpo };
}

// La lista se cachea un rato. Si el CRM no responde, se sirve la última que
// se obtuvo: es preferible un stock de hace unos minutos a una web vacía.
async function listar() {
  if (cache.lista && Date.now() - cache.en < FRESCO_MS) return cache.lista;
  try {
    const { ok, cuerpo } = await pedir('/api/publico/vehiculos');
    if (!ok || !Array.isArray(cuerpo.vehicles)) throw new Error('respuesta inesperada');
    cache = { lista: cuerpo.vehicles, en: Date.now() };
    return cache.lista;
  } catch (err) {
    console.error('CRM: no se pudo leer el stock:', err.message);
    if (cache.lista) return cache.lista;
    throw err;
  }
}

async function uno(id) {
  const { status, cuerpo } = await pedir('/api/publico/vehiculos/' + encodeURIComponent(id));
  if (status === 404) return null;
  if (status !== 200) throw new Error('CRM respondió ' + status);
  return cuerpo;
}

async function enviarLead(datos) {
  const { ok, status, cuerpo } = await pedir('/api/publico/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-garrahan-clave': WEB_API_KEY },
    body: JSON.stringify(datos),
  });
  if (!ok) throw new Error(cuerpo.error || 'CRM respondió ' + status);
  return cuerpo;
}

module.exports = { activo, listar, uno, enviarLead, CRM_URL };
