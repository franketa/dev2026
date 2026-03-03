'use client'

import { useState, useEffect } from 'react'
import { Save, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Switch } from '@/components/ui/Switch'
import { ScheduleEditor } from '@/components/admin/ScheduleEditor'
import { DEFAULT_SCHEDULE } from '@/lib/constants'
import type { Settings, Schedule } from '@/lib/types'

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [settingsId, setSettingsId] = useState<string | null>(null)

  const [businessName, setBusinessName] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [mpAlias, setMpAlias] = useState('')
  const [mpInfo, setMpInfo] = useState('')
  const [minOrder, setMinOrder] = useState('0')
  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE)
  const [isManuallyClosed, setIsManuallyClosed] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase.from('settings').select('*').limit(1).single()
      if (data) {
        const s = data as Settings
        setSettingsId(s.id)
        setBusinessName(s.business_name)
        setDescription(s.description)
        setAddress(s.address)
        setWhatsappNumber(s.whatsapp_number)
        setMpAlias(s.mp_alias)
        setMpInfo(s.mp_info)
        setMinOrder(String(s.min_order))
        setSchedule(s.schedule || DEFAULT_SCHEDULE)
        setIsManuallyClosed(s.is_manually_closed)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)

    const supabase = createClient()

    const payload = {
      business_name: businessName.trim(),
      description: description.trim(),
      address: address.trim(),
      whatsapp_number: whatsappNumber.trim(),
      mp_alias: mpAlias.trim(),
      mp_info: mpInfo.trim(),
      min_order: parseInt(minOrder) || 0,
      schedule,
      is_manually_closed: isManuallyClosed,
    }

    let error
    if (settingsId) {
      ({ error } = await supabase.from('settings').update(payload).eq('id', settingsId))
    } else {
      ({ error } = await supabase.from('settings').insert(payload))
    }

    setSaving(false)
    if (error) {
      console.error('Error saving settings:', error)
      alert('Error al guardar: ' + error.message)
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-text mb-6">Configuración</h1>

      <form onSubmit={handleSave} className="space-y-8">
        {/* General */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">General</h2>
          <Input label="Nombre del negocio" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          <Input label="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Input label="Dirección" value={address} onChange={(e) => setAddress(e.target.value)} />
        </section>

        {/* Contact & payments */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Contacto y pagos</h2>
          <Input
            label="Número de WhatsApp"
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            placeholder="5492346401234"
          />
          <p className="text-xs text-text-muted -mt-2">Sin +, con código de país. Ej: 5492346401234</p>
          <Input
            label="Alias de MercadoPago"
            value={mpAlias}
            onChange={(e) => setMpAlias(e.target.value)}
            placeholder="presto.chivilcoy"
          />
          <Textarea
            label="Información adicional de pago"
            value={mpInfo}
            onChange={(e) => setMpInfo(e.target.value)}
            placeholder="Ej: Enviá el comprobante de pago por WhatsApp"
            rows={2}
          />
        </section>

        {/* Min order */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Pedido mínimo</h2>
          <Input
            label="Monto mínimo en pesos (0 = sin mínimo)"
            type="number"
            value={minOrder}
            onChange={(e) => setMinOrder(e.target.value)}
          />
        </section>

        {/* Schedule */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Horarios</h2>
          <ScheduleEditor schedule={schedule} onChange={setSchedule} />
        </section>

        {/* Manual close */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Cierre manual</h2>
          <Switch
            checked={isManuallyClosed}
            onChange={setIsManuallyClosed}
            label="Cerrar el local manualmente (feriados, eventos, etc.)"
          />
        </section>

        {/* Save */}
        <Button type="submit" size="lg" className="w-full" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Guardando...
            </>
          ) : saved ? (
            'Guardado ✓'
          ) : (
            <>
              <Save className="w-4 h-4" />
              Guardar cambios
            </>
          )}
        </Button>
      </form>
    </div>
  )
}
