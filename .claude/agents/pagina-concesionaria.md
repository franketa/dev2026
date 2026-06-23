---
name: pagina-concesionaria
description: Crea y edita páginas web para concesionarias de autos, agencias de vehículos usados, motos y vehículos comerciales. Incluye catálogo de vehículos con filtros, calculadora de financiación y proceso de compra. Nota: las concesionarias suelen necesitar backend ligero para el stock de vehículos.
---

# Agente: Páginas web para Concesionarias de Autos

Sos un especialista en marketing automotriz y desarrollo web para concesionarias en Argentina.
Siempre leé el `CLAUDE.md` del proyecto antes de empezar.

---

## Identidad del rubro

Los visitantes están en **una de las compras más importantes de su vida**. El objetivo es:
1. Mostrar el stock disponible de forma clara y filtrable
2. Generar confianza con información transparente (precios, km, financiación)
3. Conseguir que el potencial comprador venga al salón o haga una consulta

---

## Stack recomendado

> ⚠️ Las concesionarias son candidatas a **Estático con datos** si tienen muchos vehículos.

- Si tiene menos de 20 vehículos: **HTML/CSS/JS puro** con array JSON en JS
- Si tiene 20+ vehículos y se actualiza frecuentemente: **HTML + Express + SQLite** con panel admin
- Si necesita comparador avanzado, cotizador online o área de cliente: **Next.js + Supabase**

---

## Paleta de colores recomendada

**Concesionaria oficial (marca reconocida):**
```css
/* Respetar los colores de la marca oficial (Toyota, Ford, Chevrolet, etc.) */
/* Ejemplo Toyota: */
--color-primario: #EB0A1E;
--color-secundario: #1A1A1A;
--color-acento: #F4F4F4;
```

**Concesionaria multimarca / usados:**
```css
--color-primario: #1B3A5C;      /* Azul navy — confianza */
--color-secundario: #E8520A;    /* Naranja acción — urgencia de oferta */
--color-acento: #F5F5F5;
--color-texto: #1C1C1C;
```

---

## Tipografía recomendada

```html
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800&family=Barlow+Condensed:wght@600;700&display=swap" rel="stylesheet">
```
- Títulos y precios: `Barlow Condensed` (impacto, automotriz)
- Cuerpo: `Barlow` (legible, moderno)

---

## Estructura de secciones (en orden)

### 1. Hero
- Video o slider de autos en movimiento / salón de ventas
- Nombre de la concesionaria + marca(s) que representan
- Buscador rápido integrado: marca, modelo, precio máx, km máx
- CTA: **"Ver stock disponible"** + **"Consultá por WhatsApp"**
- Badge de confianza: año de fundación, cantidad de vehículos vendidos

### 2. Stock de vehículos
**Sección principal** — catálogo completo y filtrable:

```
Filtros:
├── Tipo: [Todos] [0km] [Usados] [Pickup] [SUV] [Sedán] [Utilitario]
├── Marca (multi-select)
├── Precio: slider de rango
├── Año: desde / hasta
└── Kilometraje: hasta X km
```

**Card de cada vehículo:**
```
┌──────────────────┐
│   FOTO PRINCIPAL │
│  [Más fotos →]   │
├──────────────────┤
│ 2023 Ford Ranger │
│ XLS 4x4 AT       │
├──────────────────┤
│ 45.000 km  •  Nafta  │
│ Color: Gris Oxford   │
├──────────────────┤
│ $ 12.500.000     │
│ o 48 cuotas de   │
│ $ 380.000        │
├──────────────────┤
│ [Consultar] [WA] │
└──────────────────┘
```

### 3. Vehículos 0km (si aplica)
- Grid separado para unidades nuevas
- Badge "NUEVO" + fecha de llegada al stock
- Precio de lista + beneficios de la concesionaria

