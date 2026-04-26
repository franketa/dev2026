/**
 * INMOBILIARIA DI IORIO - Properties Data
 * Fetches properties from the API, falls back to hardcoded defaults
 */
(async function() {
  const DEFAULTS = {
    propertyTypes: [
      {"id": "casa", "label": "Casa"},
      {"id": "departamento", "label": "Departamento"},
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
      "Barrio Norte", "Palermo", "Villa Crespo", "Recoleta", "Belgrano",
      "Caballito", "Microcentro",
      "Chivilcoy", "Alberti", "25 de Mayo", "Bragado", "Chacabuco"
    ]
  };

  try {
    const res = await fetch('/api/properties');
    if (res.ok) {
      const data = await res.json();
      window.PROPERTIES_DATA = data;
      // Dispatch event so app.js knows data is ready
      window.dispatchEvent(new Event('properties-loaded'));
      return;
    }
  } catch (e) {
    console.warn('API not available, using default data');
  }

  // Fallback: hardcoded default properties (for static/offline use)
  window.PROPERTIES_DATA = {
    ...DEFAULTS,
    properties: [
      {"id":1,"title":"Casa en Barrio Norte","type":"casa","operation":"venta","price":185000,"currency":"USD","location":{"neighborhood":"Barrio Norte","city":"Buenos Aires","address":"Av. Santa Fe 2500"},"features":{"bedrooms":4,"bathrooms":3,"garage":2,"area":280,"coveredArea":220},"description":"Hermosa casa de 4 ambientes con jardin y pileta.","amenities":["pileta","jardin","parrilla","seguridad 24hs"],"images":["casa1-1.jpg","casa1-2.jpg","casa1-3.jpg"],"featured":true,"status":"disponible","createdAt":"2024-01-15"},
      {"id":2,"title":"Departamento en Palermo","type":"departamento","operation":"venta","price":125000,"currency":"USD","location":{"neighborhood":"Palermo","city":"Buenos Aires","address":"Honduras 4800"},"features":{"bedrooms":2,"bathrooms":1,"garage":1,"area":75,"coveredArea":70},"description":"Moderno departamento de 2 ambientes en Palermo Hollywood.","amenities":["gimnasio","sum","laundry","seguridad 24hs"],"images":["depto2-1.jpg","depto2-2.jpg","depto2-3.jpg"],"featured":true,"status":"disponible","createdAt":"2024-01-10"},
      {"id":3,"title":"PH en Villa Crespo","type":"ph","operation":"venta","price":98000,"currency":"USD","location":{"neighborhood":"Villa Crespo","city":"Buenos Aires","address":"Corrientes 5200"},"features":{"bedrooms":3,"bathrooms":2,"garage":0,"area":120,"coveredArea":100},"description":"PH luminoso de 3 ambientes con terraza propia.","amenities":["terraza","parrilla"],"images":["ph3-1.jpg","ph3-2.jpg"],"featured":false,"status":"disponible","createdAt":"2024-01-08"},
      {"id":4,"title":"Departamento en Recoleta","type":"departamento","operation":"alquiler","price":450000,"currency":"ARS","location":{"neighborhood":"Recoleta","city":"Buenos Aires","address":"Av. Callao 1200"},"features":{"bedrooms":3,"bathrooms":2,"garage":1,"area":95,"coveredArea":90},"description":"Elegante departamento en edificio clasico de Recoleta.","amenities":["portero","ascensor"],"images":["depto4-1.jpg","depto4-2.jpg","depto4-3.jpg"],"featured":true,"status":"disponible","createdAt":"2024-01-12"},
      {"id":5,"title":"Casa en Belgrano","type":"casa","operation":"venta","price":320000,"currency":"USD","location":{"neighborhood":"Belgrano","city":"Buenos Aires","address":"Juramento 2800"},"features":{"bedrooms":5,"bathrooms":4,"garage":2,"area":350,"coveredArea":280},"description":"Espectacular casa de 5 ambientes en Belgrano R.","amenities":["pileta climatizada","quincho","jardin","seguridad 24hs","alarma"],"images":["casa5-1.jpg","casa5-2.jpg","casa5-3.jpg","casa5-4.jpg"],"featured":true,"status":"disponible","createdAt":"2024-01-14"},
      {"id":6,"title":"Monoambiente en Caballito","type":"departamento","operation":"alquiler","price":180000,"currency":"ARS","location":{"neighborhood":"Caballito","city":"Buenos Aires","address":"Av. Rivadavia 5400"},"features":{"bedrooms":1,"bathrooms":1,"garage":0,"area":35,"coveredArea":35},"description":"Monoambiente divisible, ideal para estudiantes.","amenities":["ascensor","laundry"],"images":["mono6-1.jpg","mono6-2.jpg"],"featured":false,"status":"disponible","createdAt":"2024-01-05"}
    ]
  };
  window.dispatchEvent(new Event('properties-loaded'));
})();
