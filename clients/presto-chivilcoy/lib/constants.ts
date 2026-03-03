import type { PickupTime, OrderStatus } from './types'

export const PICKUP_OPTIONS: { value: PickupTime; label: string }[] = [
  { value: 'asap', label: 'Lo antes posible' },
  { value: '30', label: 'En 30 minutos' },
  { value: '60', label: 'En 1 hora' },
  { value: '90', label: 'En 1 hora y media' },
  { value: '120', label: 'En 2 horas' },
]

export const ORDER_STATUSES: { value: OrderStatus; label: string; color: string }[] = [
  { value: 'pending', label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'confirmed', label: 'Confirmado', color: 'bg-blue-100 text-blue-800' },
  { value: 'preparing', label: 'Preparando', color: 'bg-orange-100 text-orange-800' },
  { value: 'ready', label: 'Listo', color: 'bg-green-100 text-green-800' },
  { value: 'delivered', label: 'Entregado', color: 'bg-gray-100 text-gray-800' },
  { value: 'cancelled', label: 'Cancelado', color: 'bg-red-100 text-red-800' },
]

export const NEXT_STATUS: Record<string, OrderStatus | null> = {
  pending: 'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
  delivered: null,
  cancelled: null,
}

export const DAYS = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
] as const

export const DAYS_DISPLAY: Record<string, string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo',
}

export const DEFAULT_SCHEDULE = {
  lunes: { enabled: true, shifts: [{ open: '11:00', close: '15:00' }, { open: '19:00', close: '23:00' }] },
  martes: { enabled: true, shifts: [{ open: '11:00', close: '15:00' }, { open: '19:00', close: '23:00' }] },
  miercoles: { enabled: true, shifts: [{ open: '11:00', close: '15:00' }, { open: '19:00', close: '23:00' }] },
  jueves: { enabled: true, shifts: [{ open: '11:00', close: '15:00' }, { open: '19:00', close: '23:00' }] },
  viernes: { enabled: true, shifts: [{ open: '11:00', close: '15:00' }, { open: '19:30', close: '23:30' }] },
  sabado: { enabled: true, shifts: [{ open: '19:00', close: '24:00' }] },
  domingo: { enabled: false, shifts: [] },
}
