'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Sidebar } from '@/components/admin/Sidebar'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)

  const isLoginPage = pathname === '/admin/login'

  useEffect(() => {
    async function check() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session && !isLoginPage) {
        router.push('/admin/login')
        return
      }

      if (session) {
        setAuthed(true)
        // Fetch pending orders count
        const { data } = await supabase
          .from('orders')
          .select('id')
          .eq('status', 'pending')
        setPendingCount(data?.length ?? 0)
      }
      setLoading(false)
    }
    check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoginPage])

  // Login page renders without sidebar
  if (isLoginPage) {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!authed) return null

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar pendingCount={pendingCount} />
      <div className="flex-1 pb-16 md:pb-0">
        {children}
      </div>
    </div>
  )
}
