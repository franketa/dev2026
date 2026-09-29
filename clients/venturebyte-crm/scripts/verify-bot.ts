// Comprueba que la API key del bot hace lo que tiene que hacer y nada más.
//
//   npm run verify-bot                 (contra la instancia de .env)
//
// Crea una oportunidad "[TEST] verify-bot ...", la edita, intenta borrarla/destruirla y tocar el esquema
// (las tres cosas tienen que fallar). La oportunidad de prueba queda creada: si hay TWENTY_ADMIN_API_KEY
// y se pasa --cleanup, la destruye con la key de admin.
import { GraphQLError, gql, requireEnv } from './lib/twenty.ts';

const BOT = requireEnv('TWENTY_BOT_API_KEY');
const cleanup = process.argv.includes('--cleanup');

let failures = 0;
const pass = (msg: string) => console.log(`  ✔ ${msg}`);
const fail = (msg: string) => {
  failures++;
  console.log(`  ✘ ${msg}`);
};

async function mustSucceed<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const result = await fn();
    pass(label);
    return result;
  } catch (e) {
    fail(`${label}: ${(e as Error).message}`);
  }
}

async function mustBeDenied(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    fail(`${label}: la operación se permitió y NO debería`);
  } catch (e) {
    if (e instanceof GraphQLError) pass(`${label} → denegado (${e.message})`);
    else fail(`${label}: error inesperado ${(e as Error).message}`);
  }
}

console.log(`Verificación del bot → ${process.env.TWENTY_URL}\n`);

const name = `[TEST] verify-bot ${new Date().toISOString()}`;
const created = await mustSucceed('crear oportunidad', () =>
  gql('graphql', BOT, `mutation($data: OpportunityCreateInput!) { createOpportunity(data: $data) { id } }`, {
    data: { name, marca: 'VENTUREBYTE', stage: 'NEW', amount: { amountMicros: 1_000_000, currencyCode: 'ARS' } },
  }),
);
const id: string | undefined = created?.createOpportunity.id;

if (id) {
  await mustSucceed('editar oportunidad', () =>
    gql('graphql', BOT, `mutation($id: UUID!) { updateOpportunity(id: $id, data: { stage: SCREENING }) { id } }`, { id }));
  await mustBeDenied('borrar oportunidad (soft delete)', () =>
    gql('graphql', BOT, `mutation($id: UUID!) { deleteOpportunity(id: $id) { id } }`, { id }));
  await mustBeDenied('destruir oportunidad', () =>
    gql('graphql', BOT, `mutation($id: UUID!) { destroyOpportunity(id: $id) { id } }`, { id }));
}

await mustBeDenied('modificar el esquema (crear campo)', async () => {
  const data = await gql('metadata', BOT, `{ objects(paging: { first: 200 }) { edges { node { id nameSingular } } } }`);
  const opp = data.objects.edges.find((e: any) => e.node.nameSingular === 'opportunity').node;
  await gql('metadata', BOT,
    `mutation($input: CreateOneFieldMetadataInput!) { createOneField(input: $input) { id } }`,
    { input: { field: { objectMetadataId: opp.id, name: 'botNoDeberia', label: 'Bot no debería', type: 'TEXT' } } });
});

await mustBeDenied('crear un rol', () =>
  gql('metadata', BOT, `mutation($input: CreateRoleInput!) { createOneRole(createRoleInput: $input) { id } }`,
    { input: { label: 'Bot no debería' } }));

if (id && cleanup) {
  const admin = requireEnv('TWENTY_ADMIN_API_KEY');
  await gql('graphql', admin, `mutation($id: UUID!) { destroyOpportunity(id: $id) { id } }`, { id });
  console.log(`\n  (limpieza) oportunidad de prueba ${id} destruida con la key de admin`);
} else if (id) {
  console.log(`\n  Oportunidad de prueba creada: ${id} ("${name}"). Borrala a mano o corré con --cleanup.`);
}

console.log(failures ? `\n${failures} verificación(es) fallaron.` : '\nTodo OK.');
process.exit(failures ? 1 : 0);
