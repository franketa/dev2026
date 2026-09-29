# CRM VentureByte (Twenty)

CRM interno de VentureByte y Venture Studio UGC sobre [Twenty](https://twenty.com) v2.43.0, autoalojado en Coolify.
Estado y decisiones: `PROGRESS.md`. Qué soporta Twenty y qué no: `NOTES.md`.

| Qué | Dónde |
|---|---|
| Instancia | https://crm.venturebyte.com.ar (servicio `venturebyte-crm` en Coolify) |
| MCP para Grok Bot | `https://crm.venturebyte.com.ar/mcp` · header `Authorization: Bearer <API key del bot>` |
| Stack | `docker-compose.yml`: server + worker + Postgres 16 + Redis |
| Esquema, roles, workflows | `scripts/` (TypeScript, idempotentes, con `--dry-run`) |

## Desplegar

1. En Coolify: proyecto → **+ New → Docker Compose Empty**, pegar `docker-compose.yml`.
   Coolify genera solo `SERVICE_PASSWORD_POSTGRES`, `SERVICE_BASE64_64_ENCRYPTION` y la URL. No cargar secretos a mano.
2. En el servicio `server`, poner el dominio con `https://` (Coolify saca el certificado de Let's Encrypt).
3. Deploy. El primer arranque tarda ~1-2 min (inicializa la base y corre migraciones).
4. Entrar a la URL y **crear enseguida la cuenta de Franco**: el primer usuario que se registra es Admin.
   Después, el alta es solo por invitación.
5. Settings → APIs & Webhooks → crear la key **setup** con rol Admin y guardarla en un `.env` local (ver abajo).
6. Correr los scripts (sección siguiente) y después crear la key del bot.

RAM: la doc de Twenty pide ≥ 2 GB. Medido en local: server ~1,3 GB, worker ~0,5 GB, Postgres + Redis ~0,1 GB.

### Cambiar de dominio (ej. sslip → crm.venturebyte.com.ar)

1. DNS (DonWeb): registro `A crm.venturebyte.com.ar → 77.42.35.93`.
2. Coolify → servicio → `server` → Domains: `https://crm.venturebyte.com.ar` → Save → Redeploy.
   `SERVER_URL` se actualiza solo porque sale de `SERVICE_URL_SERVER`.
3. Actualizar `TWENTY_URL` en los `.env` locales y la URL del MCP en Grok Bot.

### Actualizar Twenty

Cambiar `TWENTY_TAG` en las variables del servicio (o el default del compose), leer antes las release notes
de Twenty por breaking changes, hacer un backup manual y redeployar. Las migraciones corren solas al arrancar.

## Scripts

```bash
cd clients/venturebyte-crm
npm install
cp .env.example .env        # completar TWENTY_URL y TWENTY_ADMIN_API_KEY (y TWENTY_BOT_API_KEY)
```

Orden la primera vez (siempre primero con `--dry-run`):

```bash
npm run schema    -- --dry-run      # objetos, campos, opciones y vistas
npm run schema
npm run roles     -- --dry-run      # roles Comercial, Desarrollo, Contenido y Redes, Bot
npm run roles
npm run workflows -- --dry-run      # automatizaciones
npm run workflows
npm run verify-bot                  # necesita TWENTY_BOT_API_KEY
```

Todos aceptan `--env <archivo>` para apuntar a otra instancia (ej. `--env .env.local` para una prueba local).
Son idempotentes: una segunda corrida no cambia nada.

## Agregar un campo nuevo al esquema

1. En `scripts/schema.ts`, sumar el campo al objeto en `OBJECTS`, por ejemplo:
   ```ts
   { name: 'presupuestoEnviado', label: 'Presupuesto enviado', type: 'DATE', icon: 'IconCalendar' },
   ```
   Nombre en camelCase sin tildes. Para un select, `options: [{ value: 'VALOR', label: 'Etiqueta', color: 'blue' }]`.
   Para renombrar el `value` de una opción sin perder datos: `renamedFrom: 'VALOR_VIEJO'`.
2. Si tiene que verse en una vista, agregarlo a `fields` de esa vista en `VIEWS`.
3. `npm run schema -- --dry-run`, revisar, `npm run schema`, commit.

El script nunca borra campos ni opciones: para eso, hacerlo a mano en Settings → Data model.

## Roles y usuarios

| Rol | Acceso |
|---|---|
| Admin | Todo (rol estándar, Franco) |
| Comercial | Todos los registros; puede borrar (papelera). Workflows solo lectura |
| Desarrollo | Ve Companies y People (sin facturación anual), edita Proyectos, notas y tareas. No ve Opportunities ni Abonos |
| Contenido y Redes | Edita Companies, People, Opportunities (usar la vista *Pipeline Venture Studio UGC*); Proyectos, notas y tareas |
| Bot | Lee todo; crea y edita Companies, People, Opportunities, notas y tareas (y las vincula). No borra nada, ni siquiera adjuntos o historial; no toca configuración |

Invitar gente: Settings → Members → Invite, eligiendo el rol. Ojo: el rol por defecto de Twenty ("Member")
puede borrar todo; asignar siempre uno de los roles de arriba.

## API key del bot (Grok Bot)

Crear: Settings → APIs & Webhooks → **+ Create key** → nombre `grok-bot`, rol **Bot**, vencimiento 1 año.
Copiarla (se ve una sola vez) a la config de Grok Bot y a `TWENTY_BOT_API_KEY` del `.env` local, y correr
`npm run verify-bot -- --cleanup` (crea y destruye una oportunidad de prueba y revisa que el catálogo MCP del bot no tenga tools de borrado).

**Rotar:** en la misma pantalla, abrir la key → **Regenerate**. Twenty crea una nueva con el mismo rol y revoca la
anterior al instante: actualizar Grok Bot enseguida y volver a correr `verify-bot`.

Conexión MCP de Grok Bot: servidor HTTP (streamable) en `<SERVER_URL>/mcp` con el header
`Authorization: Bearer <key>`. Expone 7 meta-tools (~1.000 tokens); las tools concretas se cargan bajo demanda
con `learn_tools` / `execute_tool` y ya vienen filtradas por los permisos del rol Bot.

## Automatizaciones (workflows nativos)

- **Oportunidad ganada → Proyecto**: al pasar a *Ganado*, crea un Proyecto en *Kickoff* vinculado a la
  oportunidad y a la empresa. Si una oportunidad vuelve a *Ganado* dos veces, crea dos proyectos.
- **Propuesta sin movimiento → tarea**: al entrar en *Propuesta enviada* espera 3 días; si la oportunidad sigue
  en esa etapa y nadie la modificó, crea una tarea de seguimiento asignada al responsable y vinculada.
  "Sin actividad" = sin cambios en la oportunidad (notas o tareas nuevas no cuentan).

Se ven y se pueden pausar en Workflows. Para cambiar uno: borrarlo en la UI y correr `npm run workflows`.

## Backups

El Postgres del servicio tiene un backup programado diario en Coolify (servicio → `db` → Backups), guardado
en el VPS con retención de 14 días. Backup offsite (S3/R2): pendiente, ver `PROGRESS.md`.

### Restaurar un backup

1. Coolify → servicio → `db` → Backups: descargar el `.dmp` que corresponda (o ubicarlo en el VPS,
   en `/data/coolify/backups/...`).
2. Parar `server` y `worker` (dejar `db` corriendo).
3. Restaurar sobre la base `twenty`:
   ```bash
   docker cp backup.dmp <contenedor-db>:/tmp/backup.dmp
   docker exec <contenedor-db> pg_restore -U postgres -d twenty --clean --if-exists /tmp/backup.dmp
   ```
4. Levantar `server` y `worker` de nuevo y comprobar que la UI carga.

Probar la restauración contra una instancia local de vez en cuando (el mismo compose con `docker compose up`).