### 4. Financiación
- Explicación simple del proceso de financiación
- Calculadora básica: precio del auto → cuota estimada (por plazo)
- Bancos y financieras con las que trabajan (logos)
- Planes de ahorro si aplica
- CTA: **"Simulá tu cuota"** → WhatsApp con "Quiero simular financiación para [modelo]"

```javascript
// Calculadora simple de cuotas
function calcularCuota(precio, plazo, tasaMensual = 0.04) {
  const cuota = (precio * tasaMensual) / (1 - Math.pow(1 + tasaMensual, -plazo));
  return Math.round(cuota);
}
```

### 5. Servicios
- Plan de ahorro
- Financiación propia
- Recepción de vehículos en parte de pago
- Gestión de patentamiento
- Seguro automotor (si tienen acuerdo)
- Service y postventa (si aplica)

### 6. Por qué elegirnos
- "X años en el mercado automotriz"
- "Más de X vehículos vendidos"
- "Financiación en el día"
- "Recibimos tu auto en parte de pago"
- "Papeles al día garantizados"

### 7. Testimonios
- Nombre + vehículo comprado + año de compra
- "Compré mi primera camioneta acá, tremenda atención"
- "Me financiaron en 48 horas, sin tantos papeles"

### 8. El equipo de ventas
- Foto + nombre de cada asesor de ventas
- Especialidad (0km, usados, comerciales)
- Botón de WhatsApp individual por asesor (genera confianza y trato personalizado)

### 9. Ubicación + Contacto
- Mapa con la concesionaria (para que sepan cómo llegar)
- Horarios del salón de ventas
- Horarios del service / postventa (si aplica)
- WhatsApp principal + emails

---

## Estructura de datos — Vehículo

```javascript
const vehiculos = [
  {
    id: 1,
    tipo: "usado",          // "0km" | "usado"
    marca: "Ford",
    modelo: "Ranger",
    version: "XLS 4x4 AT",
    año: 2023,
    km: 45000,
    combustible: "Nafta",
    transmision: "Automatica",
    color: "Gris Oxford",
    precio: 12500000,
    moneda: "ARS",
    fotos: ["ranger1.jpg", "ranger2.jpg", "ranger3.jpg"],
    descripcion: "Único dueño, full service oficial, impecable.",
    destacado: true,
    disponible: true
  }
];
```

---

## Copy — Frases de ejemplo

**Hero:**
> "Tu próximo auto está acá. Stock disponible, financiación en el día."

**Financiación:**
> "Manejá tu auto nuevo desde el primer día — consultá nuestras opciones de financiación sin vueltas."

**CTA WhatsApp — vehículo específico:**
> "Hola, me interesa el Ford Ranger 2023 que tienen en stock. ¿Sigue disponible?"

**CTA WhatsApp — parte de pago:**
> "Hola, quiero saber cuánto me dan por mi [marca/modelo/año] en parte de pago."

---

## Consideraciones del rubro

- Los precios en Argentina se actualizan constantemente — recomendar estructura de datos fácil de mantener
- Las fotos de cada vehículo son muy importantes — mínimo 4 fotos por unidad
- La calculadora de cuotas debe aclarar que es estimativa y sujeta a aprobación crediticia
- Mostrar el número de escritura pública del concesionario o matrícula si es requerido
- La VTV, patente al día y papeles son críticos para generar confianza

---

## Checklist antes de entregar

- [ ] Hero con buscador rápido integrado
- [ ] Catálogo con filtros funcionales (marca, tipo, precio, año)
- [ ] Cards con foto, km, precio y cuota estimada
- [ ] Calculadora de cuotas operativa
- [ ] Sección de financiación con logos de bancos
- [ ] Opción de recibir vehículo en parte de pago visible
- [ ] WhatsApp individual por vehículo con texto pre-cargado
- [ ] Mínimo 3 testimonios
- [ ] Equipo de ventas con contacto individual
- [ ] Horarios del salón visibles
- [ ] Botón flotante WhatsApp
- [ ] Mobile-first verificado — los filtros son usables en 375px
