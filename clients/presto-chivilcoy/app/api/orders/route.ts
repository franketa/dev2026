import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { customer_name, customer_phone, items, total, payment_method, pickup_time, notes } = body

    // Validation
    if (!customer_name || typeof customer_name !== 'string' || customer_name.trim().length === 0) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
    }

    if (!customer_phone || typeof customer_phone !== 'string' || customer_phone.trim().length < 8) {
      return NextResponse.json({ error: 'El teléfono debe tener al menos 8 caracteres' }, { status: 400 })
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'El pedido debe tener al menos un producto' }, { status: 400 })
    }

    if (!total || typeof total !== 'number' || total <= 0) {
      return NextResponse.json({ error: 'El total es inválido' }, { status: 400 })
    }

    if (!['cash', 'mercadopago'].includes(payment_method)) {
      return NextResponse.json({ error: 'Método de pago inválido' }, { status: 400 })
    }

    if (!['asap', '30', '60', '90', '120'].includes(pickup_time)) {
      return NextResponse.json({ error: 'Tiempo de retiro inválido' }, { status: 400 })
    }

    const supabase = createServerClient()
    const orderId = crypto.randomUUID()

    // Insert without .select() to avoid needing SELECT permission for anon role
    const { error } = await supabase
      .from('orders')
      .insert({
        id: orderId,
        customer_name: customer_name.trim(),
        customer_phone: customer_phone.trim(),
        items,
        total,
        payment_method,
        pickup_time,
        notes: notes?.trim() || '',
      })

    if (error) {
      console.error('Error creating order:', error)
      return NextResponse.json({ error: 'Error al crear el pedido' }, { status: 500 })
    }

    // Return the order data we already know (order_number comes from DB,
    // so we pass the id and the client stores its own copy of the data)
    return NextResponse.json({ id: orderId }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error procesando la solicitud' }, { status: 500 })
  }
}
