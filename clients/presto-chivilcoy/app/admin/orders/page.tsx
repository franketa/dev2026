'use client'

import { useState, useEffect, useCallback } from 'react'
import { MessageCircle, X, ChevronRight, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { formatPrice } from '@/lib/utils'
import { ORDER_STATUSES, NEXT_STATUS, PICKUP_OPTIONS } from '@/lib/constants'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { Order, OrderStatus, Settings } from '@/lib/types'

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)

  const fetchOrders = useCallback(async () => {
    const supabase = createClient()
    const ordersRes = await supabase.from('orders').select('*').order('created_at', { ascending: false })
    const settingsRes = await supabase.from('settings').select('*').limit(1).single()
    if (ordersRes.data) setOrders(ordersRes.data)
    if (settingsRes.data) setSettings(settingsRes.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 15000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  async function updateStatus(orderId: string, newStatus: OrderStatus) {
    const supabase = createClient()
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)

    if (error) {
      console.error('Error updating order status:', error)
      alert('Error al actualizar el pedido: ' + error.message)
      return
    }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
  }

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-text">Pedidos</h1>
        <Button variant="ghost" size="sm" onClick={fetchOrders}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4 md:mx-0 md:px-0">
        <button
          onClick={() => setFilter('all')}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
            filter === 'all' ? 'bg-primary text-white' : 'bg-card text-text-secondary border border-border'
          }`}
        >
          Todo ({orders.length})
        </button>
        {ORDER_STATUSES.map(s => {
          const count = orders.filter(o => o.status === s.value).length
          return (
            <button
              key={s.value}
              onClick={() => setFilter(s.value)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                filter === s.value ? 'bg-primary text-white' : 'bg-card text-text-secondary border border-border'
              }`}
            >
              {s.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Orders */}
      <div className="space-y-4">
        {filtered.length === 0 && (
          <p className="text-center text-text-muted py-12 text-sm">No hay pedidos</p>
        )}

        {filtered.map(order => {
          const statusInfo = ORDER_STATUSES.find(s => s.value === order.status)
          const nextStatus = NEXT_STATUS[order.status]
          const nextStatusInfo = nextStatus ? ORDER_STATUSES.find(s => s.value === nextStatus) : null
          const pickupLabel = PICKUP_OPTIONS.find(o => o.value === order.pickup_time)?.label || order.pickup_time
          const isPending = order.status === 'pending'

          return (
            <div
              key={order.id}
              className={`bg-card rounded-xl border p-4 space-y-3 ${
                isPending ? 'border-warning ring-1 ring-warning/20' : 'border-border'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg text-text">#{order.order_number}</span>
                    <Badge className={statusInfo?.color}>{statusInfo?.label}</Badge>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    {new Date(order.created_at).toLocaleString('es-AR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
                <span className="text-lg font-bold text-primary">{formatPrice(order.total)}</span>
              </div>

              {/* Customer */}
              <div className="text-sm">
                <p className="font-medium text-text">{order.customer_name}</p>
                <p className="text-text-secondary">{order.customer_phone}</p>
              </div>

              {/* Items */}
              <div className="text-sm text-text-secondary space-y-0.5">
                {order.items.map((item, idx) => (
                  <p key={idx}>{item.quantity}x {item.name}</p>
                ))}
              </div>

              {/* Meta */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                <span>Pago: {order.payment_method === 'cash' ? 'Efectivo' : 'MercadoPago'}</span>
                <span>Retiro: {pickupLabel}</span>
              </div>

              {order.notes && (
                <p className="text-sm text-warning bg-warning/10 rounded-lg px-3 py-2">
                  {order.notes}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                {nextStatusInfo && (
                  <Button
                    size="sm"
                    onClick={() => updateStatus(order.id, nextStatus!)}
                  >
                    {nextStatusInfo.label}
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                )}
                {order.status !== 'delivered' && order.status !== 'cancelled' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateStatus(order.id, 'cancelled')}
                    className="text-danger hover:bg-red-50"
                  >
                    <X className="w-3 h-3" />
                    Cancelar
                  </Button>
                )}
                {settings?.whatsapp_number && (
                  <a
                    href={`https://wa.me/${order.customer_phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto"
                  >
                    <Button variant="ghost" size="sm">
                      <MessageCircle className="w-3.5 h-3.5" />
                    </Button>
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
