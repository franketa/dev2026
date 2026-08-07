# QR de Garrahan — Negocio de Automotores

## Archivos

| Archivo | Qué es | Cuándo usarlo |
|---|---|---|
| `escaneame-camioneta.svg` | Pieza completa: "Escanéame!" + QR. Vectorial. | **Es el que hay que mandar al gráfico.** Escala a cualquier tamaño sin pixelarse. |
| `escaneame-camioneta.png` | La misma pieza, 2160 × 2700 px | Por si el gráfico no trabaja con SVG. |
| `qr-camioneta.svg` / `.png` | El QR solo, sin texto | Si lo quieren maquetar dentro de otro diseño. |

El texto del SVG está **convertido a curvas**: imprime igual en cualquier máquina,
sin depender de que tengan instalada la tipografía.

## A dónde apunta

```
https://garrahanautomotores.com.ar/qr/camioneta
```

Esa URL registra el escaneo y redirige al inicio del sitio. **No es una URL de un
servicio de terceros**: es del dominio propio, así que el QR no se vence ni deja de
funcionar nunca.

Los escaneos se ven en el panel: `garrahanautomotores.com.ar/admin.html` → sección
**QR · Escaneos**.

## Para imprimir

- **Tamaño mínimo recomendado: 15 cm de lado del QR.** Ideal 25–30 cm para la camioneta.
  La regla práctica es que se escanea desde unas 10 veces la medida del QR: 25 cm se
  lee cómodo desde ~2,5 m.
- **Dejar el margen blanco alrededor del QR.** Ya viene incluido en el archivo; si lo
  recortan, muchos lectores dejan de reconocerlo.
- **Negro sobre blanco.** No invertir los colores ni poner el QR sobre una foto.
- Corrección de errores **nivel H**: aguanta hasta un 30% del código tapado o rayado,
  que es lo que corresponde para algo que va a la intemperie y se ensucia.

## Más QRs

El sistema acepta cualquier código: `/qr/vidriera`, `/qr/folleto`, `/qr/tarjeta`, etc.
Cada uno se cuenta por separado en el panel y aparece solo la primera vez que alguien
lo escanea. Para generar la pieza de un código nuevo no hace falta tocar el servidor.
