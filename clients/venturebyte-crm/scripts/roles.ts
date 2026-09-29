// Roles del CRM como código. Idempotente: crea los roles que faltan y corrige permisos que difieren.
// El rol Admin es el estándar de Twenty (lo tiene el primer usuario) y no se toca.
//
//   npm run roles -- --dry-run
//   npm run roles -- --env .env.prod
//
// OJO: cambiar permisos de un rol que ya usa el equipo es una acción sobre producción; correr --dry-run primero.
import { DRY_RUN, gql, log, requireEnv } from './lib/twenty.ts';

const API_KEY = requireEnv('TWENTY_ADMIN_API_KEY');

// none = no ve el objeto · read = solo lectura · edit = crear y editar (en Twenty es el mismo permiso)
// full = edit + borrar (soft delete, recuperable desde la papelera). Destruir definitivamente: solo Admin.
type Access = 'none' | 'read' | 'edit' | 'full';
type RoleDef = {
  label: string;
  description: string;
  icon: string;
  forApiKeys?: boolean;
  tools: boolean; // herramientas de usuario: subir archivos, importar/exportar CSV, vistas, IA, etc.
  base: Access; // acceso por defecto a todos los objetos
  objects?: Record<string, Access>; // excepciones por objeto
  hiddenFields?: string[]; // "objeto.campo" que el rol no ve
};

const ROLES: RoleDef[] = [
  {
    label: 'Comercial',
    description: 'Todo el pipeline comercial de ambas marcas',
    icon: 'IconBriefcase',
    tools: true,
    base: 'full',
    objects: { workflow: 'read' },
  },
  {
    label: 'Desarrollo',
    description: 'Ve empresas y contactos, trabaja sobre Proyectos. No ve montos',
    icon: 'IconCode',
    tools: true,
    base: 'none',
    objects: { company: 'read', person: 'read', proyecto: 'full', task: 'full', note: 'full' },
    hiddenFields: ['company.annualRevenue'],
  },
  {
    label: 'Contenido y Redes',
    description: 'Pipeline de Venture Studio UGC (vista filtrada) y Proyectos',
    icon: 'IconBrandInstagram',
    tools: true,
    base: 'none',
    objects: { company: 'edit', person: 'edit', opportunity: 'edit', proyecto: 'full', task: 'full', note: 'full' },
  },
  {
    label: 'Bot',
    description: 'Grok Bot vía API/MCP: crea y edita, nunca borra ni toca configuración',
    icon: 'IconRobot',
    forApiKeys: true,
    tools: false,
    base: 'read',
    objects: { company: 'edit', person: 'edit', opportunity: 'edit', note: 'edit', task: 'edit' },
  },
];

const flags = (a: Access) => ({
  canReadObjectRecords: a !== 'none',
  canUpdateObjectRecords: a === 'edit' || a === 'full',
  canSoftDeleteObjectRecords: a === 'full',
  canDestroyObjectRecords: false,
});

// ─── Estado actual ──────────────────────────────────────────────────────────────────────────────────────

const meta = await gql('metadata', API_KEY, `{
  objects(paging: { first: 200 }) { edges { node {
    id nameSingular isSystem fields(paging: { first: 500 }) { edges { node { id name } } }
  } } }
  getRoles {
    id label description icon canUpdateAllSettings canAccessAllTools canReadAllObjectRecords canUpdateAllObjectRecords
    canSoftDeleteAllObjectRecords canDestroyAllObjectRecords canBeAssignedToUsers canBeAssignedToAgents canBeAssignedToApiKeys
    permissionFlags { flag }
    objectPermissions { objectMetadataId canReadObjectRecords canUpdateObjectRecords canSoftDeleteObjectRecords canDestroyObjectRecords }
    fieldPermissions { fieldMetadataId canReadFieldValue canUpdateFieldValue }
  }
}`);
const objects = meta.objects.edges.map((e: any) => e.node);
const objectId = (name: string) => {
  const o = objects.find((x: any) => x.nameSingular === name);
  if (!o) throw new Error(`No existe el objeto ${name}. ¿Corriste npm run schema primero?`);
  return o.id;
};
const fieldRef = (path: string) => {
  const [objectName, fieldName] = path.split('.');
  const o = objects.find((x: any) => x.nameSingular === objectName);
  const f = o?.fields.edges.find((e: any) => e.node.name === fieldName)?.node;
  if (!f) throw new Error(`No existe el campo ${path}`);
  return { objectMetadataId: o.id, fieldMetadataId: f.id };
};

