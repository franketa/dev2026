// Cliente mínimo para la API GraphQL de Twenty + utilidades compartidas por los scripts.
import { existsSync } from 'node:fs';

// Argumentos comunes: --env <archivo> (default .env) y --dry-run.
const argv = process.argv.slice(2);
const envIndex = argv.indexOf('--env');
const envFile = envIndex >= 0 ? argv[envIndex + 1] : '.env';
if (existsSync(envFile)) process.loadEnvFile(envFile);
else if (envIndex >= 0) throw new Error(`No existe el archivo de entorno ${envFile}`);

export const DRY_RUN = argv.includes('--dry-run');

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable ${name} (ver .env.example)`);
  return value;
}

export const TWENTY_URL = requireEnv('TWENTY_URL').replace(/\/$/, '');

export class GraphQLError extends Error {
  constructor(public errors: { message: string; extensions?: { code?: string } }[]) {
    super(errors.map((e) => e.message).join(' | '));
  }
}

// Llama a /metadata (esquema, vistas, roles) o /graphql (registros). Reintenta si pega en el rate limit.
export async function gql<T = any>(
  endpoint: 'metadata' | 'graphql',
  apiKey: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${TWENTY_URL}/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await res.json().catch(() => null)) as { data?: T; errors?: any[] } | null;
    const rateLimited =
      res.status === 429 || body?.errors?.some((e) => /too many requests|rate limit/i.test(e.message));
    if (rateLimited && attempt < 5) {
      await new Promise((r) => setTimeout(r, 15_000));
      continue;
    }
    if (!body) throw new Error(`${endpoint}: respuesta HTTP ${res.status} sin JSON`);
    if (body.errors?.length) throw new GraphQLError(body.errors);
    return body.data as T;
  }
}

export const log = {
  ok: (msg: string) => console.log(`  = ${msg}`),
  create: (msg: string) => console.log(`  + ${DRY_RUN ? '[dry-run] ' : ''}${msg}`),
  update: (msg: string) => console.log(`  ~ ${DRY_RUN ? '[dry-run] ' : ''}${msg}`),
  section: (msg: string) => console.log(`\n${msg}`),
};
