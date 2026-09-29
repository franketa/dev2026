# NOTES — qué soporta Twenty de verdad

Versión usada: **Twenty v2.43.0** (release `twenty/v2.43.0`, 2026-09-28; imagen `twentycrm/twenty:v2.43.0`).
Fuente: código y docs del tag `twenty/v2.43.0` en github.com/twentyhq/twenty (`packages/twenty-docs`,
`packages/twenty-docker`, `packages/twenty-server`). Lo marcado **[verificar]** sale de leer código, no de probarlo.

## Despliegue

- Misma imagen para `server` y `worker`. El worker corre `yarn worker:prod` con `DISABLE_DB_MIGRATIONS=true`
  y `DISABLE_CRON_JOBS_REGISTRATION=true`.
- El entrypoint del server inicializa la base si está vacía, corre migraciones (`upgrade`) y registra crons en
  cada arranque. Corre como uid 1000.
- Postgres ≥ 15 (oficial: `postgres:16`). Redis con `--maxmemory-policy noeviction`.
- Variables obligatorias: `SERVER_URL`, `PG_DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`
  (`APP_SECRET` es legacy; si se pierde `ENCRYPTION_KEY` se pierden los secretos guardados en la base).
- Password de Postgres **sin caracteres especiales** (va dentro de una URL).
- Volúmenes: `/app/packages/twenty-server/.local-storage` (server + worker) y `/var/lib/postgresql/data`.
- Healthcheck: `curl --fail http://localhost:3000/healthz`.
- **RAM: la doc pide mínimo 2 GB** para todo el stack. No da requisito de CPU.
- `IS_MULTIWORKSPACE_ENABLED=false` (default): un solo workspace; **el primer usuario que se registra es admin**.
  Después de creado el workspace, el alta es solo por invitación. No existe `IS_SIGN_UP_DISABLED`.
- Detrás de Traefik: `TRUST_PROXY` por default confía en redes privadas, así que `X-Forwarded-Proto` funciona.
  `SERVER_URL` tiene que ser la URL pública exacta (links, OAuth, discovery del MCP).

## Metadata API (`POST /metadata`, GraphQL; también REST en `/rest/metadata/*`)

- Auth `Authorization: Bearer <API_KEY>`. Rate limit 100 req/min.
- Tocar el modelo de datos exige el permiso `DATA_MODEL`; vistas `VIEWS`; roles `ROLES`.
- `createOneObject`, `createOneField`, `updateOneField`. Tipos útiles: SELECT, MULTI_SELECT, CURRENCY, LINKS,
  PHONES, BOOLEAN, DATE, TEXT, RELATION.
- Opciones de SELECT: `{id?, value, label, position, color}`. `updateOneField` con `options` **reemplaza la lista
  entera**; hay que mandar los `id` existentes para no regenerarlos.
- RELATION: `relationCreationPayload: {type: MANY_TO_ONE, targetObjectMetadataId, targetFieldLabel,
  targetFieldIcon}`. El lado inverso se crea solo.
- El campo estándar `opportunity.stage` es editable (options, label, default). Trae NEW, SCREENING, MEETING,
  PROPOSAL, CUSTOMER; **no trae Ganado/Perdido**, se agregan.
- **Vistas en la Metadata API**: `createView` (TABLE/KANBAN, `mainGroupByFieldMetadataId`), `createViewFilter`,
  `createViewField`, `createViewGroup`, `createViewSort`.

## CURRENCY

- Compuesto `amountMicros` + `currencyCode` **por registro**. ARS y USD están en la lista de monedas.
  → Se usa el tipo CURRENCY nativo; no hace falta un select de moneda aparte.

## Roles y permisos (plan gratuito self-hosted = features "Pro")

- Roles custom: sí. Permisos por objeto (ver / editar / borrar (soft) / destruir): sí. **Por campo** (ver / editar):
  sí, solo para restringir. Asignar rol a una API key: sí (el rol es obligatorio al crear la key).
- **Por fila** (ej. "solo oportunidades de marca UGC"): **solo Enterprise** (`ENTERPRISE_KEY` pago).
  → El rol Contenido/Redes no se puede limitar al pipeline UGC a nivel permiso; se resuelve con una vista filtrada
  (ver PROGRESS.md, decisión D4).
- Crear y editar usan **el mismo flag** (`canUpdateObjectRecords`). Soft-delete y destroy son flags aparte.
  → Bot = leer + editar, sin soft-delete ni destroy.
