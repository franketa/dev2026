'use client'

import { useEffect, useRef } from 'react'
import { X, Minus, Plus, ShoppingBag } from 'lucide-react'
import { useCart } from '@/hooks/useCart'
import { formatPrice } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

interface CartDrawerProps {
  isOpen: boolean
  onClose: () => void
  minOrder: number
}

export function CartDrawer({ isOpen, onClose, minOrder }: CartDrawerProps) {
  const { items, updateQuantity, totalPrice, clearCart } = useCart()
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  const meetsMinimum = minOrder <= 0 || totalPrice >= minOrder

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 animate-fade-in"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div className="fixed inset-0 bg-black/50" />
      <div className="fixed inset-x-0 bottom-0 max-h-[85vh] bg-card rounded-t-2xl shadow-xl animate-slide-up-drawer flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-text">Tu pedido</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearCart}
              className="text-xs text-text-muted hover:text-danger transition-colors cursor-pointer"
            >
              Vaciar
            </button>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text transition-colors p-1 cursor-pointer"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.map((item) => (
            <div key={item.product_id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text truncate">{item.name}</p>
                <p className="text-sm text-primary font-semibold">
                  {formatPrice(item.price * item.quantity)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                  className="w-7 h-7 rounded-full border border-border bg-card text-text flex items-center justify-center hover:bg-gray-50 transition-all active:scale-90 cursor-pointer"
                  aria-label="Quitar uno"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-5 text-center text-sm font-semibold">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                  className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-hover transition-all active:scale-90 cursor-pointer"
                  aria-label="Agregar uno más"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border space-y-3 shrink-0">
          {!meetsMinimum && (
            <p className="text-xs text-warning text-center">
              El pedido mínimo es de {formatPrice(minOrder)}. Te faltan {formatPrice(minOrder - totalPrice)}.
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Total</span>
            <span className="text-lg font-bold text-text">{formatPrice(totalPrice)}</span>
          </div>
          <Link href="/checkout" onClick={onClose}>
            <Button size="lg" className="w-full" disabled={!meetsMinimum}>
              Continuar con el pedido
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
