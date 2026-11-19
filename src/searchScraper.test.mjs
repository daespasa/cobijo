import test from "node:test";
import assert from "node:assert/strict";
import { parseBookingCard, parseAirbnbCard, evaluate, buildBookingUrl, buildAirbnbUrl, insideZone, zoneGeometry, bookingCoords, airbnbCoords, createGeocoder } from "./searchScraper.mjs";

const TRIP = { checkin: "2026-12-31", checkout: "2027-01-03", adults: 8, bedrooms: 4, pets: 2, maxPerPersonNight: 60 };

test("booking: varias unidades suman dormitorios y precio actual", () => {
  const text = "Apartamentos El Marqués\nCentro de Granada, GranadaMostrar en el mapa\nPuntuación: 9,4\n256 comentarios\n1×\nApartamento Premier\nApartamento entero • 1 dormitorio • 1 sala de estar • 1 baño • 1 cocina\n2×\nApartamento de 1 dormitorio\nApartamento entero • 1 dormitorio • 1 baño\n1×\nEstudio\nEstudio entero • 25 m²\n3 noches, 8 adultos\n€ 3.086€ 2.289\nPrecio original € 3.086. Precio actual € 2.289";
  const r = parseBookingCard(text);
  assert.equal(r.privateRooms, 4);
  assert.equal(r.bathrooms, 3);
  assert.equal(r.totalPrice, 2289);
  assert.equal(r.rating, 9.4);
});

test("booking: '2 apartamentos enteros • 4 dormitorios'", () => {
  const r = parseBookingCard("Be Free Granada\n2×\nApartamento de 2 dormitorios\n2 apartamentos enteros • 4 dormitorios • 2 baños\nPrecio € 1.049");
  assert.equal(r.privateRooms, 4);
  assert.equal(r.units, 2);
  assert.equal(r.totalPrice, 1049);
});

test("airbnb + evaluate", () => {
  const r = parseAirbnbCard("Foto 1 de 6\nCasa rural en Pinos Puente\nValoración media de 4,87 sobre 5, 15 evaluaciones\n4,87 (15)\nCasa Rural Huerta\n4 dormitorios\n8 camas\n1566 € en total");
  assert.equal(r.title, "Casa rural en Pinos Puente");
  assert.equal(r.privateRooms, 4);
  assert.equal(r.totalPrice, 1566);
  assert.equal(r.rating, 4.87);
  const e = evaluate(r, TRIP); // 1566 / 8 / 3 = 65,25
  assert.equal(e.perPersonNight, 65.3);
  assert.equal(e.fitsBudget, false);
  assert.equal(e.fitsPrivacy, true);
});

test("urls: zona, mascotas y comodidades", () => {
  const q = { ...TRIP, amenities: ["parking", "fireplace"] };
  const zone = { type: "circle", name: "Granada", lat: 37.2, lng: -3.6, km: 22.2 };
  const b = new URL(buildBookingUrl(q, zone));
  assert.equal(b.searchParams.get("dest_type"), "latlong");
  assert.equal(b.searchParams.get("nflt"), "privacy_type=3;hotelfacility=4;entire_place_bedroom_count=4;hotelfacility=2"); // chimenea no existe en Booking
  const a = new URL(buildAirbnbUrl(q, zone));
  assert.deepEqual(a.searchParams.getAll("amenities[]"), ["9", "27"]);
  assert.equal(Number(a.searchParams.get("ne_lat")).toFixed(1), "37.4"); // 22,2 km ≈ 0,2°
  assert.equal(a.searchParams.get("pets"), "2");
});

