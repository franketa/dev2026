export interface Settings {
  id: string
  business_name: string
  description: string
  address: string
  whatsapp_number: string
  mp_alias: string
  mp_info: string
  min_order: number
  schedule: Schedule
  is_manually_closed: boolean
  created_at: string
  updated_at: string
}

export interface Schedule {
  [key: string]: DaySchedule
}

export interface DaySchedule {
  enabled: boolean
  shifts: Shift[]
}

export interface Shift {
  open: string
  close: string
}

export interface Category {
  id: string
  name: string
  emoji: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface Product {
  id: string
  name: string
  price: number
  category_id: string | null
  is_available: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CartItem {
  product_id: string
  name: string
  price: number
  quantity: number
}

export interface OrderItem {
  product_id: string
  name: string
  price: number
  quantity: number
}

export interface Order {
  id: string
  order_number: number
  customer_name: string
  customer_phone: string
  items: OrderItem[]
  total: number
  payment_method: 'cash' | 'mercadopago'
  pickup_time: string
  notes: string
  status: OrderStatus
  created_at: string
  updated_at: string
}

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'

export interface BusinessStatus {
  isOpen: boolean
  nextOpenTime?: string
  todaySchedule: string
}

export type PaymentMethod = 'cash' | 'mercadopago'

export type PickupTime = 'asap' | '30' | '60' | '90' | '120'
