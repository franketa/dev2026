import Image from 'next/image'

export function Footer() {
  return (
    <footer className="bg-header text-white/50 text-center text-xs py-6 mt-auto">
      <div className="mx-auto max-w-2xl px-4">
        <p>Presto Chivilcoy — Empanadas, Pizzas y Tartas artesanales</p>
        <p className="mt-1">Pedí online, retirá en el local</p>
        <a
          href="https://venturebyte.com.ar"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Desarrollado por VentureByte"
          className="mt-4 inline-flex items-center justify-center gap-2 text-xs text-white/45 hover:text-white/70 transition-colors"
        >
          Desarrollado por VentureByte
          <Image
            src="/venturebyte-white.png"
            alt="VentureByte"
            width={20}
            height={20}
            className="h-5 w-auto opacity-70 hover:opacity-100 transition-opacity"
          />
        </a>
      </div>
    </footer>
  )
}
