# PROGRESS — CRM VentureByte (Twenty)

Para retomar: leer este archivo, `NOTES.md`, `README.md` y `git log -- clients/venturebyte-crm`.

## Estado por fase

| Fase | Estado |
|---|---|
| 1. Reconocimiento | ✅ Hecha. Ver `NOTES.md` |
| 2. Despliegue | ✅ Servicio Coolify `venturebyte-crm` (uuid `h8os848g8wk4socg8c84kc4o`) en My first project / production. HTTPS Let's Encrypt en **https://crm.venturebyte.com.ar**. Backup diario 09:00 UTC (06:00 ART), retención 14 backups / 14 días / 1 GB; primer backup OK (753 KB). |
| 3. Modelo de datos como código | ✅ Aplicado en prod (2026-09-29) sin errores; segunda corrida sin cambios. Datos demo de Twenty destruidos: el CRM arranca vacío |
| 4. Roles y acceso del bot | 🟡 Roles creados en prod (segunda corrida sin cambios). **Falta**: Franco crea la key `grok-bot` con rol Bot → `npm run verify-bot -- --env .env.prod --cleanup` |
| 5. Automatizaciones | ✅ Los dos workflows activos en prod; los 2 workflows demo de Twenty destruidos. "Ganada → Proyecto" probado en prod con registros [TEST] (destruidos) |
| 6. Runbook | ✅ `README.md` |

## Decisiones

- **D1 — Versión fija `v2.43.0`**, no `latest`: un redeploy no tiene que actualizar Twenty sin que nadie lo decida.
- **D2 — Dominio**: arrancó en una URL sslip de Coolify y el mismo día pasó a `crm.venturebyte.com.ar`. El DNS de venturebyte.com.ar está en DonWeb (no Cloudflare);
  Franco apunta `crm.venturebyte.com.ar` → 77.42.35.93 cuando pueda. Pasos en README → Cambiar de dominio.
- **D3 — Monto con CURRENCY nativo** (amountMicros + currencyCode por registro; ARS y USD verificados).
  Default ARS en oportunidades y abonos.
- **D4 — Contenido y Redes sin permisos por fila**: limitar el rol al pipeline UGC exige Enterprise. El rol edita
  Opportunities y trabaja desde la vista "Pipeline Venture Studio UGC". Es una convención, no un permiso.
- **D5 — Desarrollo no ve montos**: no tiene acceso a Opportunities ni a Abonos, y `company.annualRevenue` está
  oculto por permiso de campo. Ve Companies y People (necesitan el contacto del cliente).
- **D6 — MCP nativo** de Twenty (`/mcp`): 7 meta-tools (~1.000 tokens en `tools/list`), las tools concretas se
  cargan bajo demanda y respetan el rol. Es la opción de menos tokens; no se despliega MCP comunitario.
- **D7 — API keys desde la UI**: Twenty no permite crear keys con otra key. Franco crea "setup" (Admin) y
  "grok-bot" (Bot).
- **D8 — Backups**: backup programado de Coolify sobre el `db` del servicio, diario 09:00 UTC, retención 14/14 días/1 GB, en el VPS. Un dump pesa <1 MB hoy. Offsite pendiente (decisión de Franco).
- **D13 — Dominio https en Coolify**: la API no permite editar el dominio de un sub-servicio; el primer cambio (http→https sslip) se hizo con `php artisan tinker` replicando `EditDomain::submit` (fqdn + updateCompose + parse). Los cambios siguientes, desde la UI.
- **D9 — Mínimo privilegio explícito en roles**: Desarrollo, Contenido y Redes parten sin acceso y el Bot parte de
  solo lectura; se habilita objeto por objeto. Así el Bot no puede editar workflows vía la API de registros.
  Nadie salvo Admin puede destruir registros (borrado definitivo).
- **D10 — Etapas**: se reutilizan los valores estándar de Twenty (NEW, SCREENING, MEETING, PROPOSAL) con etiquetas
  en español; CUSTOMER se renombró a WON ("Ganado") conservando el id; se agregaron NEGOTIATION y LOST.
- **D11 — "3 días sin actividad"**: los filtros de workflow no tienen aritmética de fechas, así que el workflow
  espera 3 días (DELAY) desde que la oportunidad entra en Propuesta enviada y verifica que siga en esa etapa con
  el mismo `updatedAt`. Cualquier edición de la oportunidad cuenta como actividad; notas y tareas no.
- **D12 — Datos demo**: Twenty crea al activar el workspace empresas/personas/oportunidades de ejemplo y dos
  workflows activos ("Create company when adding a new person", "Quick Lead"). En prod se borran (con OK).

## Pendiente de Franco

- ✅ OK para desplegar y correr scripts en prod, borrar datos demo y probar el bot (2026-09-29).
- ✅ Cuenta Admin creada (contacto@venturebyte.com.ar, también admin del servidor) y key "setup" (Admin).
- Crear la key "grok-bot" con rol Bot.
- Regenerar la key "setup" (pasó por el chat) y actualizar `.env.prod`.
- ✅ Registro A `crm.venturebyte.com.ar` → `77.42.35.93` (DonWeb), dominio activo desde 2026-09-29.
- Bucket externo para backups (pendiente).
- Emails del equipo y rol de cada uno para las invitaciones.

## Sugerencias fuera de alcance

- **SMTP** (Settings → Admin panel → Config variables) para que las invitaciones y los resets de contraseña
  lleguen por email. Sin SMTP, invitar por link (Settings → Members → Invite link).
- **Backup offsite** a Cloudflare R2 / Backblaze B2 desde Coolify (es un toggle cuando haya bucket).
- **Deduplicar proyectos**: si una oportunidad vuelve a Ganado, el workflow crea otro proyecto. Se puede sumar un
  paso "buscar proyecto de esta oportunidad" + filtro si pasa seguido.
- **Rol por defecto**: el rol estándar "Member" puede borrar todo. Convendría definir otro rol por defecto para
  invitaciones (Settings → Roles → Default role).
- **Integración Make.com**: Chatwoot/ManyChat → Twenty vía webhooks o la API REST con una key de rol Bot.
