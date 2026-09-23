import Sidebar from "@/components/sidebar";
import Buscador from "@/components/buscador";
import { requiereSesion, permisosDe } from "@/lib/auth";
import { cotizacionDeHoy } from "@/lib/cotizacion";
import { plata, fecha as ffecha } from "@/lib/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requiereSesion();
  const permisos = permisosDe(u.rol);

  const cot = await cotizacionDeHoy();

  return (
    <div className="flex min-h-screen">
      <Sidebar usuario={{ nombre: u.nombre, rol: u.rol }} permisos={permisos} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* -------------------------------------------------------- barra superior */}
        <header className="h-[57px] shrink-0 sticky top-0 z-30 bg-[#0a0e14]/90 backdrop-blur
          border-b border-[#1f2937] flex items-center gap-3 px-4 lg:px-7">
          <div className="flex-1 pl-11 lg:pl-0"><Buscador /></div>
          {cot && (
            <div className="hidden sm:flex items-center gap-2 rounded-lg border border-[#1f2937]
              bg-[#111721] px-3 py-1.5" title={`Dólar blue al ${ffecha(cot.fecha)}`}>
              <span className="etiqueta">Dólar</span>
              <span className="text-[13px] font-semibold tabular">{plata(cot.valor)}</span>
            </div>
          )}
          <div className="h-7 w-7 rounded-full bg-[#2f6bff] grid place-items-center
            text-[11px] font-semibold text-white">
            {u.nombre.slice(0, 1).toUpperCase()}
          </div>
        </header>

        <main className="flex-1 px-4 lg:px-7 py-6 lg:py-7 max-w-[1500px] w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
