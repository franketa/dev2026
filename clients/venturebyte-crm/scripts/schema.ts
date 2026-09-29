// Modelo de datos del CRM como código. Idempotente: crea lo que falta, actualiza lo que difiere, no borra nada.
//
//   npm run schema -- --dry-run            (muestra qué haría, contra la instancia de .env)
//   npm run schema -- --env .env.prod      (aplica contra otra instancia)
//
// Para agregar un campo: sumarlo al objeto que corresponda en OBJECTS y correr el script.
import { DRY_RUN, gql, log, requireEnv } from './lib/twenty.ts';

const API_KEY = requireEnv('TWENTY_ADMIN_API_KEY');

// ─── Definición ─────────────────────────────────────────────────────────────────────────────────────────

type Color = 'red' | 'orange' | 'yellow' | 'green' | 'turquoise' | 'sky' | 'blue' | 'purple' | 'pink' | 'gray';
type Option = { value: string; label: string; color: Color; renamedFrom?: string };
type FieldDef = {
  name: string;
  label: string;
  type: 'TEXT' | 'SELECT' | 'MULTI_SELECT' | 'BOOLEAN' | 'LINKS' | 'PHONES' | 'CURRENCY' | 'DATE' | 'RELATION';
  icon?: string;
  description?: string;
  options?: Option[];
  defaultValue?: unknown;
  // Campo estándar de Twenty: solo se ajusta (opciones, default), nunca se crea.
  standard?: boolean;
  // RELATION: siempre MANY_TO_ONE desde este objeto; el lado inverso lo crea Twenty.
  relation?: { target: string; inverseLabel: string; inverseIcon: string };
};
type ObjectDef = {
  nameSingular: string;
  custom?: { namePlural: string; labelSingular: string; labelPlural: string; icon: string; description: string };
  fields: FieldDef[];
};
type ViewDef = {
  object: string;
  name: string;
  type: 'TABLE' | 'KANBAN';
  icon: string;
  groupBy?: string;
  fields: string[];
  filters?: { field: string; operand: 'IS'; value: string | boolean }[];
};

const MARCAS: Option[] = [
  { value: 'VENTUREBYTE', label: 'VentureByte', color: 'blue' },
  { value: 'VENTURE_STUDIO_UGC', label: 'Venture Studio UGC', color: 'pink' },
];

const CANAL_ORIGEN: Option[] = [
  { value: 'PROSPECCION_FRIA', label: 'Prospección fría', color: 'gray' },
  { value: 'INSTAGRAM', label: 'Instagram', color: 'pink' },
  { value: 'WHATSAPP', label: 'WhatsApp', color: 'green' },
  { value: 'UPWORK', label: 'Upwork', color: 'turquoise' },
  { value: 'REFERIDO', label: 'Referido', color: 'purple' },
  { value: 'WEB', label: 'Web', color: 'blue' },
];

const ars = { amountMicros: null, currencyCode: "'ARS'" };

