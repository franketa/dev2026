# PROGRESS — CRM VentureByte (Twenty)

Para retomar: leer este archivo, `NOTES.md` y `git log -- clients/venturebyte-crm`.

## Estado por fase

| Fase | Estado |
|---|---|
| 1. Reconocimiento | ✅ Hecha. Ver `NOTES.md` |
| 2. Despliegue | ⏳ |
| 3. Modelo de datos como código | ⏳ |
| 4. Roles y acceso del bot | ⏳ |
| 5. Automatizaciones | ⏳ |
| 6. Runbook | ⏳ |

## Decisiones

- **D1 — Versión fija `v2.43.0`**, no `latest`: un redeploy no tiene que actualizar Twenty sin que nadie lo decida.
- **D2 — Dominio provisorio**: URL sslip de Coolify. El DNS de venturebyte.com.ar está en DonWeb (no Cloudflare);
  Franco apunta `crm.venturebyte.com.ar` → 77.42.35.93 cuando pueda. Al cambiar hay que actualizar `SERVER_URL`.
- **D3 — Monto con CURRENCY nativo** (amountMicros + currencyCode por registro, ARS y USD soportadas).
- **D4 — Contenido/Redes sin permisos por fila**: limitar el rol al pipeline UGC exige Enterprise. El rol ve y edita
  Opportunities y trabaja desde la vista "Pipeline Venture Studio UGC". Es una restricción de uso, no de permisos.
- **D5 — Desarrollo no ve montos**: se logra sin permisos por campo, porque el rol no tiene acceso a Opportunities
  ni a Abonos (los únicos objetos con montos). Ve Companies y People (necesitan el contacto del cliente) y edita
  Proyectos, notas y tareas.
- **D6 — MCP nativo** de Twenty (`/mcp`): 3 meta-tools con carga bajo demanda = mínimo consumo de tokens para
  Grok Bot. No se despliega MCP comunitario.
- **D7 — API keys desde la UI**: Twenty no permite crear keys con otra key. Franco crea dos: "setup" (rol Admin,
  para correr el script de esquema) y "grok-bot" (rol Bot).
- **D8 — Backups**: diarios en el propio VPS. Offsite (S3/R2) pendiente, decisión de Franco.

## Pendiente de Franco

- Registro A `crm.venturebyte.com.ar` → `77.42.35.93` en DonWeb.
- Definir bucket externo para backups (pendiente).

## Sugerencias fuera de alcance

- (ninguna todavía)
