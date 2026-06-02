# Garrahan Automotores

Sitio web (landing) para **M. Garrahan — Negocio de Automotores**, concesionaria multimarca de vehículos 0km y usados en Chivilcoy, Buenos Aires.

> **Estado:** Frontend de demostración (propuesta comercial). Sin backend.

## Stack
Sitio estático: `index.html` + `assets/css/styles.css` + `assets/js/main.js`. Sin build step.

## Preview
```bash
cd clients/garrahan-automotores
npx serve .
```
O abrir `index.html` directamente en el navegador.

## Secciones
- **Hero** dark con slogan e identidad de marca.
- **Marcas** que comercializa (Fiat, Chery, VW, Renault, Toyota, Citroën, DS).
- **Vehículos** — grilla de stock con filtros (condición / marca / tipo). Datos en `assets/js/main.js` → array `vehiculos`.
- **Financiación** — calculadora de cuota orientativa + beneficios (parte de pago, planes bancarios/propios, gestoría).
- **Galería** del local y entregas.
- **Equipo** — contacto directo con Felipe y Miguel + línea fija.
- **Contacto** — formulario, datos, horarios y mapa de Google Maps embebido.
- **WhatsApp flotante**.

## Datos del negocio
- **Dirección:** Avenida Urquiza 126, Chivilcoy, Buenos Aires (CP 6620)
- **WhatsApp:** Felipe 2345 42-8151 · Miguel 2345 65-3379
- **Fijo:** 43-5837
- **Email:** Mgarrahanautomotores@hotmail.com
- **Instagram:** [@garrahanautomotores](https://instagram.com/garrahanautomotores)

## Pendientes para producción (cuando el cliente confirme)
- Reemplazar fotos de stock (Unsplash) por **fotos reales** de cada unidad.
- Reemplazar imágenes de galería por **fotos reales** del local y entregas.
- Cargar **precios reales** y stock actualizado en el array `vehiculos`.
- El formulario usa **FormSubmit** (`formsubmit.co`). Requiere **activación única**: la primera vez que se envía, llega un email de confirmación a `Mgarrahanautomotores@hotmail.com` que hay que aceptar.
- Confirmar el **código de área** de los celulares (se usó +54 9 2345...) y la línea fija.
- Validar la **tasa de financiación** real (actualmente 5,5% mensual, solo orientativa).
- Verificar el pin exacto del mapa.