const OBJECTS: ObjectDef[] = [
  {
    nameSingular: 'company',
    fields: [
      { name: 'marca', label: 'Marca', type: 'MULTI_SELECT', icon: 'IconTag', options: MARCAS },
      {
        name: 'rubro',
        label: 'Rubro',
        type: 'SELECT',
        icon: 'IconBuildingStore',
        options: [
          { value: 'INMOBILIARIA', label: 'Inmobiliaria', color: 'blue' },
          { value: 'COMERCIO', label: 'Comercio', color: 'orange' },
          { value: 'GASTRONOMIA', label: 'Gastronomía', color: 'red' },
          { value: 'SALUD', label: 'Salud', color: 'green' },
          { value: 'PROFESIONAL_INDEPENDIENTE', label: 'Profesional independiente', color: 'purple' },
          { value: 'ECOMMERCE', label: 'E-commerce', color: 'turquoise' },
          { value: 'OTRO', label: 'Otro', color: 'gray' },
        ],
      },
      { name: 'localidad', label: 'Localidad', type: 'TEXT', icon: 'IconMapPin' },
      {
        name: 'tieneWeb',
        label: 'Tiene web',
        type: 'BOOLEAN',
        icon: 'IconWorld',
        defaultValue: false,
        description: 'Señal principal de la prospección en frío',
      },
      { name: 'instagram', label: 'Instagram', type: 'LINKS', icon: 'IconBrandInstagram' },
      { name: 'canalOrigen', label: 'Canal de origen', type: 'SELECT', icon: 'IconArrowRight', options: CANAL_ORIGEN },
    ],
  },
  {
    nameSingular: 'person',
    fields: [
      { name: 'whatsapp', label: 'WhatsApp', type: 'PHONES', icon: 'IconBrandWhatsapp' },
      {
        name: 'idiomaPreferido',
        label: 'Idioma preferido',
        type: 'SELECT',
        icon: 'IconLanguage',
        defaultValue: "'ES'",
        options: [
          { value: 'ES', label: 'Español', color: 'sky' },
          { value: 'EN', label: 'Inglés', color: 'orange' },
        ],
      },
      { name: 'rolEnEmpresa', label: 'Rol en la empresa', type: 'TEXT', icon: 'IconId' },
    ],
  },
  {
    nameSingular: 'opportunity',
    fields: [
      {
        name: 'stage',
        label: 'Stage',
        type: 'SELECT',
        standard: true,
        options: [
          { value: 'NEW', label: 'Prospecto', color: 'gray' },
          { value: 'SCREENING', label: 'Contactado', color: 'sky' },
          { value: 'MEETING', label: 'Reunión', color: 'blue' },
          { value: 'PROPOSAL', label: 'Propuesta enviada', color: 'purple' },
          { value: 'NEGOTIATION', label: 'Negociación', color: 'orange' },
          { value: 'WON', label: 'Ganado', color: 'green', renamedFrom: 'CUSTOMER' },
          { value: 'LOST', label: 'Perdido', color: 'red' },
        ],
      },
      { name: 'amount', label: 'Amount', type: 'CURRENCY', standard: true, defaultValue: ars },
      { name: 'marca', label: 'Marca', type: 'SELECT', icon: 'IconTag', options: MARCAS, defaultValue: "'VENTUREBYTE'" },
      {
        name: 'servicios',
        label: 'Servicios',
        type: 'MULTI_SELECT',
        icon: 'IconTools',
        options: [
          { value: 'WEB', label: 'Web', color: 'blue' },
          { value: 'SOFTWARE_A_MEDIDA', label: 'Software a medida', color: 'purple' },
          { value: 'AUTOMATIZACION', label: 'Automatización', color: 'turquoise' },
          { value: 'NO_CODE', label: 'No-code', color: 'sky' },
          { value: 'UGC', label: 'UGC', color: 'pink' },
          { value: 'META_ADS', label: 'Meta Ads', color: 'orange' },
          { value: 'GESTION_REDES', label: 'Gestión de redes', color: 'yellow' },
          { value: 'MANTENIMIENTO_HOSTING', label: 'Mantenimiento/hosting', color: 'gray' },
        ],
      },
      { name: 'canalOrigen', label: 'Canal de origen', type: 'SELECT', icon: 'IconArrowRight', options: CANAL_ORIGEN },
      {
        name: 'motivoPerdida',
        label: 'Motivo de pérdida',
        type: 'SELECT',
        icon: 'IconThumbDown',
        description: 'Completar solo cuando la oportunidad pasa a Perdido',
        options: [
          { value: 'PRECIO', label: 'Precio', color: 'red' },
          { value: 'TIMING', label: 'Timing', color: 'orange' },
          { value: 'OTRO_PROVEEDOR', label: 'Eligió otro proveedor', color: 'purple' },
          { value: 'SIN_RESPUESTA', label: 'Sin respuesta', color: 'gray' },
          { value: 'NO_CALIFICABA', label: 'No calificaba', color: 'yellow' },
        ],
      },
    ],
  },
  {
    nameSingular: 'proyecto',
    custom: {
      namePlural: 'proyectos',
      labelSingular: 'Proyecto',
      labelPlural: 'Proyectos',
      icon: 'IconRocket',
      description: 'Trabajo que arranca cuando se gana una oportunidad',
    },
    fields: [
      {
        name: 'empresa',
        label: 'Empresa',
        type: 'RELATION',
        icon: 'IconBuildingSkyscraper',
        relation: { target: 'company', inverseLabel: 'Proyectos', inverseIcon: 'IconRocket' },
      },
      {
        name: 'oportunidad',
        label: 'Oportunidad',
        type: 'RELATION',
        icon: 'IconTargetArrow',
        relation: { target: 'opportunity', inverseLabel: 'Proyectos', inverseIcon: 'IconRocket' },
      },
      {
        name: 'estado',
        label: 'Estado',
        type: 'SELECT',
        icon: 'IconProgress',
        defaultValue: "'KICKOFF'",
        options: [
          { value: 'KICKOFF', label: 'Kickoff', color: 'gray' },
          { value: 'EN_DESARROLLO', label: 'En desarrollo', color: 'blue' },
          { value: 'REVISION_CLIENTE', label: 'Revisión cliente', color: 'orange' },
          { value: 'ENTREGADO', label: 'Entregado', color: 'green' },
          { value: 'EN_MANTENIMIENTO', label: 'En mantenimiento', color: 'purple' },
        ],
      },
      {
        name: 'responsable',
        label: 'Responsable',
        type: 'RELATION',
        icon: 'IconUserCircle',
        relation: { target: 'workspaceMember', inverseLabel: 'Proyectos a cargo', inverseIcon: 'IconRocket' },
      },
      { name: 'fechaEntregaEstimada', label: 'Entrega estimada', type: 'DATE', icon: 'IconCalendarDue' },
      { name: 'stack', label: 'Stack', type: 'TEXT', icon: 'IconCode' },
      { name: 'urlRepo', label: 'Repositorio', type: 'LINKS', icon: 'IconBrandGithub' },
      { name: 'urlProduccion', label: 'URL de producción', type: 'LINKS', icon: 'IconWorld' },
    ],
  },
  {
    nameSingular: 'abono',
    custom: {
      namePlural: 'abonos',
      labelSingular: 'Abono',
      labelPlural: 'Abonos',
      icon: 'IconRepeat',
      description: 'Ingresos recurrentes: hosting, mantenimiento, redes, campañas',
    },
    fields: [
      {
        name: 'empresa',
        label: 'Empresa',
        type: 'RELATION',
        icon: 'IconBuildingSkyscraper',
        relation: { target: 'company', inverseLabel: 'Abonos', inverseIcon: 'IconRepeat' },
      },
      {
        name: 'servicio',
        label: 'Servicio',
        type: 'SELECT',
        icon: 'IconTools',
        options: [
          { value: 'HOSTING', label: 'Hosting', color: 'gray' },
          { value: 'MANTENIMIENTO', label: 'Mantenimiento', color: 'blue' },
          { value: 'GESTION_REDES', label: 'Gestión de redes', color: 'pink' },
          { value: 'CAMPANAS', label: 'Campañas Meta Ads', color: 'orange' },
        ],
      },
      { name: 'montoMensual', label: 'Monto mensual', type: 'CURRENCY', icon: 'IconCash', defaultValue: ars },
      { name: 'fechaInicio', label: 'Fecha de inicio', type: 'DATE', icon: 'IconCalendar' },
      { name: 'activo', label: 'Activo', type: 'BOOLEAN', icon: 'IconCircleCheck', defaultValue: true },
    ],
  },
];

