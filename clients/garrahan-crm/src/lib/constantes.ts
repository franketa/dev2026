/** Vocabulario del negocio. Los textos son los que usa Garrahan. */

export type Tono = "verde" | "azul" | "violeta" | "naranja" | "rojo" | "amarillo" | "gris" | "celeste";

export const ESTADOS_VEHICULO: Record<string, { label: string; tono: Tono }> = {
  disponible:   { label: "Disponible",   tono: "verde" },
  reservado:    { label: "Reservado",    tono: "azul" },
  en_revision:  { label: "En Revisión",  tono: "violeta" },
  en_taller:    { label: "En Taller",    tono: "naranja" },
  en_detailing: { label: "En Detailing", tono: "celeste" },
  vendido:      { label: "Vendido",      tono: "gris" },
  baja:         { label: "Dado de baja", tono: "rojo" },
};

export const ALERTAS: Record<string, { label: string; tono: Tono }> = {
  verde:    { label: "OK",        tono: "verde" },
  amarillo: { label: "+30 días",  tono: "amarillo" },
  naranja:  { label: "+60 días",  tono: "naranja" },
  rojo:     { label: "+90 días",  tono: "rojo" },
};

export const TIPO_ADQUISICION: Record<string, string> = {
  compra_directa: "Compra directa",
  permuta: "Permuta",
  consignacion: "Consignación",
};

/* ---------------------------------------------------------------- leads
   Dos niveles, como AutoGestion: la etapa agrupa estados. Asi el vendedor
   ve el avance y el dueño ve el embudo.                                    */
export const ETAPAS_LEAD = [
  { valor: "captacion",    label: "Captación",    estados: ["nuevo", "contactado", "sin_respuesta"] },
  { valor: "calificacion", label: "Calificación", estados: ["calificado"] },
  { valor: "negociacion",  label: "Negociación",  estados: ["visita_agendada", "en_negociacion"] },
  { valor: "cierre",       label: "Cierre",       estados: ["reservado", "vendido"] },
  { valor: "cerrado",      label: "Cerrados",     estados: ["postergado", "perdido"] },
];

export const ESTADOS_LEAD: Record<string, { label: string; tono: Tono; etapa: string }> = {
  nuevo:           { label: "Nuevo",           tono: "azul",     etapa: "captacion" },
  contactado:      { label: "Contactado",      tono: "amarillo", etapa: "captacion" },
  sin_respuesta:   { label: "Sin respuesta",   tono: "gris",     etapa: "captacion" },
  calificado:      { label: "Calificado",      tono: "celeste",  etapa: "calificacion" },
  visita_agendada: { label: "Visita agendada", tono: "violeta",  etapa: "negociacion" },
  en_negociacion:  { label: "En negociación",  tono: "naranja",  etapa: "negociacion" },
  reservado:       { label: "Reservado",       tono: "azul",     etapa: "cierre" },
  vendido:         { label: "Vendido",         tono: "verde",    etapa: "cierre" },
  postergado:      { label: "Postergado",      tono: "gris",     etapa: "cerrado" },
  perdido:         { label: "Perdido",         tono: "rojo",     etapa: "cerrado" },
};

export const ORIGENES_LEAD: Record<string, string> = {
  showroom: "Showroom",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  web: "Sitio Web",
  portal: "Portal",
  referido: "Referido",
  telefono: "Teléfono",
  otro: "Otro",
};

/* --------------------------------------------------------------- ventas */
export const ESTADOS_VENTA: Record<string, { label: string; tono: Tono }> = {
  reserva:    { label: "Reserva",    tono: "azul" },
  en_proceso: { label: "En Proceso", tono: "amarillo" },
  completada: { label: "Completada", tono: "verde" },
  cancelada:  { label: "Cancelada",  tono: "rojo" },
};

export const MEDIOS_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  permuta: "Permuta",
  financiacion: "Financiación",
  cheque: "Cheque",
  tarjeta: "Tarjeta",
  mercadopago: "Mercado Pago",
  otro: "Otro",
};

export const ESTADOS_TRAMITE: Record<string, string> = {
  iniciado: "Iniciado",
  cert_08: "08 certificado",
  presentado: "Presentado",
  inscripto: "Inscripto",
  entregado: "Entregado",
};

/* --------------------------------------------------------------- taller */
export const ESTADOS_TALLER: Record<string, { label: string; tono: Tono }> = {
  en_revision:  { label: "En Revisión",  tono: "violeta" },
  en_taller:    { label: "En Taller",    tono: "naranja" },
  en_detailing: { label: "En Detailing", tono: "celeste" },
  completado:   { label: "Completado",   tono: "verde" },
};

/** Checklist de preparación por defecto. Es el que se carga en cada orden. */
export const CHECKLIST_TALLER = [
  "Revisión mecánica general",
  "Cambio de aceite y filtros",
  "Frenos y neumáticos",
  "Chapa y pintura",
  "Tapizado e interior",
  "Detailing / pulido",
  "Documentación y VTV",
  "Control final",
];

/* ----------------------------------------------------------------- caja */
export const CATEGORIAS: { valor: string; label: string; tipo: "ingreso" | "gasto" }[] = [
  { valor: "venta_usado",    label: "Operación usado",    tipo: "ingreso" },
  { valor: "venta_0km",      label: "Operación 0km",      tipo: "ingreso" },
  { valor: "servicios_taller", label: "Servicios/Taller", tipo: "ingreso" },
  { valor: "otros_ingresos", label: "Otros ingresos",     tipo: "ingreso" },
  { valor: "compra_unidad",  label: "Compra de unidades", tipo: "gasto" },
  { valor: "prep_unidad",    label: "Prep. de unidades",  tipo: "gasto" },
  { valor: "sueldos",        label: "Sueldos y RRSS",     tipo: "gasto" },
  { valor: "alquiler",       label: "Alquiler",           tipo: "gasto" },
  { valor: "publicidad",     label: "Publicidad",         tipo: "gasto" },
  { valor: "servicios",      label: "Servicios",          tipo: "gasto" },
  { valor: "impuestos",      label: "Impuestos",          tipo: "gasto" },
  { valor: "patentes",       label: "Patentes",           tipo: "gasto" },
  { valor: "gastos_banco",   label: "Gastos bancarios",   tipo: "gasto" },
  { valor: "viaticos",       label: "Viáticos/Movilidad", tipo: "gasto" },
  { valor: "otros_gastos",   label: "Otros gastos",       tipo: "gasto" },
];

/** La compra y la preparación NO son gasto del mes: son costo de la unidad. */
export const CATEGORIAS_INVENTARIO = ["compra_unidad", "prep_unidad"];

export const TIPOS_COSTO = [
  "Mecánica", "Chapa y pintura", "Detailing", "Repuestos", "Neumáticos",
  "Gestoría", "Transporte", "Administrativo", "Publicidad", "Otro",
];
