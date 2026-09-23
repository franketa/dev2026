import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

const url =
  process.env.DATABASE_URL ||
  "postgres://garrahan:garrahan@localhost:5432/garrahan_crm";

export const sql =
  global.__sql ||
  postgres(url, {
    max: 10,
    idle_timeout: 20,
    transform: { undefined: null },
  });

if (process.env.NODE_ENV !== "production") global.__sql = sql;

/** Suma rápida sobre una consulta que devuelve una sola fila con un campo. */
export async function uno<T = any>(q: Promise<T[]>): Promise<T | null> {
  const r = await q;
  return r[0] ?? null;
}

export const num = (v: any): number => (v === null || v === undefined ? 0 : Number(v));
