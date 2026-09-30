// Automatizaciones nativas de Twenty (workflows), creadas vía la tool MCP `create_complete_workflow`.
// Idempotente por nombre: si un workflow ya existe no se toca. Para cambiar uno, borrarlo en la UI
// (Workflows → ... → Delete) y volver a correr el script.
//
//   npm run workflows -- --dry-run
//   npm run workflows -- --env .env.prod
//   npm run workflows -- --env .env.local --stale-delay-minutes 1   (solo para probar en local)
import { randomUUID } from 'node:crypto';
import { DRY_RUN, TWENTY_URL, gql, log, requireEnv } from './lib/twenty.ts';

const API_KEY = requireEnv('TWENTY_ADMIN_API_KEY');
const argv = process.argv.slice(2);
const testDelayIndex = argv.indexOf('--stale-delay-minutes');
const staleDelay = testDelayIndex >= 0 ? { minutes: Number(argv[testDelayIndex + 1]) } : { days: 3 };

const noErrorHandling = { retryOnFailure: { value: 0 }, continueOnFailure: { value: false } };

// Filtro sobre el registro que disparó el evento (se evalúa antes de crear la ejecución).
function triggerFilterStageIs(stage: string) {
  const group = randomUUID();
  return {
    stepFilterGroups: [{ id: group, logicalOperator: 'AND' }],
    stepFilters: [{
      id: randomUUID(),
      type: 'SELECT',
      operand: 'IS',
      value: JSON.stringify([stage]),
      stepOutputKey: '{{trigger.properties.after.stage}}',
      stepFilterGroupId: group,
    }],
  };
}

// ─── 1. Oportunidad ganada → Proyecto en kickoff ────────────────────────────────────────────────────────

function wonToProject() {
  const create = randomUUID();
  return {
    name: 'Oportunidad ganada → Proyecto',
    description: 'Cuando una oportunidad pasa a Ganado, crea un Proyecto vinculado en estado Kickoff.',
    trigger: {
      name: 'Oportunidad pasa a Ganado',
      type: 'DATABASE_EVENT',
      settings: {
        eventName: 'opportunity.updated',
        fields: ['stage'],
        outputSchema: {},
        filter: triggerFilterStageIs('WON'),
      },
      nextStepIds: [create],
    },
    steps: [{
      id: create,
      name: 'Crear proyecto',
      type: 'CREATE_RECORD',
      valid: true,
      settings: {
        input: {
          objectName: 'proyecto',
          objectRecord: {
            name: '{{trigger.properties.after.name}}',
            estado: 'KICKOFF',
            empresa: { id: '{{trigger.properties.after.companyId}}' },
            oportunidad: { id: '{{trigger.recordId}}' },
          },
        },
        outputSchema: {},
        errorHandlingOptions: noErrorHandling,
      },
    }],
    edges: [{ source: 'trigger', target: create }],
  };
}

// ─── 2. 3 días en Propuesta enviada sin cambios → tarea de seguimiento ─────────────────────────────────
// Twenty no tiene aritmética de fechas en filtros, así que en vez de un cron que busque "updatedAt < hoy-3d"
// se espera 3 días desde que la oportunidad entra en Propuesta enviada y se verifica que no cambió nada
// (misma etapa y mismo updatedAt que cuando entró).
// Un workflow tiene un solo disparador, así que hay dos copias: una para cuando la oportunidad PASA a Propuesta
// enviada (update) y otra para cuando se CREA directamente ahí (típico de Grok Bot cargando algo ya avanzado).
// En ambos eventos el registro está en trigger.properties.after y el id en trigger.recordId.

