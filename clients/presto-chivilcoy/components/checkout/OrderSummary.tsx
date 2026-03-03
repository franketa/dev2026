'use client'

import type { CartItem } from '@/lib/types'
import { formatPrice } from '@/lib/utils'

interface OrderSummaryProps {
  items: CartItem[]
  total: number
}

export function OrderSummary({ items, total }: OrderSummaryProps) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold text-text mb-3">Resumen del pedido</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.product_id} className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">
              {item.quantity}x {item.name}
            </span>
            <span className="font-medium text-text">
              {formatPrice(item.price * item.quantity)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-sm font-semibold text-text">Total</span>
        <span className="text-lg font-bold text-primary">{formatPrice(total)}</span>
      </div>
    </div>
  )
}