const PIPELINE_FIELDS = ['name', 'company', 'amount', 'servicios', 'owner', 'closeDate'];

const VIEWS: ViewDef[] = [
  {
    object: 'opportunity',
    name: 'Pipeline VentureByte',
    type: 'KANBAN',
    icon: 'IconLayoutKanban',
    groupBy: 'stage',
    fields: PIPELINE_FIELDS,
    filters: [{ field: 'marca', operand: 'IS', value: 'VENTUREBYTE' }],
  },
  {
    object: 'opportunity',
    name: 'Pipeline Venture Studio UGC',
    type: 'KANBAN',
    icon: 'IconLayoutKanban',
    groupBy: 'stage',
    fields: PIPELINE_FIELDS,
    filters: [{ field: 'marca', operand: 'IS', value: 'VENTURE_STUDIO_UGC' }],
  },
  {
    object: 'company',
    name: 'Prospección fría',
    type: 'TABLE',
    icon: 'IconSnowflake',
    fields: ['name', 'rubro', 'localidad', 'instagram', 'tieneWeb', 'canalOrigen', 'accountOwner'],
    filters: [
      { field: 'tieneWeb', operand: 'IS', value: false },
      { field: 'canalOrigen', operand: 'IS', value: 'PROSPECCION_FRIA' },
    ],
  },
  {
    object: 'proyecto',
    name: 'Proyectos por estado',
    type: 'KANBAN',
    icon: 'IconLayoutKanban',
    groupBy: 'estado',
    fields: ['name', 'empresa', 'responsable', 'fechaEntregaEstimada', 'stack'],
  },
  {
    object: 'abono',
    name: 'Abonos activos',
    type: 'TABLE',
    icon: 'IconRepeat',
    fields: ['name', 'empresa', 'servicio', 'montoMensual', 'fechaInicio', 'activo'],
    filters: [{ field: 'activo', operand: 'IS', value: true }],
  },
];

