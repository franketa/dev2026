/**
 * Lo que devuelve una operación del negocio (cargar un lead, registrar un
 * cobro…): o salió, con lo que haga falta para seguir, o el motivo por el que
 * no. Las pantallas lo convierten en aviso; el asistente de Telegram, en
 * respuesta.
 */
export type Res<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

export const fallo = (error: string): { ok: false; error: string } => ({ ok: false, error });
