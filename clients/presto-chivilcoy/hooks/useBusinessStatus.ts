'use client'

import { useState, useEffect } from 'react'
import type { Settings, BusinessStatus } from '@/lib/types'
import { isBusinessOpen } from '@/lib/utils'

export function useBusinessStatus(settings: Settings | null): BusinessStatus {
  const [status, setStatus] = useState<BusinessStatus>({
    isOpen: false,
    todaySchedule: '',
  })

  useEffect(() => {
    if (!settings) return

    function check() {
      const result = isBusinessOpen(settings!.schedule, settings!.is_manually_closed)
      setStatus(result)
    }

    check()
    const interval = setInterval(check, 60000) // refresh every 60 seconds
    return () => clearInterval(interval)
  }, [settings])

  return status
}
