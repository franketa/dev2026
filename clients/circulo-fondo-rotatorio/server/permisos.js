// Roles y matriz de permisos. La matriz por defecto sale del relevamiento; el superadmin la cambia desde
// Administración → Permisos (tabla `roles_permisos`). El servidor controla cada permiso en los servicios,
// no sólo en las rutas: el frontend sólo esconde botones.

const ROLES = {
  superadmin: { nombre: 'Superadmin (VentureByte)', ambito: 'sistema' },
  central_admin: { nombre: 'Administrador / Tesorero', ambito: 'central' },
  presidente: { nombre: 'Presidente', ambito: 'central' },
  jefe_sede: { nombre: 'Jefe de sede', ambito: 'sede' },
  administrativo: { nombre: 'Administrativo', ambito: 'sede' },
  carga: { nombre: 'Usuario de carga', ambito: 'sede' }
};

const PERMISOS = {
  'sedes.ver_todas': 'Ver todas las sedes',
  'admin.sedes': 'Administrar sedes',
  'admin.usuarios': 'Administrar usuarios',
  'admin.rubros': 'Administrar rubros',
  'admin.parametros': 'Parámetros, alícuotas y datos del Círculo',
  'admin.permisos': 'Matriz de permisos y funciones opcionales',
  'central.ingresos': 'Registrar ingresos a la cuenta de la Central',
  'fondos.asignar': 'Asignar el fondo mensual a las sedes',
  'fondos.pedir_extra': 'Pedir fondos extra',
  'fondos.autorizar_extra': 'Autorizar o rechazar fondos extra',
  'fondos.extraccion': 'Extracciones y depósitos (banco ↔ efectivo)',
  'gastos.cargar': 'Cargar gastos de su sede',
  'gastos.pago_central': 'Pago directo de la Central con cargo a una sede',
  'gastos.retenciones': 'Registrar pagos sobre el umbral de retención',
  'gastos.corregir': 'Anular y corregir gastos',
  'proveedores.alta': 'Dar de alta proveedores',
  'solicitudes.crear': 'Crear solicitudes de gasto',
  'solicitudes.resolver': 'Resolver solicitudes (panel diario)',
  'solicitudes.resolver_escaladas': 'Resolver solicitudes en revisión',
  'rendicion.cerrar': 'Cerrar, firmar y enviar la rendición',
  'rendicion.reabrir': 'Reabrir un período cerrado',
  'rendiciones.recibidas': 'Ver las rendiciones recibidas',
  'auditoria.ver': 'Ver la auditoría'
};

const MATRIZ_INICIAL = {
  superadmin: ['sedes.ver_todas', 'admin.sedes', 'admin.usuarios', 'admin.rubros', 'admin.parametros', 'admin.permisos',
    'proveedores.alta', 'rendiciones.recibidas', 'auditoria.ver'],
  central_admin: ['sedes.ver_todas', 'admin.rubros', 'central.ingresos', 'fondos.asignar', 'gastos.pago_central',
    'gastos.retenciones', 'gastos.corregir', 'proveedores.alta', 'solicitudes.resolver', 'solicitudes.resolver_escaladas',
    'rendicion.reabrir', 'rendiciones.recibidas', 'auditoria.ver'],
  presidente: ['sedes.ver_todas', 'fondos.autorizar_extra', 'proveedores.alta', 'solicitudes.resolver_escaladas',
    'rendiciones.recibidas', 'auditoria.ver'],
  jefe_sede: ['fondos.pedir_extra', 'fondos.extraccion', 'gastos.cargar', 'gastos.retenciones', 'gastos.corregir',
    'proveedores.alta', 'solicitudes.crear', 'rendicion.cerrar', 'auditoria.ver'],
  administrativo: ['fondos.extraccion', 'gastos.cargar', 'gastos.retenciones', 'gastos.corregir', 'proveedores.alta'],
  carga: ['gastos.cargar']
};

// El superadmin no puede sacarse a sí mismo la administración de permisos (quedaría sin salida).
const INTOCABLES = { superadmin: ['admin.permisos'] };

module.exports = { ROLES, PERMISOS, MATRIZ_INICIAL, INTOCABLES };