// ─── Aplicación ─────────────────────────────────────────────────────────────────────────────────────────

console.log(`Roles → ${process.env.TWENTY_URL}${DRY_RUN ? '  (DRY RUN: no se modifica nada)' : ''}`);

for (const def of ROLES) {
  log.section(`Rol ${def.label}`);
  const base = flags(def.base);
  const roleFields = {
    label: def.label,
    description: def.description,
    icon: def.icon,
    canUpdateAllSettings: false,
    canAccessAllTools: def.tools,
    canReadAllObjectRecords: base.canReadObjectRecords,
    canUpdateAllObjectRecords: base.canUpdateObjectRecords,
    canSoftDeleteAllObjectRecords: base.canSoftDeleteObjectRecords,
    canDestroyAllObjectRecords: false,
    canBeAssignedToUsers: !def.forApiKeys,
    canBeAssignedToAgents: false,
    canBeAssignedToApiKeys: !!def.forApiKeys,
  };

  let role = meta.getRoles.find((r: any) => r.label === def.label);
  if (!role) {
    log.create(`rol ${def.label}`);
    if (DRY_RUN) {
      role = { id: 'pendiente-dry-run', permissionFlags: [], objectPermissions: [], fieldPermissions: [] };
    } else {
      const { createOneRole } = await gql('metadata', API_KEY,
        `mutation($input: CreateRoleInput!) { createOneRole(createRoleInput: $input) { id } }`,
        { input: roleFields });
      role = { id: createOneRole.id, permissionFlags: [], objectPermissions: [], fieldPermissions: [] };
    }
  } else {
    const changed = Object.keys(roleFields).filter((k) => role[k] !== (roleFields as any)[k]);
    if (changed.length) {
      log.update(`rol ${def.label}: ${changed.join(', ')}`);
      if (!DRY_RUN) {
        await gql('metadata', API_KEY,
          `mutation($input: UpdateRoleInput!) { updateOneRole(updateRoleInput: $input) { id } }`,
          { input: { id: role.id, update: roleFields } });
      }
    } else {
      log.ok(`rol ${def.label}`);
    }
  }

  // Excepciones por objeto: solo se mandan las que difieren de lo que hay.
  const wanted = Object.entries(def.objects ?? {}).map(([name, access]) => ({ name, objectMetadataId: objectId(name), ...flags(access) }));
  const stale = wanted.filter((w) => {
    const current = role.objectPermissions.find((p: any) => p.objectMetadataId === w.objectMetadataId);
    return !current || (['canReadObjectRecords', 'canUpdateObjectRecords', 'canSoftDeleteObjectRecords', 'canDestroyObjectRecords'] as const)
      .some((k) => current[k] !== w[k]);
  });
  if (stale.length) {
    log.update(`permisos por objeto: ${stale.map((s) => `${s.name}=${def.objects![s.name]}`).join(', ')}`);
    if (!DRY_RUN) {
      await gql('metadata', API_KEY,
        `mutation($input: UpsertObjectPermissionsInput!) { upsertObjectPermissions(upsertObjectPermissionsInput: $input) { objectMetadataId } }`,
        { input: { roleId: role.id, objectPermissions: wanted.map(({ name, ...p }) => p) } });
    }
  } else if (wanted.length) {
    log.ok(`permisos por objeto (${wanted.length})`);
  }

  // Campos ocultos.
  const hidden = (def.hiddenFields ?? []).map((path) => ({ path, ...fieldRef(path) }));
  const missingHidden = hidden.filter((h) => !role.fieldPermissions.some(
    (p: any) => p.fieldMetadataId === h.fieldMetadataId && p.canReadFieldValue === false && p.canUpdateFieldValue === false));
  if (missingHidden.length) {
    log.update(`campos ocultos: ${missingHidden.map((h) => h.path).join(', ')}`);
    if (!DRY_RUN) {
      await gql('metadata', API_KEY,
        `mutation($input: UpsertFieldPermissionsInput!) { upsertFieldPermissions(upsertFieldPermissionsInput: $input) { id } }`,
        { input: { roleId: role.id, fieldPermissions: hidden.map(({ path, ...ids }) => ({ ...ids, canReadFieldValue: false, canUpdateFieldValue: false })) } });
    }
  } else if (hidden.length) {
    log.ok(`campos ocultos (${hidden.length})`);
  }
}

console.log(`\nListo${DRY_RUN ? ' (dry-run)' : ''}.`);