test("zonas: polígono y círculo", () => {
  // triángulo alrededor de Granada
  const tri = { type: "polygon", name: "T", points: [[37.4, -3.9], [37.4, -3.3], [36.9, -3.6]] };
  assert.equal(insideZone(tri, 37.177, -3.599), true); // Granada
  assert.equal(insideZone(tri, 36.721, -4.421), false); // Málaga
  assert.equal(insideZone(tri, 37.0, -3.85), false); // dentro de la caja pero fuera del triángulo
  const g = zoneGeometry(tri);
  assert.ok(g.km > 25 && g.km < 40);
  assert.equal(new URL(buildBookingUrl({ ...TRIP, amenities: [] }, tri)).searchParams.get("radius"), String(Math.ceil(g.km)));
  const c = { type: "circle", name: "C", lat: 40, lng: -3, km: 10 };
  assert.equal(insideZone(c, 40.05, -3), true); // ~5,6 km
  assert.equal(insideZone(c, 40.2, -3), false); // ~22 km
});

test("coordenadas desde los datos internos de cada web", () => {
  const bk = bookingCoords('"location":{"__typename":"Location","city":"Montefrío","latitude":37.32,"longitude":-4.01},"pageName":"casa-del-arrabal"');
  assert.deepEqual(bk.get("casa-del-arrabal"), { lat: 37.32, lng: -4.01 });
  const id = Buffer.from("DemandStayListing:893930296093917414").toString("base64");
  const ab = airbnbCoords(`"id":"${id}","location":{"__typename":"DemandStayListingLocation","coordinate":{"__typename":"Coordinate","latitude":37.105,"longitude":-3.586}}`);
  assert.deepEqual(ab.get("893930296093917414"), { lat: 37.105, lng: -3.586 });
});

test("cancelación gratis, baños y distintivos de Airbnb", () => {
  const bk = parseBookingCard("Casa X\n1×\nCasa entera • 4 dormitorios • 2 baños\nCancelación gratis\nPrecio € 900");
  assert.equal(bk.freeCancellation, 1);
  assert.equal(parseBookingCard("Casa Y\nPrecio € 900").freeCancellation, 0);
  const fav = parseAirbnbCard("Foto 1 de 6\nRecomendación del viajero\nVivienda en Turís\nValoración media de 4,97 sobre 5, 32 evaluaciones\n4,97 (32)\nVilla\n4 dormitorios\n1,5 baños\n900 € en total");
  assert.equal(fav.guestFavorite, 1);
  assert.equal(fav.bathrooms, 1.5);
  assert.equal(fav.title, "Vivienda en Turís");
  assert.equal(fav.isNew, 0);
  const nuevo = parseAirbnbCard("Foto 1 de 6\nVivienda en Catadau\nAlojamiento nuevo\nNuevo\nVilla\n4 dormitorios\n900 € en total");
  assert.equal(nuevo.isNew, 1);
  assert.equal(nuevo.rating, null);
  const q = { ...TRIP, amenities: [], freeCancellation: true };
  const zone = { type: "circle", name: "Venecia", lat: 45.44, lng: 12.33, km: 20 };
  assert.match(new URL(buildBookingUrl(q, zone)).searchParams.get("nflt"), /fc=2/);
  const a = new URL(buildAirbnbUrl(q, zone));
  assert.equal(a.searchParams.get("flexible_cancellation"), "true");
  assert.match(a.pathname, /Venecia/); // fuera de España no se añade nada del país
});

test("distancia al centro y nota de ubicación", async () => {
  const km = parseBookingCard("Be Free Granada\nChana, GranadaMostrar en el mapa\na 2,5 km del centro\nPuntuación: 8,2\nUbicación 9,5\nPrecio € 900");
  assert.equal(km.locationScore, 9.5);
  assert.equal(km.location, "Chana, Granada");
  assert.equal(parseBookingCard("Casa\nUbicación 10\nPrecio € 900").locationScore, 10);
  // el geocodificador resuelve municipio → centro desde la caché, sin preguntar a Nominatim
  const store = new Map([
    ["town|1239,-120", { name: "Granada", lat: null, lng: null }],
    ["center|granada|74,-7", { name: "Granada", lat: 37.1773, lng: -3.5986 }]
  ]);
  const geo = createGeocoder({ get: (k) => store.get(k), set: (k, v) => store.set(k, v) });
  assert.deepEqual(await geo(37.18, -3.59), { name: "Granada", lat: 37.1773, lng: -3.5986 }); // un piso en el Albaicín cuenta como Granada
});
