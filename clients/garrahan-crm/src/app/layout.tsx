import type { Metadata, Viewport } from "next";
import { scriptTema } from "@/components/tema";
import "./globals.css";

export const metadata: Metadata = {
  title: "Garrahan Automotores — Gestión",
  description: "Stock, ventas, caja y rentabilidad de la agencia.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Literal y no variable: el color de la barra del navegador se lee del HTML
  // antes de que exista una hoja de estilos.
  themeColor: "#0a0e14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <head>
        {/* Aplica el tema guardado antes del primer pintado. Si esperara al
            useEffect, quien usa el tema claro vería un fogonazo oscuro en
            cada carga de página. */}
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
