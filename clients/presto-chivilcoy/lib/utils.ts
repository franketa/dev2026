import type { Schedule, Order, BusinessStatus } from './types'
import { DAYS, DAYS_DISPLAY } from './constants'
import { PICKUP_OPTIONS } from './constants'

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function getDayName(): string {
  const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
  return days[new Date().getDay()]
}

export function isBusinessOpen(schedule: Schedule, isManuallyClosed: boolean): BusinessStatus {
  if (isManuallyClosed) {
    return { isOpen: false, todaySchedule: 'Cerrado momentáneamente' }
  }

  const today = getDayName()
  const daySchedule = schedule[today]

  if (!daySchedule || !daySchedule.enabled) {
    const nextOpen = findNextOpenTime(schedule, today)
    return {
      isOpen: false,
      nextOpenTime: nextOpen,
      todaySchedule: 'Cerrado hoy',
    }
  }

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const todayStr = daySchedule.shifts
    .map(s => `${s.open}-${s.close}`)
    .join(' · ')

  for (const shift of daySchedule.shifts) {
    const open = timeToMinutes(shift.open)
    let close = timeToMinutes(shift.close)

    // Handle midnight and after-midnight closing (e.g., 24:00, 01:00)
    if (close <= open) {
      close += 24 * 60
    }

    if (currentMinutes >= open && currentMinutes < close) {
      return { isOpen: true, todaySchedule: todayStr }
    }

    // Also check if we're past midnight but still in a shift from "yesterday"
    if (close > 24 * 60 && currentMinutes + 24 * 60 >= open && currentMinutes + 24 * 60 < close) {
      return { isOpen: true, todaySchedule: todayStr }
    }
  }

  const nextOpen = findNextOpenTime(schedule, today)
  return {
    isOpen: false,
    nextOpenTime: nextOpen,
    todaySchedule: todayStr,
  }
}

function findNextOpenTime(schedule: Schedule, currentDay: string): string | undefined {
  const dayIndex = DAYS.indexOf(currentDay as typeof DAYS[number])
  if (dayIndex === -1) return undefined

  for (let i = 0; i < 7; i++) {
    const checkIndex = (dayIndex + (i === 0 ? 0 : i)) % 7
    const day = DAYS[checkIndex]
    const daySchedule = schedule[day]

    if (daySchedule?.enabled && daySchedule.shifts.length > 0) {
      if (i === 0) {
        // Same day - check if there's a later shift
        const now = new Date()
        const currentMinutes = now.getHours() * 60 + now.getMinutes()
        for (const shift of daySchedule.shifts) {
          const open = timeToMinutes(shift.open)
          if (open > currentMinutes) {
            return `Hoy a las ${shift.open}`
          }
        }
      } else {
        const displayName = DAYS_DISPLAY[day]
        return `${displayName} a las ${daySchedule.shifts[0].open}`
      }
    }
  }
  return undefined
}

export function buildWhatsAppUrl(phone: string, order: Order): string {
  const pickupLabel = PICKUP_OPTIONS.find(o => o.value === order.pickup_time)?.label || order.pickup_time
  const paymentLabel = order.payment_method === 'cash' ? 'Efectivo' : 'MercadoPago / Transferencia'

  const itemsText = order.items
    .map(item => `  • ${item.quantity}x ${item.name} — ${formatPrice(item.price * item.quantity)}`)
    .join('\n')

  let message = `🛒 *Nuevo Pedido #${order.order_number}*\n\n`
  message += `👤 ${order.customer_name}\n`
  message += `📱 ${order.customer_phone}\n\n`
  message += `*Productos:*\n${itemsText}\n\n`
  message += `💰 *Total: ${formatPrice(order.total)}*\n`
  message += `💳 Pago: ${paymentLabel}\n`
  message += `⏰ Retiro: ${pickupLabel}\n`

  if (order.notes) {
    message += `\n📝 Notas: ${order.notes}\n`
  }

  message += `\n_Pedido recibido desde Presto Chivilcoy Online_`

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}
