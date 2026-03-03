'use client'

import Image from 'next/image'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Logo({ size = 'md', className = '' }: LogoProps) {
  const sizes = {
    sm: { width: 36, height: 36, text: 'text-lg' },
    md: { width: 48, height: 48, text: 'text-xl' },
    lg: { width: 64, height: 64, text: 'text-3xl' },
  }

  const { width, height, text } = sizes[size]

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Image
        src="/logo.png"
        alt="Presto Chivilcoy"
        width={width}
        height={height}
        className="rounded-full object-cover"
        priority
      />
      <div className="flex flex-col leading-tight">
        <span className={`font-accent font-bold ${text} text-white`}>
          PRESTO
        </span>
        <span className="text-xs text-white/70 tracking-wider uppercase">
          Chivilcoy
        </span>
      </div>
    </div>
  )
}
