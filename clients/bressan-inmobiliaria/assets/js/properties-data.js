/**
 * VAIRO PROPIEDADES | Properties Data
 * Fetches properties from the API, falls back to hardcoded defaults
 */
(async function() {
  const DEFAULTS = {
    propertyTypes: [
      {"id": "casa", "label": "Casa"},
      {"id": "departamento", "label": "Departamento"},
      {"id": "quinta", "label": "Quinta"},
      {"id": "campo", "label": "Campo"},
      {"id": "ph", "label": "PH"},
      {"id": "local", "label": "Local Comercial"},
      {"id": "oficina", "label": "Oficina"},
      {"id": "terreno", "label": "Terreno"},
      {"id": "lote", "label": "Lote"},
      {"id": "cochera", "label": "Cochera"}
    ],
    operations: [
      {"id": "venta", "label": "Venta"},
      {"id": "alquiler", "label": "Alquiler"},
      {"id": "vendido", "label": "Vendido"},
      {"id": "alquilado", "label": "Alquilado"},
      {"id": "reservado", "label": "Reservado"}
    ],
    neighborhoods: [
      "Centro", "Barrio Norte", "Barrio Sur", "Barrio Belgrano",
      "Villa Casino", "Moctezuma", "La Rural",
      "Moquehuá", "Gorostiaga", "La Rica", "Emilio Ayarza", "San Sebastián",
      "Suipacha", "Bragado", "Alberti", "25 de Mayo"
    ]
  };

  try {
    const res = await fetch('/api/properties');
    if (res.ok) {
      const data = await res.json();
      window.PROPERTIES_DATA = data;
      window.dispatchEvent(new Event('properties-loaded'));
      return;
    }
  } catch (e) {
    console.warn('API not available, using default data');
  }

  // Fallback hardcodeado (solo se usa si el backend no responde)
  window.PROPERTIES_DATA = {
    ...DEFAULTS,
    properties: []
  };
  window.dispatchEvent(new Event('properties-loaded'));
})();
