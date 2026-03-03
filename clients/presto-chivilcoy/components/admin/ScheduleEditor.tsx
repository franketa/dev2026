'use client'

import { Switch } from '@/components/ui/Switch'
import { DAYS, DAYS_DISPLAY } from '@/lib/constants'
import type { Schedule } from '@/lib/types'

interface ScheduleEditorProps {
  schedule: Schedule
  onChange: (schedule: Schedule) => void
}

export function ScheduleEditor({ schedule, onChange }: ScheduleEditorProps) {
  function toggleDay(day: string) {
    onChange({
      ...schedule,
      [day]: {
        ...schedule[day],
        enabled: !schedule[day]?.enabled,
      },
    })
  }

  function updateShift(day: string, shiftIdx: number, field: 'open' | 'close', value: string) {
    const daySchedule = { ...schedule[day] }
    const shifts = [...(daySchedule.shifts || [])]
    shifts[shiftIdx] = { ...shifts[shiftIdx], [field]: value }
    onChange({
      ...schedule,
      [day]: { ...daySchedule, shifts },
    })
  }

  function addShift(day: string) {
    const daySchedule = { ...schedule[day] }
    const shifts = [...(daySchedule.shifts || [])]
    if (shifts.length < 2) {
      shifts.push({ open: '19:00', close: '23:00' })
      onChange({
        ...schedule,
        [day]: { ...daySchedule, shifts },
      })
    }
  }

  function removeShift(day: string, shiftIdx: number) {
    const daySchedule = { ...schedule[day] }
    const shifts = [...(daySchedule.shifts || [])]
    shifts.splice(shiftIdx, 1)
    onChange({
      ...schedule,
      [day]: { ...daySchedule, shifts },
    })
  }

  return (
    <div className="space-y-3">
      {DAYS.map(day => {
        const dayData = schedule[day] || { enabled: false, shifts: [] }
        return (
          <div key={day} className="bg-card rounded-xl border border-border p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-text">{DAYS_DISPLAY[day]}</span>
              <Switch checked={dayData.enabled} onChange={() => toggleDay(day)} />
            </div>

            {dayData.enabled && (
              <div className="space-y-2 mt-2">
                {(dayData.shifts || []).map((shift, idx) => {
                  // <input type="time"> doesn't support 24:00, display as 23:59
                  const displayClose = shift.close === '24:00' ? '23:59' : shift.close
                  return (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="time"
                      value={shift.open}
                      onChange={(e) => updateShift(day, idx, 'open', e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <span className="text-xs text-text-muted">a</span>
                    <input
                      type="time"
                      value={displayClose}
                      onChange={(e) => updateShift(day, idx, 'close', e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    {dayData.shifts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeShift(day, idx)}
                        className="text-xs text-danger hover:underline cursor-pointer"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  )
                })}
                {(dayData.shifts || []).length < 2 && (
                  <button
                    type="button"
                    onClick={() => addShift(day)}
                    className="text-xs text-primary hover:underline cursor-pointer"
                  >
                    + Agregar turno
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
