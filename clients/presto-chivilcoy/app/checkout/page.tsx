'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import { useCart } from '@/hooks/useCart'
import { createClient } from '@/lib/supabase'
import { formatPrice } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { OrderSummary } from '@/components/checkout/OrderSummary'
import { PickupTimeSelector } from '@/components/checkout/PickupTimeSelector'
import { PaymentSelector } from '@/components/checkout/PaymentSelector'
import type { Settings, PaymentMethod, PickupTime } from '@/lib/types'

export default function CheckoutPage() {
  const router = useRouter()
  const { items, totalPrice, clearCart } = useCart()
  const [settings, setSettings] = useState<Settings | null>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [pickupTime, setPickupTime] = useState<PickupTime>('asap')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase.from('settings').select('*').limit(1).single()
      if (data) setSettings(data)
    }
    load()
  }, [])

  useEffect(() => {
    if (items.length === 0 && typeof window !== 'undefined') {
      // Small delay to allow cart to hydrate from localStorage
      const t = setTimeout(() => {
        if (items.length === 0) router.push('/')
      }, 500)
      return () => clearTimeout(t)
    }
  }, [items.length, router])

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'El nombre es requerido'
    if (!phone.trim() || phone.trim().length < 8) errs.phone = 'Ingresá un teléfono válido (mínimo 8 caracteres)'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    try {
      const orderItems = items.map(i => ({
        product_id: i.product_id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
      }))

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          items: orderItems,
          total: totalPrice,
          payment_method: paymentMethod,
          pickup_time: pickupTime,
          notes: notes.trim(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Error al crear el pedido')
        setSubmitting(false)
        return
      }

      const { id } = await res.json()

      // Store order data in localStorage for confirmation page
      // (avoids needing anon SELECT permission on orders table)
      localStorage.setItem(`presto-order-${id}`, JSON.stringify({
        id,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        items: orderItems,
        total: totalPrice,
        payment_method: paymentMethod,
        pickup_time: pickupTime,
        notes: notes.trim(),
      }))

      clearCart()
      router.push(`/confirmation/${id}`)
    } catch {
      alert('Error de conexión. Intentá de nuevo.')
      setSubmitting(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="bg-header sticky top-0 z-40">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-white/70 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold text-white">Confirmar pedido</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        {/* Order summary */}
        <OrderSummary items={items} total={totalPrice} />

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Customer info */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-text">Tus datos</h3>
            <Input
              label="Nombre *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              error={errors.name}
            />
            <Input
              label="Teléfono *"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej: 2346-401234"
              error={errors.phone}
            />
          </div>

          {/* Pickup time */}
          <PickupTimeSelector value={pickupTime} onChange={setPickupTime} />

          {/* Payment */}
          <PaymentSelector
            value={paymentMethod}
            onChange={setPaymentMethod}
            settings={settings}
          />

          {/* Notes */}
          <Textarea
            label="Notas (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: sin aceitunas, bien cocida, etc."
            rows={3}
          />

          {/* Submit */}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <MessageCircle className="w-5 h-5" />
                Confirmar y enviar por WhatsApp
              </>
            )}
          </Button>

          <p className="text-xs text-text-muted text-center">
            Al confirmar, tu pedido se guarda y podrás enviarlo por WhatsApp
          </p>
        </form>
      </main>
    </div>
  )
}
