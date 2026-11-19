/**
 * De audio a texto, con ElevenLabs Scribe. Claude no recibe audio: el
 * asistente trabaja sobre la transcripción.
 *
 * La clave va por variable de entorno (ELEVENLABS_API_KEY). Sin ella el
 * asistente sigue contestando texto y avisa que no puede escuchar audios.
 */

export const transcripcionConfigurada = () => Boolean(process.env.ELEVENLABS_API_KEY);

/** Devuelve el texto, o null si no se pudo transcribir o no había nada dicho. */
export async function transcribir(audio: Buffer, nombre: string, tipo: string): Promise<string | null> {
  const clave = process.env.ELEVENLABS_API_KEY;
  if (!clave) return null;

  const fd = new FormData();
  fd.append("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v2");
  // Siempre hablan en castellano: fijarlo evita que un audio corto se detecte mal.
  fd.append("language_code", "es");
  fd.append("tag_audio_events", "false");
  fd.append("file", new Blob([new Uint8Array(audio)], { type: tipo }), nombre);

  try {
    // ELEVENLABS_API_URL solo existe para probar contra un servidor falso.
    const api = process.env.ELEVENLABS_API_URL || "https://api.elevenlabs.io";
    const r = await fetch(`${api}/v1/speech-to-text`, {
      method: "POST",
      headers: { "xi-api-key": clave },
      body: fd,
      signal: AbortSignal.timeout(90000),
    });
    if (!r.ok) {
      console.error("Transcripción:", r.status, (await r.text()).slice(0, 200));
      return null;
    }
    const j: any = await r.json();
    return String(j?.text || "").trim() || null;
  } catch (err: any) {
    console.error("Transcripción: no se pudo transcribir:", err?.message);
    return null;
  }
}