- Mutations: `createOneRole`, `updateOneRole`, `upsertObjectPermissions`, `upsertFieldPermissions`,
  `upsertPermissionFlags`, `assignRoleToApiKey`, `updateWorkspaceMemberRole`.

## API keys

- **No se pueden crear con otra API key**: `createApiKey` exige sesión de usuario. Se crean en la UI
  (Settings → APIs & Webhooks), con rol obligatorio y vencimiento (hasta "Nunca"). El token se ve una sola vez.
- "Regenerate" en la UI = key nueva con el mismo rol + revoca la anterior (rotación).

## Workflows (disponibles en self-hosted gratis)

- Triggers: registro creado/actualizado (con filtro por campos), borrado, manual, CRON (en UTC), webhook.
- Acciones: crear/actualizar/buscar registros, filtro, if/else, iterador, delay, email, HTTP, código
  (código deshabilitado por default en prod; no lo necesitamos).
- "Oportunidad pasa a Ganado → crear Proyecto": nativo (how-to oficial `closed-won-automations`).
- "3 días en Propuesta enviada → tarea": nativo con CRON diario + Buscar registros + Iterador + Crear tarea.
  "Sin actividad" = `updatedAt` de la oportunidad (no mira notas/tareas).
- Crear workflows por API con una API key **[verificar]**: `createCoreWorkflow` probablemente pide un actor
  usuario; la tool MCP `create_complete_workflow` sí funciona con API key.

## MCP

- **Nativo**, en `<SERVER_URL>/mcp` (streamable HTTP). Auth: OAuth o `Authorization: Bearer <API_KEY>`;
  los permisos son los del rol de la key.
- Expone 3 meta-tools (`get_tool_catalog`, `learn_tools`, `execute_tool`) y carga las demás bajo demanda.
  Es la opción de menos tokens: el cliente no recibe el esquema de decenas de tools en cada llamada.
  → No se despliega ningún MCP comunitario.

## Verificado en la instancia local (v2.43.0)

- Crear una vista KANBAN con `mainGroupByFieldMetadataId` genera las columnas solas, y cambiar las opciones del
  campo las sincroniza (renombrar un `value` conserva la columna en su posición original → el script la reordena).
- Los filtros de vista usan: SELECT `IS` con value `'["VALOR"]'`; BOOLEAN `IS` con `'true'`/`'false'`.
- Workspace nuevo = datos demo (Airbnb, Stripe, Figma…) + 2 workflows activos ("Create company when adding a new
  person", "Quick Lead"). Onboarding de la UI: install apps → profile → invite team (todos salteables).
- Registros: GraphQL en `/graphql` no acepta dos aliases del mismo resolver en una mutation; usar las bulk
  (`createCompanies`, `createOpportunities`).
- MCP: `tools/list` devuelve 7 meta-tools (~3,9 KB). Las tools reales se llaman con
  `execute_tool {toolName, arguments}`; `find_many_*` exige `select`. El catálogo ya viene filtrado por el rol
  (el Bot no tiene `delete_*` sobre registros ni `create_*` sobre Proyectos/Abonos).
- Workflows por API: `create_complete_workflow` vía MCP con key Admin funciona (crea, valida y activa).
  En eventos `*.updated` el registro está en `{{trigger.properties.after.<campo>}}` y el id en
  `{{trigger.recordId}}` (`{{trigger.object.*}}` es solo para `*.created`). El filtro del trigger usa esas mismas
  rutas. "Buscar registros" filtra por `fieldMetadataId` (no por nombre); UUID `IS` con value `'["<id>"]'`.
- Relaciones en CREATE_RECORD: `{ "empresa": { "id": "..." } }`. Vincular una tarea: crear `taskTarget` con
  `{ task: { id }, targetOpportunity: { id } }`.
- **Objetos de sistema y permisos** (`workspace-roles-permissions-cache.service.js`): el acceso "por defecto" de
  un rol (`canReadAllObjectRecords`, etc.) NO aplica a los objetos de sistema (adjuntos, timelineActivity,
  mensajes, calendario, noteTarget/taskTarget...): sin excepción explícita tienen acceso total, incluido destruir.
  Workflows (flag WORKFLOWS) y workspaceMember (flag WORKSPACE_MEMBERS) se controlan aparte. `upsertObjectPermissions`
  sí acepta excepciones sobre objetos de sistema → `roles.ts` las genera con `systemObjects`.
