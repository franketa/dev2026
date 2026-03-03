'use client'

import { useState, useEffect, use } from 'react'
import { CheckCircle, MessageCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { formatPrice, buildWhatsAppUrl } from '@/lib/utils'
import { PICKUP_OPTIONS } from '@/lib/constants'
import { Button } from '@/components/ui/Button'
import type { Order, Settings } from '@/lib/types'

export default function ConfirmationPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params)
  const [order, setOrder] = useState<Order | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Load order from localStorage (saved by checkout page)
      const stored = localStorage.getItem(`presto-order-${orderId}`)
      if (stored) {
        const parsed = JSON.parse(stored)
        // We don't have order_number from DB, so we leave it out
        setOrder({
          ...parsed,
          order_number: 0,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as Order)
      }

      // Load settings for WhatsApp number
      const supabase = createClient()
      const { data } = await supabase.from('settings').select('*').limit(1).single()
      if (data) setSettings(data)
      setLoading(false)
    }
    load()
  }, [orderId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-bg px-4">
        <p className="text-text-secondary mb-4">Pedido no encontrado</p>
        <Link href="/">
          <Button variant="secondary">Volver al menú</Button>
        </Link>
      </div>
    )
  }

  const pickupLabel = PICKUP_OPTIONS.find(o => o.value === order.pickup_time)?.label || order.pickup_time
  const paymentLabel = order.payment_method === 'cash' ? 'Efectivo' : 'MercadoPago / Transferencia'

  const whatsappUrl = settings?.whatsapp_number
    ? buildWhatsAppUrl(settings.whatsapp_number, order)
    : null

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-header">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-white/70 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold text-white">Pedido confirmado</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="text-center mb-8 animate-slide-up">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-success" />
          </div>
          <h2 className="text-2xl font-bold text-text mb-1">¡Pedido enviado!</h2>
          <p className="text-sm text-text-secondary mt-2">
            Tu pedido fue registrado correctamente
          </p>
        </div>

        {/* Summary card */}
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4 mb-6 animate-slide-up" style={{ animationDelay: '100ms' }}>
          <div className="space-y-2">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-text-secondary">{item.quantity}x {item.name}</span>
                <span className="font-medium">{formatPrice(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-3 flex justify-between">
            <span className="font-semibold">Total</span>
            <span className="text-lg font-bold text-primary">{formatPrice(order.total)}</span>
          </div>
          <div className="border-t border-border pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Pago</span>
              <span className="font-medium">{paymentLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Retiro</span>
              <span className="font-medium">{pickupLabel}</span>
            </div>
            {order.notes && (
              <div className="flex justify-between">
                <span className="text-text-secondary">Notas</span>
                <span className="font-medium text-right max-w-[200px]">{order.notes}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3 animate-slide-up" style={{ animationDelay: '200ms' }}>
          {whatsappUrl ? (
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="w-full">
                <MessageCircle className="w-5 h-5" />
                Abrir WhatsApp
              </Button>
            </a>
          ) : (
            <p className="text-sm text-warning text-center bg-warning/10 rounded-xl p-3">
              El número de WhatsApp no está configurado. Contactá al local directamente.
            </p>
          )}

          <Link href="/">
            <Button variant="secondary" size="lg" className="w-full mt-3">
              Hacer otro pedido
            </Button>
          </Link>
        </div>

        <p className="text-xs text-text-muted text-center mt-6">
          Confirmá tu pedido por WhatsApp. El local te avisará cuando esté listo.
        </p>
      </main>
    </div>
  )
}