// ─── Estado actual ──────────────────────────────────────────────────────────────────────────────────────

type RemoteField = {
  id: string;
  name: string;
  type: string;
  label: string;
  icon: string | null;
  description: string | null;
  options: { id: string; value: string; label: string; color: string; position: number }[] | null;
  defaultValue: unknown;
};
type RemoteObject = { id: string; nameSingular: string; fields: RemoteField[] };

async function loadObjects(): Promise<Map<string, RemoteObject>> {
  const data = await gql('metadata', API_KEY, `{
    objects(paging: { first: 200 }) { edges { node {
      id nameSingular
      fields(paging: { first: 500 }) { edges { node { id name type label icon description options defaultValue } } }
    } } }
  }`);
  const map = new Map<string, RemoteObject>();
  for (const { node } of data.objects.edges) {
    map.set(node.nameSingular, { ...node, fields: node.fields.edges.map((e: any) => e.node) });
  }
  return map;
}

// ─── Aplicación ─────────────────────────────────────────────────────────────────────────────────────────

const PENDING = 'pendiente-dry-run';
const objects = await loadObjects();
const idOf = (objectName: string) => objects.get(objectName)?.id ?? PENDING;
const fieldOf = (objectName: string, fieldName: string) =>
  objects.get(objectName)?.fields.find((f) => f.name === fieldName);

