// Valores por defecto del formulario: fin de año, 4 parejas + 2 perros, saliendo de Sueca.
export const DEFAULTS = {
  checkin: "2026-12-31",
  checkout: "2027-01-03",
  adults: 8,
  bedrooms: 4, // una habitación/unidad por pareja
  pets: 2,
  maxPerPersonNight: 60,
  amenities: [],
  providers: ["booking", "airbnb"],
  pages: 2
};

export const ORIGIN = { name: "Sueca", lat: 39.203, lng: -0.311 };

// Presets del mapa ("ciudades a 6 h o menos").
// ponytail: horas de coche desde Sueca aproximadas a mano (Google Maps, sin tráfico).
// lat/lng: centro de la ciudad; Airbnb busca en una caja alrededor (geocodifica mal por nombre).
// Añade/quita destinos aquí; si quieres precisión, cámbialo por una API de rutas.
export const DESTINATIONS = [
  { name: "Teruel", hours: 2.2, lat: 40.344, lng: -1.106 },
  { name: "Albarracín", hours: 2.6, lat: 40.408, lng: -1.444 },
  { name: "Cuenca", hours: 2.6, lat: 40.07, lng: -2.137 },
  { name: "Zaragoza", hours: 3.6, lat: 41.649, lng: -0.889 },
  { name: "Almería", hours: 3.9, lat: 36.834, lng: -2.463 },
  { name: "Úbeda", hours: 4.0, lat: 38.013, lng: -3.37 },
  { name: "Soria", hours: 4.1, lat: 41.764, lng: -2.465 },
  { name: "Toledo", hours: 4.1, lat: 39.863, lng: -4.027 },
  { name: "Huesca", hours: 4.2, lat: 42.14, lng: -0.408 },
  { name: "Segovia", hours: 4.6, lat: 40.948, lng: -4.118 },
  { name: "Ávila", hours: 4.6, lat: 40.656, lng: -4.7 },
  { name: "Granada", hours: 4.7, lat: 37.177, lng: -3.599 },
  { name: "Logroño", hours: 4.7, lat: 42.466, lng: -2.445 },
  { name: "Pamplona", hours: 4.8, lat: 42.812, lng: -1.645 },
  { name: "Córdoba", hours: 5.2, lat: 37.888, lng: -4.779 },
  { name: "Burgos", hours: 5.2, lat: 42.344, lng: -3.697 },
  { name: "Valladolid", hours: 5.3, lat: 41.652, lng: -4.724 },
  { name: "Jaca", hours: 5.0, lat: 42.57, lng: -0.549 },
  { name: "Salamanca", hours: 5.7, lat: 40.97, lng: -5.664 },
  { name: "Málaga", hours: 5.8, lat: 36.721, lng: -4.421 }
];
