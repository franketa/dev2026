'use client'

import { Plus, Minus } from 'lucide-react'
import { useCart } from '@/hooks/useCart'
import { formatPrice } from '@/lib/utils'
import type { Product } from '@/lib/types'

interface ProductCardProps {
  product: Product
  isOpen: boolean
}

export function ProductCard({ product, isOpen }: ProductCardProps) {
  const { addItem, updateQuantity, getItemQuantity } = useCart()
  const quantity = getItemQuantity(product.id)

  const isAvailable = product.is_available

  return (
    <div
      className={`flex items-center justify-between py-3 ${
        !isAvailable ? 'opacity-50' : ''
      }`}
    >
      <div className="flex-1 min-w-0 mr-3">
        <h3 className={`text-sm font-medium ${!isAvailable ? 'text-text-muted' : 'text-text'}`}>
          {product.name}
        </h3>
        {!isAvailable ? (
          <p className="text-xs text-danger mt-0.5">No disponible</p>
        ) : (
          <p className="text-sm font-semibold text-primary mt-0.5">
            {formatPrice(product.price)}
          </p>
        )}
      </div>

      {isAvailable && isOpen && (
        <div className="shrink-0">
          {quantity === 0 ? (
            <button
              onClick={() =>
                addItem({
                  product_id: product.id,
                  name: product.name,
                  price: product.price,
                })
              }
              className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-hover transition-all active:scale-90 cursor-pointer shadow-sm"
              aria-label={`Agregar ${product.name}`}
            >
              <Plus className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => updateQuantity(product.id, quantity - 1)}
                className="w-8 h-8 rounded-full border border-border bg-card text-text flex items-center justify-center hover:bg-gray-50 transition-all active:scale-90 cursor-pointer"
                aria-label="Quitar uno"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-6 text-center text-sm font-semibold text-text">
                {quantity}
              </span>
              <button
                onClick={() =>
                  addItem({
                    product_id: product.id,
                    name: product.name,
                    price: product.price,
                  })
                }
                className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-hover transition-all active:scale-90 cursor-pointer"
                aria-label="Agregar uno más"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
