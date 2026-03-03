'use client'

import { useState } from 'react'
import { Banknote, CreditCard, Copy, Check } from 'lucide-react'
import type { PaymentMethod, Settings } from '@/lib/types'

interface PaymentSelectorProps {
  value: PaymentMethod
  onChange: (value: PaymentMethod) => void
  settings: Settings | null
}

export function PaymentSelector({ value, onChange, settings }: PaymentSelectorProps) {
  const [copied, setCopied] = useState(false)

  const copyAlias = async () => {
    if (settings?.mp_alias) {
      await navigator.clipboard.writeText(settings.mp_alias)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-text mb-2">
        Forma de pago
      </label>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange('cash')}
          className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
            value === 'cash'
              ? 'border-primary bg-primary/5'
              : 'border-border bg-card hover:border-primary/30'
          }`}
        >
          <Banknote className={`w-6 h-6 mb-2 ${value === 'cash' ? 'text-primary' : 'text-text-muted'}`} />
          <p className="text-sm font-semibold text-text">Efectivo</p>
          <p className="text-xs text-text-secondary mt-0.5">Pagás al retirar</p>
        </button>

        <button
          type="button"
          onClick={() => onChange('mercadopago')}
          className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
            value === 'mercadopago'
              ? 'border-primary bg-primary/5'
              : 'border-border bg-card hover:border-primary/30'
          }`}
        >
          <CreditCard className={`w-6 h-6 mb-2 ${value === 'mercadopago' ? 'text-primary' : 'text-text-muted'}`} />
          <p className="text-sm font-semibold text-text">MercadoPago</p>
          <p className="text-xs text-text-secondary mt-0.5">Transferencia</p>
        </button>
      </div>

      {value === 'mercadopago' && settings?.mp_alias && (
        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 animate-slide-up">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-blue-600 font-medium">Alias:</span>
            <button
              type="button"
              onClick={copyAlias}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copiar
                </>
              )}
            </button>
          </div>
          <p className="text-sm font-mono font-semibold text-blue-800">{settings.mp_alias}</p>
          {settings.mp_info && (
            <p className="text-xs text-blue-600 mt-2">{settings.mp_info}</p>
          )}
        </div>
      )}
    </div>
  )
}