function staleProposalTask(opportunityIdFieldId: string, event: 'updated' | 'created') {
  const [wait, find, check, task, link] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const group = randomUUID();
  return {
    name: event === 'updated'
      ? 'Propuesta sin movimiento → tarea de seguimiento'
      : 'Propuesta creada sin movimiento → tarea de seguimiento',
    description: event === 'updated'
      ? 'Si una oportunidad sigue en Propuesta enviada 3 días después de entrar, sin ninguna modificación, crea una tarea de seguimiento para su responsable.'
      : 'Igual que el anterior, para oportunidades creadas directamente en Propuesta enviada.',
    trigger: {
      name: event === 'updated' ? 'Oportunidad pasa a Propuesta enviada' : 'Oportunidad creada en Propuesta enviada',
      type: 'DATABASE_EVENT',
      settings: {
        eventName: `opportunity.${event}`,
        ...(event === 'updated' ? { fields: ['stage'] } : {}),
        outputSchema: {},
        filter: triggerFilterStageIs('PROPOSAL'),
      },
      nextStepIds: [wait],
    },
    steps: [
      {
        id: wait,
        name: 'Esperar',
        type: 'DELAY',
        valid: true,
        settings: { input: { delayType: 'DURATION', duration: staleDelay }, outputSchema: {}, errorHandlingOptions: noErrorHandling },
      },
      {
        id: find,
        name: 'Releer la oportunidad',
        type: 'FIND_RECORDS',
        valid: true,
        settings: {
          input: {
            objectName: 'opportunity',
            limit: 1,
            filter: {
              recordFilterGroups: [],
              recordFilters: [{
                id: randomUUID(),
                fieldMetadataId: opportunityIdFieldId,
                type: 'UUID',
                operand: 'IS',
                value: JSON.stringify(['{{trigger.recordId}}']),
              }],
            },
          },
          outputSchema: {},
          errorHandlingOptions: noErrorHandling,
        },
      },
      {
        id: check,
        name: 'Sigue igual',
        type: 'FILTER',
        valid: true,
        settings: {
          input: {
            stepFilterGroups: [{ id: group, logicalOperator: 'AND' }],
            stepFilters: [
              { id: randomUUID(), type: 'SELECT', operand: 'IS', value: JSON.stringify(['PROPOSAL']), stepOutputKey: `{{${find}.first.stage}}`, stepFilterGroupId: group },
              { id: randomUUID(), type: 'TEXT', operand: 'IS', value: '{{trigger.properties.after.updatedAt}}', stepOutputKey: `{{${find}.first.updatedAt}}`, stepFilterGroupId: group },
            ],
          },
          outputSchema: {},
          errorHandlingOptions: noErrorHandling,
        },
      },
      {
        id: task,
        name: 'Crear tarea de seguimiento',
        type: 'CREATE_RECORD',
        valid: true,
        settings: {
          input: {
            objectName: 'task',
            objectRecord: {
              title: 'Seguimiento de propuesta: {{trigger.properties.after.name}}',
              status: 'TODO',
              assignee: { id: '{{trigger.properties.after.ownerId}}' },
              bodyV2: { markdown: 'La oportunidad lleva 3 días en Propuesta enviada sin movimiento. Contactar al cliente.' },
            },
          },
          outputSchema: {},
          errorHandlingOptions: noErrorHandling,
        },
      },
      {
        id: link,
        name: 'Vincular tarea a la oportunidad',
        type: 'CREATE_RECORD',
        valid: true,
        settings: {
          input: {
            objectName: 'taskTarget',
            objectRecord: { task: { id: `{{${task}.id}}` }, targetOpportunity: { id: '{{trigger.recordId}}' } },
          },
          outputSchema: {},
          errorHandlingOptions: noErrorHandling,
        },
      },
    ],
    edges: [
      { source: 'trigger', target: wait },
      { source: wait, target: find },
      { source: find, target: check },
      { source: check, target: task },
      { source: task, target: link },
    ],
  };
}

// ─── Aplicación ─────────────────────────────────────────────────────────────────────────────────────────

async function mcp(tool: string, args: Record<string, unknown>) {
  const res = await fetch(`${TWENTY_URL}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${API_KEY}`,
    },
    // Las tools de Twenty se invocan a través de la meta-tool execute_tool.
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'execute_tool', arguments: { toolName: tool, arguments: args } },
    }),
  });
  const raw = await res.text();
  const line = raw.split('\n').find((l) => l.startsWith('data: ')) ?? raw;
  const body = JSON.parse(line.replace(/^data: /, ''));
  const text = body.result?.content?.[0]?.text ?? JSON.stringify(body.error ?? body);
  const parsed = (() => { try { return JSON.parse(text); } catch { return { message: text }; } })();
  if (body.error || body.result?.isError || parsed.success === false) throw new Error(`${tool}: ${parsed.error ?? parsed.message ?? text}`);
  return parsed;
}

console.log(`Workflows → ${TWENTY_URL}${DRY_RUN ? '  (DRY RUN: no se modifica nada)' : ''}\n`);

// Los filtros de "Buscar registros" referencian campos por id de metadata, que cambia en cada instancia.
const meta = await gql('metadata', API_KEY, `{ objects(paging: { first: 200 }) { edges { node {
  nameSingular fields(paging: { first: 200 }) { edges { node { id name } } }
} } } }`);
const opportunity = meta.objects.edges.find((e: any) => e.node.nameSingular === 'opportunity').node;
const opportunityIdFieldId = opportunity.fields.edges.find((e: any) => e.node.name === 'id').node.id;

const WORKFLOWS = [
  wonToProject(),
  staleProposalTask(opportunityIdFieldId, 'updated'),
  staleProposalTask(opportunityIdFieldId, 'created'),
];

for (const workflow of WORKFLOWS) {
  const existing = await gql('graphql', API_KEY,
    `query($name: String!) { workflows(filter: { name: { eq: $name } }) { edges { node { id statuses } } } }`,
    { name: workflow.name });
  const node = existing.workflows.edges[0]?.node;
  if (node) {
    log.ok(`"${workflow.name}" (${(node.statuses ?? []).join(', ') || 'sin estado'})`);
    continue;
  }
  log.create(`"${workflow.name}"`);
  if (DRY_RUN) continue;
  const created = await mcp('create_complete_workflow', { ...workflow, activate: true });
  console.log(`      ${created.message ?? 'creado'}`);
}

console.log(`\nListo${DRY_RUN ? ' (dry-run)' : ''}.`);
