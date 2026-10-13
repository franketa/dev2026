"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

/**
 * El botón de enviar de un formulario: mientras se guarda queda deshabilitado
 * y muestra la ruedita, así se ve que algo pasa y no se guarda dos veces.
 */
export default function BotonEnviar({ className, children, disabled, ...rest }: any) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={disabled || pending} aria-busy={pending} {...rest}>
      {pending && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}
