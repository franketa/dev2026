'use client'

import Link from 'next/link'
import { Settings } from 'lucide-react'
import { Logo } from './Logo'

interface HeaderProps {
  address?: string
}

export function Header({ address }: HeaderProps) {
  return (
    <header className="bg-header sticky top-0 z-40">
      <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
        <Logo size="sm" />
        <div className="flex items-center gap-3">
          {address && (
            <span className="hidden sm:block text-xs text-white/60">
              {address}
            </span>
          )}
          <Link
            href="/admin/login"
            className="text-white/40 hover:text-white/70 transition-colors p-1"
            aria-label="Panel de administración"
          >
            <Settings className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </header>
  )
}
