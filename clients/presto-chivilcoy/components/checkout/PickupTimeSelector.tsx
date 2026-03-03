'use client'

import { PICKUP_OPTIONS } from '@/lib/constants'
import type { PickupTime } from '@/lib/types'

interface PickupTimeSelectorProps {
  value: PickupTime
  onChange: (value: PickupTime) => void
}

export function PickupTimeSelector({ value, onChange }: PickupTimeSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-text mb-2">
        ¿Para cuándo lo querés?
      </label>
      <div className="flex flex-wrap gap-2">
        {PICKUP_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              value === option.value
                ? 'bg-primary text-white shadow-sm'
                : 'bg-card text-text-secondary border border-border hover:border-primary/30'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
