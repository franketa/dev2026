import Link from "next/link";
import { requiereSesion, veCostos } from "@/lib/auth";
import { Encabezado, Panel, PanelTitulo, Chip } from "@/components/ui";

export const dynamic = "force-dynamic";

type Seccion = {
  id: string;
  titulo: string;
  href?: string;
  para: string;
  pasos: string[];
  ojo?: string;
  soloCostos?: boolean;
};

const SECCIONES: Seccion[] = [
  {
    id: "inicio",
    titulo: "Inicio",
    href: "/",
    para: "Ver en diez segundos cómo viene el mes y qué está trabado.",
    pasos: [
      "Arriba, las cuatro cifras del mes: unidades vendidas, margen, stock y leads abiertos.",
      "Abajo a la izquierda, las unidades que llevan más tiempo en el playón.",
      "Abajo a la derecha, los leads con la próxima acción vencida.",
    ],
    ojo: "Si una unidad aparece en rojo es porque lleva más de 90 días sin venderse. No es un error del sistema: es plata quieta.",
  },
  {
    id: "vehiculos",
    titulo: "Vehículos",
    href: "/vehiculos",
    para: "El stock: qué hay, en qué estado y cuánto deja cada unidad.",
    pasos: [
      "«Nuevo vehículo» da de alta la unidad. Solo marca y modelo son obligatorios.",
      "Al entrar a una unidad, las pestañas separan General, Costos, Ficha técnica, Movimientos y Documentación.",
      "En la pestaña Costos está el botón «Agregar costo»: chapa, mecánica, gestoría, lo que sea.",
      "El semáforo de días en stock es automático: verde, +30, +60 y +90.",
    ],
    ojo: "El costo se carga desde el auto, no desde la caja. Cada costo que cargues recalcula el margen en el momento.",
  },
  {
    id: "leads",
    titulo: "Leads",
    href: "/leads",
    para: "Las consultas, desde que entran hasta que se cierran.",
    pasos: [
      "El embudo tiene cinco etapas: Captación, Calificación, Negociación, Cierre y Cerrados.",
      "El estado se cambia desde la misma tabla, sin abrir el lead.",
      "Dentro del lead se registra cada llamada, visita o mensaje, y queda el historial completo.",
      "El botón de WhatsApp abre la conversación con el número ya cargado.",
      "Si se cae, se marca como perdido con el motivo. Esa lista después dice mucho.",
    ],
    ojo: "Cargá siempre la próxima acción con fecha. Los leads sin próxima acción son los que se pierden solos.",
  },
  {
    id: "ventas",
    titulo: "Ventas",
    href: "/ventas",
    para: "Cerrar la operación y que todo lo demás se acomode solo.",
    pasos: [
      "En «Nueva venta» se cargan el precio y las formas de pago en la misma pantalla.",
      "Se pueden combinar: una seña en efectivo, un usado en permuta y el resto financiado.",
      "Abajo del todo se ve en vivo cuánto falta para cubrir el total.",
      "Si entra un usado, se da de alta solo en el stock, en revisión.",
      "Lo que se cobra en efectivo o transferencia entra a la cuenta de caja que elijas.",
      "Lo que quede sin cubrir se abre solo como saldo en Cobranzas.",
    ],
    ojo: "Desde la ficha de la venta salen impresos el boleto de compraventa y el recibo de cada cobro, con el importe en letras.",
  },
  {
    id: "taller",
    titulo: "Taller",
    href: "/taller",
    para: "La preparación de cada unidad antes de publicarla.",
    pasos: [
      "«Nueva orden» abre el checklist de preparación; se destilda lo que no corresponda.",
      "Cada tarea se va tildando y puede llevar su costo y su proveedor.",
      "Al cerrar la orden, esos costos pasan automáticamente a la unidad.",
    ],
    ojo: "No hace falta cargar el gasto dos veces. Cerrar la orden ya ajusta el margen del auto.",
  },
  {
    id: "caja",
    titulo: "Caja",
    href: "/caja",
    para: "Cuánta plata hay, en qué cuenta y de dónde salió.",
    pasos: [
      "Cada cuenta tiene su saldo: efectivo pesos, efectivo dólares, banco, Mercado Pago.",
      "Las transferencias entre cuentas propias no cuentan como ingreso ni como gasto.",
      "Cada movimiento puede colgar de una unidad, y entonces aparece también en su ficha.",
    ],
    soloCostos: true,
    ojo: "Caja responde «cuánta plata tengo». Reportes responde «estoy ganando». Son preguntas distintas y dan números distintos.",
  },
  {
    id: "cobranzas",
    titulo: "Cobranzas y Deudas",
    href: "/cobranzas",
    para: "Lo que falta cobrar y lo que hay que pagar.",
    pasos: [
      "Las cobranzas se abren solas cuando una venta queda con saldo.",
      "Cada cobro que registres en la venta va descontando el saldo.",
      "Deudas a pagar es el otro lado: proveedores, impuestos, lo que venza.",
    ],
    soloCostos: true,
  },
  {
    id: "reportes",
    titulo: "Reportes",
    href: "/reportes",
    para: "Si el mes cerró bien o mal, y por qué.",
    pasos: [
      "El ingreso del período es el margen de las unidades vendidas, no el precio de venta.",
      "Los gastos de estructura son sueldos, alquiler, publicidad, impuestos.",
      "La pestaña Comisiones muestra qué generó cada vendedor.",
      "La pestaña Evolución muestra el margen mes a mes.",
    ],
    soloCostos: true,
    ojo: "La compra de unidades no figura como gasto del mes. Comprar un auto no es perder plata: es cambiarla por mercadería. Pega en el resultado recién cuando se vende.",
  },
  {
    id: "postventa",
    titulo: "Postventa",
    href: "/postventa",
    para: "El contacto después de la entrega, a los 30 y a los 90 días.",
    pasos: [
      "El seguimiento se abre solo cuando una venta pasa a completada.",
      "Se registra qué dijo el cliente y una nota del 1 al 10.",
      "Si refirió a alguien, se crea el lead solo, en Captación.",
    ],
  },
  {
    id: "buscador",
    titulo: "Buscar cualquier cosa",
    para: "No acordarse en qué listado estaba algo.",
    pasos: [
      "Ctrl + K abre el buscador desde cualquier pantalla.",
      "Sirve el dominio, el nombre del cliente, el teléfono, el modelo o el número de venta.",
      "Se navega con las flechas y se abre con Enter, sin tocar el mouse.",
    ],
  },
  {
    id: "exportar",
    titulo: "Pasarlo a Excel",
    para: "Seguir trabajando afuera o mandarle algo al contador.",
    pasos: [
      "Los listados de stock, ventas, leads, caja, clientes y cobranzas tienen «Exportar».",
      "Baja un archivo que Excel abre directo, con los acentos y los números bien.",
    ],
  },
  {
    id: "permisos",
    titulo: "Quién ve qué",
    href: "/usuarios",
    para: "Que cada uno trabaje con lo suyo.",
    pasos: [
      "Dueño y Gerente ven todo.",
      "Vendedor ve stock, clientes, leads y ventas, pero no costos ni márgenes.",
      "Administrativo ve caja, cobranzas, deudas y reportes.",
      "Taller ve solamente las órdenes de preparación.",
    ],
    ojo: "El vendedor ve el precio y el mínimo autorizado. Lo que no ve es cuánto se ganó en cada unidad.",
  },
];