// Opciones deseadas, reutilizando el id de la opción existente (por value o por su value anterior).
function desiredOptions(def: FieldDef, remote?: RemoteField) {
  return def.options!.map((o, position) => {
    const existing = remote?.options?.find((r) => r.value === o.value || r.value === o.renamedFrom);
    return { ...(existing ? { id: existing.id } : {}), value: o.value, label: o.label, color: o.color, position };
  });
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function ensureObject(def: ObjectDef) {
  if (!def.custom || objects.has(def.nameSingular)) return;
  log.create(`objeto ${def.nameSingular}`);
  if (DRY_RUN) return;
  await gql('metadata', API_KEY,
    `mutation($input: CreateOneObjectInput!) { createOneObject(input: $input) { id } }`,
    { input: { object: { nameSingular: def.nameSingular, ...def.custom } } });
  await reloadObjects();
}

async function reloadObjects() {
  objects.clear();
  for (const [k, v] of await loadObjects()) objects.set(k, v);
}

async function ensureField(objectName: string, def: FieldDef) {
  const remote = fieldOf(objectName, def.name);
  const label = `${objectName}.${def.name}`;

  if (!remote) {
    if (def.standard) throw new Error(`El campo estándar ${label} no existe en esta versión de Twenty`);
    log.create(`campo ${label} (${def.type})`);
    if (DRY_RUN) return;
    const field: Record<string, unknown> = {
      objectMetadataId: idOf(objectName),
      name: def.name,
      label: def.label,
      type: def.type,
      icon: def.icon,
      description: def.description,
    };
    if (def.options) field.options = desiredOptions(def);
    if (def.defaultValue !== undefined) field.defaultValue = def.defaultValue;
    if (def.relation) {
      field.relationCreationPayload = {
        type: 'MANY_TO_ONE',
        targetObjectMetadataId: idOf(def.relation.target),
        targetFieldLabel: def.relation.inverseLabel,
        targetFieldIcon: def.relation.inverseIcon,
      };
    }
    await gql('metadata', API_KEY,
      `mutation($input: CreateOneFieldMetadataInput!) { createOneField(input: $input) { id } }`,
      { input: { field } });
    return;
  }

  if (remote.type !== def.type) throw new Error(`${label} existe con tipo ${remote.type}, se esperaba ${def.type}`);

  // Diferencias a corregir. En campos estándar no se tocan label/icon (los traduce Twenty según el idioma).
  const update: Record<string, unknown> = {};
  const changes: string[] = [];
  if (!def.standard) {
    for (const key of ['label', 'icon', 'description'] as const) {
      if (def[key] !== undefined && def[key] !== remote[key]) {
        update[key] = def[key];
        changes.push(key);
      }
    }
  }
  if (def.options) {
    const wanted = desiredOptions(def, remote);
    const current = (remote.options ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(({ id, value, label, color, position }) => ({ id, value, label, color, position }));
    const comparable = (opts: any[]) => opts.map(({ value, label, color, position }) => ({ value, label, color, position }));
    if (!same(comparable(wanted), comparable(current))) {
      update.options = wanted;
      changes.push('opciones');
    }
  }
  if (def.defaultValue !== undefined && !same(def.defaultValue, remote.defaultValue)) {
    update.defaultValue = def.defaultValue;
    changes.push('default');
  }

  if (!changes.length) return log.ok(`campo ${label}`);
  log.update(`campo ${label}: ${changes.join(', ')}`);
  if (DRY_RUN) return;
  await gql('metadata', API_KEY,
    `mutation($id: UUID!, $update: UpdateFieldInput!) { updateOneField(input: { id: $id, update: $update }) { id } }`,
    { id: remote.id, update });
}

// Valor de filtro en el formato que usa el frontend de Twenty.
const filterValue = (value: string | boolean) => (typeof value === 'boolean' ? String(value) : JSON.stringify([value]));

async function ensureView(def: ViewDef, remoteViews: any[]) {
  const objectId = idOf(def.object);
  const title = `vista "${def.name}" (${def.object})`;
  let view = remoteViews.find((v) => v.objectMetadataId === objectId && v.name === def.name);

  if (!view) {
    log.create(title);
    if (DRY_RUN) {
      if (def.groupBy) log.create(`  columnas por ${def.groupBy} (las crea Twenty)`);
      return;
    }
    const { createView } = await gql('metadata', API_KEY,
      `mutation($input: CreateViewInput!) { createView(input: $input) { id } }`,
      {
        input: {
          name: def.name,
          objectMetadataId: objectId,
          type: def.type,
          icon: def.icon,
          visibility: 'WORKSPACE',
          ...(def.groupBy ? { mainGroupByFieldMetadataId: fieldOf(def.object, def.groupBy)!.id } : {}),
        },
      });
    view = { id: createView.id, viewFields: [], viewFilters: [], viewGroups: [] };
  } else {
    log.ok(title);
  }

  // Columnas / tarjetas: las que falten, en el orden definido.
  const missingFields = def.fields
    .map((name, position) => ({ field: fieldOf(def.object, name), name, position }))
    .filter(({ field }) => field && !view.viewFields.some((vf: any) => vf.fieldMetadataId === field.id));
  if (missingFields.length) {
    log.create(`  campos visibles: ${missingFields.map((f) => f.name).join(', ')}`);
    if (!DRY_RUN) {
      await gql('metadata', API_KEY,
        `mutation($inputs: [CreateViewFieldInput!]!) { createManyViewFields(inputs: $inputs) { id } }`,
        { inputs: missingFields.map(({ field, position }) => ({ viewId: view.id, fieldMetadataId: field!.id, isVisible: true, position })) });
    }
  }

  for (const filter of def.filters ?? []) {
    const field = fieldOf(def.object, filter.field);
    if (!field) continue; // solo pasa en dry-run con el campo todavía sin crear
    if (view.viewFilters.some((f: any) => f.fieldMetadataId === field.id)) continue;
    log.create(`  filtro ${filter.field} ${filter.operand} ${filter.value}`);
    if (DRY_RUN) continue;
    await gql('metadata', API_KEY,
      `mutation($input: CreateViewFilterInput!) { createViewFilter(input: $input) { id } }`,
      { input: { viewId: view.id, fieldMetadataId: field.id, operand: filter.operand, value: filterValue(filter.value) } });
  }

  if (def.groupBy) await ensureKanbanGroups(view.id, def.object, def.groupBy);
}

// Una columna por opción del campo agrupador, en el orden de las opciones. Twenty crea y sincroniza columnas
// por su cuenta al crear la vista o cambiar opciones, así que se relee el estado real antes de tocar nada.
async function ensureKanbanGroups(viewId: string, objectName: string, groupBy: string) {
  const def = OBJECTS.find((o) => o.nameSingular === objectName)?.fields.find((f) => f.name === groupBy);
  const values = def?.options?.map((o) => o.value) ?? fieldOf(objectName, groupBy)?.options?.map((o) => o.value) ?? [];
  const groups: { id: string; fieldValue: string; position: number }[] = DRY_RUN && viewId === PENDING
    ? []
    : (await loadViews()).find((v: any) => v.id === viewId)?.viewGroups ?? [];

  const missing = values
    .map((value, position) => ({ value, position }))
    .filter(({ value }) => !groups.some((g) => g.fieldValue === value));
  if (missing.length) {
    log.create(`  columnas: ${missing.map((m) => m.value).join(', ')}`);
    if (!DRY_RUN) {
      await gql('metadata', API_KEY,
        `mutation($inputs: [CreateViewGroupInput!]!) { createManyViewGroups(inputs: $inputs) { id } }`,
        { inputs: missing.map(({ value, position }) => ({ viewId, fieldValue: value, isVisible: true, position })) });
    }
  }

  const misplaced = groups.filter((g) => values.includes(g.fieldValue) && g.position !== values.indexOf(g.fieldValue));
  if (misplaced.length) {
    log.update(`  orden de columnas: ${misplaced.map((g) => g.fieldValue).join(', ')}`);
    if (!DRY_RUN) {
      await gql('metadata', API_KEY,
        `mutation($inputs: [UpdateViewGroupInput!]!) { updateManyViewGroups(inputs: $inputs) { id } }`,
        { inputs: misplaced.map((g) => ({ id: g.id, update: { position: values.indexOf(g.fieldValue) } })) });
    }
  }
}

async function loadViews(): Promise<any[]> {
  const data = await gql('metadata', API_KEY, `{ getViews {
    id name objectMetadataId type mainGroupByFieldMetadataId
    viewFields { fieldMetadataId } viewFilters { fieldMetadataId } viewGroups { id fieldValue position }
  } }`);
  return data.getViews;
}

console.log(`Esquema → ${process.env.TWENTY_URL}${DRY_RUN ? '  (DRY RUN: no se modifica nada)' : ''}`);

log.section('Objetos y campos');
for (const def of OBJECTS) {
  await ensureObject(def);
  if (!objects.has(def.nameSingular)) {
    for (const field of def.fields) log.create(`campo ${def.nameSingular}.${field.name} (${field.type})`);
    continue;
  }
  for (const field of def.fields) await ensureField(def.nameSingular, field);
}

if (!DRY_RUN) await reloadObjects();

log.section('Vistas');
const views = await loadViews();
for (const def of VIEWS) await ensureView(def, views);

// Kanbans existentes agrupados por etapa (ej. "By Stage" estándar): que tengan las columnas nuevas.
const stageField = fieldOf('opportunity', 'stage');
for (const view of views) {
  if (view.type !== 'KANBAN' || view.mainGroupByFieldMetadataId !== stageField?.id) continue;
  if (VIEWS.some((v) => v.name === view.name)) continue;
  log.ok(`vista "${view.name}" (opportunity)`);
  await ensureKanbanGroups(view.id, 'opportunity', 'stage');
}

console.log(`\nListo${DRY_RUN ? ' (dry-run)' : ''}.`);
