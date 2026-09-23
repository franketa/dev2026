import { redirect } from "next/navigation";
import { login, usuarioActual } from "@/lib/auth";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; m?: string }> }) {
  if (await usuarioActual()) redirect("/");
  const { error, m } = await searchParams;

  async function entrar(fd: FormData) {
    "use server";
    const email = String(fd.get("email") || "").trim();
    const pass = String(fd.get("password") || "");
    const u = await login(email, pass);
    if (!u) redirect("/login?error=1");
    redirect("/");
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* ---------------------------------------------------------- marca */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-[#0d1420] via-[#0a0e14] to-[#0a0e14] border-r border-[#1f2937]">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-[#e3242b] grid place-items-center font-bold text-white">G</div>
          <span className="font-semibold text-[15px]">Garrahan Automotores</span>
        </div>
        <div>
          <h1 className="text-[42px] leading-[1.1] font-semibold tracking-tight">
            Toda la agencia,<br />
            <span className="text-[#2f6bff]">en un solo lugar.</span>
          </h1>
          <p className="mt-5 text-[14px] text-[#9aa7b8] max-w-md leading-relaxed">
            Stock con días en playón, costo real por unidad, leads con próxima acción,
            caja en pesos y dólares, y el margen de cada auto calculado solo.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {["Stock", "Ventas", "Leads", "Taller", "Caja", "Inversores"].map((t) => (
              <span key={t} className="rounded-full border border-[#1f2937] bg-[#111721] px-3 py-1.5 text-[12px] text-[#9aa7b8]">{t}</span>
            ))}
          </div>
        </div>
        <p className="text-[12px] text-[#475569]">Chivilcoy, Provincia de Buenos Aires</p>
      </div>

      {/* --------------------------------------------------------- formulario */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-[380px]">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="h-9 w-9 rounded-xl bg-[#e3242b] grid place-items-center font-bold text-white">G</div>
            <span className="font-semibold">Garrahan Automotores</span>
          </div>

          <h2 className="text-[20px] font-semibold">Iniciar sesión</h2>
          <p className="text-[13px] text-[#64748b] mt-1">Entrá con tu cuenta para seguir operando.</p>

          <form action={entrar} className="mt-7 space-y-4">
            <label className="block">
              <span className="etiqueta block mb-1.5">Email</span>
              <input name="email" type="email" required autoFocus autoComplete="email"
                placeholder="tu@correo.com" className="campo" />
            </label>
            <label className="block">
              <span className="etiqueta block mb-1.5">Contraseña</span>
              <input name="password" type="password" required autoComplete="current-password"
                placeholder="••••••••" className="campo" />
            </label>

            {error && (
              <div className="rounded-lg border border-[#991b1b] bg-[#2e0a0a] px-3 py-2.5 text-[12.5px] text-[#f87171]">
                Email o contraseña incorrectos.
              </div>
            )}

            {m === "clave" && (
              <div className="rounded-lg border border-[#14532d] bg-[#052e1a] px-3 py-2.5 text-[12.5px] text-[#4ade80]">
                Contraseña cambiada. Entrá con la nueva.
              </div>
            )}

            <button type="submit"
              className="w-full rounded-lg bg-[#2f6bff] hover:bg-[#4d81ff] py-2.5 text-[14px] font-semibold text-white transition-colors">
              Ingresar
            </button>
          </form>

          <p className="mt-8 text-[11.5px] text-[#475569] text-center">
            ¿Problemas para entrar? Hablá con el administrador del sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
