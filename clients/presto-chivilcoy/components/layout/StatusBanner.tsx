'use client'

import { Clock, AlertCircle } from 'lucide-react'
import type { BusinessStatus } from '@/lib/types'

interface StatusBannerProps {
  status: BusinessStatus
  isManuallyClosed?: boolean
}

export function StatusBanner({ status, isManuallyClosed }: StatusBannerProps) {
  if (isManuallyClosed) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2.5">
        <div className="mx-auto max-w-2xl flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="font-medium">Cerrado momentáneamente</span>
        </div>
      </div>
    )
  }

  if (status.isOpen) {
    return (
      <div className="bg-green-50 border-b border-green-200 px-4 py-2.5">
        <div className="mx-auto max-w-2xl flex items-center gap-2 text-sm text-green-700">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <span>
            <span className="font-medium">Abierto ahora</span>
            {status.todaySchedule && (
              <span className="text-green-600"> · Horario de hoy: {status.todaySchedule}</span>
            )}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-red-50 border-b border-red-200 px-4 py-2.5">
      <div className="mx-auto max-w-2xl flex items-center gap-2 text-sm text-red-700">
        <Clock className="w-4 h-4 shrink-0" />
        <span>
          <span className="font-medium">Cerrado ahora</span>
          <span className="text-red-600">
            {' '}— Podés ver el menú pero no hacer pedidos
          </span>
          {status.nextOpenTime && (
            <span className="text-red-500 block sm:inline sm:ml-1">
              Abrimos: {status.nextOpenTime}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