export default async function Guia() {
  const u = await requiereSesion();
  const verCostos = veCostos(u);
  const secciones = SECCIONES.filter((s) => !s.soloCostos || verCostos);

  return (
    <>
      <Encabezado titulo="Guía del sistema"
        detalle="Qué hace cada pantalla y dónde mirar. Alcanza con leerla una vez." />

      {/* ------------------------------------------------------------ índice */}
      <Panel className="mb-4">
        <div className="flex flex-wrap gap-2">
          {secciones.map((s) => (
            <a key={s.id} href={`#${s.id}`}
              className="rounded-lg border border-[#1f2937] bg-[#151d29] px-3 py-1.5
                text-[12.5px] text-[#cbd5e1] hover:border-[#2f6bff] transition-colors">
              {s.titulo}
            </a>
          ))}
        </div>
      </Panel>

      <div className="space-y-4 max-w-4xl">
        {secciones.map((s) => (
          <Panel key={s.id} className="scroll-mt-20">
            <div id={s.id} />
            <PanelTitulo titulo={s.titulo} detalle={s.para}
              accion={s.href
                ? <Link href={s.href}
                    className="text-[12.5px] font-semibold text-[#60a5fa] hover:underline whitespace-nowrap">
                    Ir a {s.titulo} →
                  </Link>
                : <Chip tono="azul">Atajo</Chip>} />

            <ol className="space-y-2">
              {s.pasos.map((p, i) => (
                <li key={i} className="flex gap-3 text-[13px] text-[#cbd5e1] leading-relaxed">
                  <span className="mt-[3px] h-[18px] w-[18px] shrink-0 rounded-full bg-[#1b2433]
                    grid place-items-center text-[10.5px] font-semibold text-[#9aa7b8]">{i + 1}</span>
                  {p}
                </li>
              ))}
            </ol>

            {s.ojo && (
              <p className="mt-4 pt-3 border-t border-[#1f2937] text-[12.5px] text-[#9aa7b8] leading-relaxed">
                <span className="font-semibold text-[#eab308]">Ojo: </span>{s.ojo}
              </p>
            )}
          </Panel>
        ))}
      </div>

      <p className="mt-6 text-[12px] text-[#64748b] max-w-2xl leading-relaxed">
        Si algo no está donde lo buscás o falta una pantalla, decilo. El sistema es de
        Garrahan y se acomoda a cómo trabajan ustedes, no al revés.
      </p>
    </>
  );
}
