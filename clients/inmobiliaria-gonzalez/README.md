# Inmobiliaria Gonzalez - Sitio Web

Sitio web para inmobiliaria con listado de propiedades, búsqueda avanzada y formularios de contacto.

## Estructura del Proyecto

```
inmobiliaria-gonzalez/
├── index.html          # Página principal
├── admin.html          # Panel de administración
├── assets/
│   ├── css/
│   │   └── styles.css  # Estilos (mobile-first)
│   ├── js/
│   │   └── app.js      # Lógica de la aplicación
│   └── images/
│       └── properties/ # Imágenes de propiedades
└── data/
    └── properties.json # Base de datos de propiedades
```

## Cómo usar

### Ver el sitio

Abrir `index.html` en un navegador. Para desarrollo local con todas las funcionalidades:

```bash
# Opción 1: Python
python -m http.server 8080

# Opción 2: Node.js
npx serve

# Opción 3: PHP
php -S localhost:8080
```

Luego abrir http://localhost:8080

### Panel de Administración

Acceder a `admin.html` para:
- Agregar nuevas propiedades (genera JSON para copiar)
- Ver listado de propiedades actuales
- Exportar/descargar datos JSON

### Agregar una propiedad

1. Abrir `admin.html`
2. Completar el formulario con los datos de la propiedad
3. Click en "Generar JSON"
4. Copiar el JSON generado
5. Abrir `data/properties.json`
6. Pegar el nuevo objeto dentro del array "properties"
7. Guardar el archivo

### Agregar imágenes

1. Colocar las imágenes en `assets/images/properties/`
2. Nombrar las imágenes según el patrón: `propiedad[id]-[numero].jpg`
3. Actualizar el campo "images" en el JSON de la propiedad

## Características

- **100% Responsive**: Optimizado para móviles, tablets y desktop
- **Búsqueda avanzada**: Por tipo, operación, ubicación y precio
- **Filtros rápidos**: En la sección de propiedades
- **Favoritos**: Guardados en localStorage
- **Formularios**: Contacto y publicación de propiedades
- **Animaciones sutiles**: Transiciones suaves y reveal al scroll
- **Lazy loading**: Carga diferida de imágenes
- **Sin frameworks**: HTML, CSS y JavaScript puros

## Personalización

### Colores (en styles.css)

```css
:root {
  --primary-color: #1a365d;     /* Azul oscuro */
  --secondary-color: #c9a227;   /* Dorado */
}
```

### Datos de contacto (en index.html)

Buscar la sección `#contacto` y modificar:
- Dirección
- Teléfono
- Email
- Horarios

### Redes sociales (en index.html)

Buscar en el footer los enlaces de Facebook, Instagram y WhatsApp.

## Soporte

Para soporte técnico, contactar al desarrollador.
