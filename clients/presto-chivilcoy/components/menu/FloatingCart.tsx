'use client'

import { useEffect, useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import { useCart } from '@/hooks/useCart'
import { formatPrice } from '@/lib/utils'

interface FloatingCartProps {
  onClick: () => void
}

export function FloatingCart({ onClick }: FloatingCartProps) {
  const { totalItems, totalPrice, animationTrigger } = useCart()
  const [bounce, setBounce] = useState(false)

  useEffect(() => {
    if (animationTrigger > 0) {
      setBounce(true)
      const t = setTimeout(() => setBounce(false), 300)
      return () => clearTimeout(t)
    }
  }, [animationTrigger])

  if (totalItems === 0) return null

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 p-4 pointer-events-none">
      <div className="mx-auto max-w-2xl">
        <button
          onClick={onClick}
          className={`pointer-events-auto w-full bg-primary text-white rounded-2xl px-5 py-3.5 flex items-center justify-between shadow-lg hover:bg-primary-hover transition-all cursor-pointer ${
            bounce ? 'animate-bounce-subtle' : ''
          }`}
        >
          <div className="flex items-center gap-2.5">
            <ShoppingCart className="w-5 h-5" />
            <span className="font-semibold text-sm">
              Ver pedido · {totalItems} {totalItems === 1 ? 'item' : 'items'}
            </span>
          </div>
          <span className="font-bold text-base">{formatPrice(totalPrice)}</span>
        </button>
      </div>
    </div>
  )
}
