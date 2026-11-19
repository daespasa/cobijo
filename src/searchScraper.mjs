const nights = (trip) => Math.round((new Date(trip.checkout) - new Date(trip.checkin)) / 86400000);
const euros = (s) => (s ? Number(s.replace(/\./g, "").replace(",", ".")) : null);
const num = (re, text) => {
  const m = text.match(re);
  return m ? Number(m[1].replace(",", ".")) : null;
};

// Códigos sacados de los filtros reales de cada web (nov 2026). Sin código = esa web no lo filtra.
export const AMENITIES = {
  parking: { label: "Parking", booking: "hotelfacility=2", airbnb: 9 },
  wifi: { label: "WiFi", booking: "hotelfacility=107", airbnb: 4 },
  kitchen: { label: "Cocina", booking: "roomfacility=999", airbnb: 8 },
  ac: { label: "Aire acondicionado", booking: "roomfacility=11", airbnb: 5 },
  heating: { label: "Calefacción", airbnb: 30 },
  fireplace: { label: "Chimenea", airbnb: 27 },
  pool: { label: "Piscina", booking: "hotelfacility=433", airbnb: 7 },
  jacuzzi: { label: "Jacuzzi", airbnb: 25 },
  bbq: { label: "Barbacoa", airbnb: 99 },
  washer: { label: "Lavadora", airbnb: 33 },
  balcony: { label: "Balcón", booking: "roomfacility=17" }
};

// ---------- Geometría de zonas ----------
// zone = { type: "circle", name, lat, lng, km } | { type: "polygon", name, points: [[lat, lng], ...] }
const toRad = (d) => (d * Math.PI) / 180;
export function haversineKm(aLat, aLng, bLat, bLng) {
  const h = Math.sin(toRad(bLat - aLat) / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(toRad(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function zoneGeometry(zone) {
  if (zone.type === "polygon") {
    const lats = zone.points.map((p) => p[0]);
    const lngs = zone.points.map((p) => p[1]);
    const bounds = { n: Math.max(...lats), s: Math.min(...lats), e: Math.max(...lngs), w: Math.min(...lngs) };
    const center = { lat: (bounds.n + bounds.s) / 2, lng: (bounds.e + bounds.w) / 2 };
    const km = Math.max(...zone.points.map(([la, ln]) => haversineKm(center.lat, center.lng, la, ln)));
    return { center, km, bounds };
  }
  const dLat = zone.km / 111;
  const dLng = zone.km / (111 * Math.cos(toRad(zone.lat)));
  return { center: { lat: zone.lat, lng: zone.lng }, km: zone.km, bounds: { n: zone.lat + dLat, s: zone.lat - dLat, e: zone.lng + dLng, w: zone.lng - dLng } };
}

export function insideZone(zone, lat, lng) {
  if (zone.type !== "polygon") return haversineKm(zone.lat, zone.lng, lat, lng) <= zone.km;
  let inside = false; // ray casting
  const pts = zone.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [yi, xi] = pts[i];
    const [yj, xj] = pts[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// q = { checkin, checkout, adults, bedrooms, pets, maxPerPersonNight, amenities[], providers[], pages, zones[] }
export function buildBookingUrl(q, zone) {
  const g = zoneGeometry(zone);
  const u = new URL("https://www.booking.com/searchresults.es.html");
  const nflt = ["privacy_type=3"]; // alojamientos enteros
  if (q.pets) nflt.push("hotelfacility=4");
  if (q.bedrooms) nflt.push(`entire_place_bedroom_count=${q.bedrooms}`);
  for (const a of q.amenities || []) if (AMENITIES[a]?.booking) nflt.push(AMENITIES[a].booking);
  const p = {
    latitude: g.center.lat.toFixed(5),
    longitude: g.center.lng.toFixed(5),
    dest_type: "latlong",
    radius: Math.ceil(g.km),
    checkin: q.checkin,
    checkout: q.checkout,
    group_adults: q.adults,
    no_rooms: Math.max(1, q.bedrooms || 1),
    group_children: 0,
    selected_currency: "EUR",
    lang: "es",
    order: "price",
    nflt: nflt.join(";")
  };
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, String(v));
  return u.toString();
}

export function buildAirbnbUrl(q, zone) {
  // la caja manda en el área; el nombre en la ruta solo hace que Airbnb muestre tarjetas completas (dormitorios, pueblo)
  const u = new URL(`https://www.airbnb.es/s/${encodeURIComponent(zone.name || "España")}/homes`);
  const { bounds: b } = zoneGeometry(zone);
  const p = {
    search_by_map: true,
    ne_lat: b.n,
    ne_lng: b.e,
    sw_lat: b.s,
    sw_lng: b.w,
    checkin: q.checkin,
    checkout: q.checkout,
    adults: q.adults,
    pets: q.pets || 0,
    min_bedrooms: q.bedrooms || 0,
    currency: "EUR",
    "room_types[]": "Entire home/apt"
  };
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, String(v));
  for (const a of q.amenities || []) if (AMENITIES[a]?.airbnb) u.searchParams.append("amenities[]", String(AMENITIES[a].airbnb));
  return u.toString();
}

// Booking agrupa a veces varias unidades ("2×  Apartamento ..."): sumamos dormitorios por unidad.
export function parseBookingCard(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let mult = 1;
  let privateRooms = 0;
  let bathrooms = 0;
  let units = 0;
  for (const line of lines) {
    const m = line.match(/^(\d+)×$/);
    if (m) mult = Number(m[1]);
    else if (/\benter[oa]s?\b/i.test(line) && line.includes("•") || /^(estudio|apartamento|casa|villa|chalet)[^•]*enter[oa]/i.test(line)) {
      // "2 apartamentos enteros • 4 dormitorios" ya es total; "2×" + "Apartamento entero • 1 dormitorio" hay que multiplicar
      const explicit = num(/^(\d+)\s+\w+\s+enter[oa]s/i, line);
      const unitCount = explicit || mult;
      const k = explicit ? 1 : mult;
      const beds = num(/(\d+)\s+dormitorios?/i, line);
      privateRooms += beds !== null ? beds * k : unitCount; // un estudio entero cuenta como 1 espacio privado
      bathrooms += (num(/(\d+)\s+baños?/i, line) || 0) * k;
      units += unitCount;
      mult = 1;
    }
  }
  const price = euros(text.match(/Precio actual €\s?([\d.,]+)/)?.[1]) ?? euros(text.match(/Precio €\s?([\d.,]+)/)?.[1]);
  return {
    title: lines[0] || "",
    location: lines.find((l) => /Mostrar en el mapa/.test(l))?.replace("Mostrar en el mapa", "") || "",
    rating: num(/Puntuación:\s*([\d,]+)/, text),
    reviews: euros(text.match(/([\d.]+)\s+comentarios?/)?.[1]),
    privateRooms: privateRooms || null,
    bathrooms: bathrooms || null,
    units: units || null,
    totalPrice: price
  };
}

export function parseAirbnbCard(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => !/^Foto \d/.test(l));
  const titleIdx = lines.findIndex((l) => / en /.test(l) && !/Valoración|total/.test(l));
  const totals = [...text.matchAll(/([\d.]+)\s*€(?=[^€]*en total)/g)];
  return {
    title: lines[titleIdx] || "",
    location: lines[titleIdx]?.split(" en ").slice(1).join(" en ") || "",
    subtitle: lines.find((l, i) => i > titleIdx && !/Valoración|^\d|^[,·]|Anfitri|Superanfitri|€/.test(l)) || "",
    rating: num(/(\d,\d+)\s*\(\d+\)/, text),
    reviews: num(/\d,\d+\s*\((\d+)\)/, text),
    privateRooms: num(/(\d+)\s+dormitorios?/, text),
    beds: num(/(\d+)\s+camas?/, text),
    bathrooms: null,
    totalPrice: totals.length ? euros(totals[0][1]) : null
  };
}

export function evaluate(item, trip) {
  const perPersonNight = item.totalPrice ? item.totalPrice / trip.adults / nights(trip) : null;
  return {
    ...item,
    perPersonNight: perPersonNight && Math.round(perPersonNight * 10) / 10,
    perNight: item.totalPrice && Math.round(item.totalPrice / nights(trip)),
    fitsBudget: perPersonNight !== null && perPersonNight <= trip.maxPerPersonNight,
    fitsPrivacy: (item.privateRooms || 0) >= (trip.bedrooms || 0)
  };
}

const cleanUrl = (href) => {
  const u = new URL(href);
  const keep = ["checkin", "checkout", "check_in", "check_out", "group_adults", "no_rooms", "adults", "pets", "all_sr_blocks"];
  for (const k of [...u.searchParams.keys()]) if (!keep.includes(k)) u.searchParams.delete(k);
  return u.toString();
};

async function scrollAll(page) {
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(600);
  }
}

async function dismissCookies(page) {
  for (const label of ["Aceptar", "Aceptar todo", "Aceptar todas", "OK"]) {
    const btn = page.getByRole("button", { name: label, exact: true });
    if (await btn.first().isVisible().catch(() => false)) {
      await btn.first().click().catch(() => {});
      return;
    }
  }
}

// Guarda el texto de las respuestas de la API interna (traen coordenadas de cada anuncio).
function captureResponses(page, urlRe) {
  const texts = [];
  const onResponse = async (r) => {
    if (urlRe.test(r.url())) texts.push(await r.text().catch(() => ""));
  };
  page.on("response", onResponse);
  return { texts, stop: () => page.off("response", onResponse) };
}

export function bookingCoords(text) {
  const m = new Map(); // pageName -> {lat,lng}
  for (const [, lat, lng, name] of text.matchAll(/"latitude":(-?[\d.]+),"longitude":(-?[\d.]+)\},"pageName":"([^"]+)"/g)) m.set(name, { lat: Number(lat), lng: Number(lng) });
  return m;
}

export function airbnbCoords(text) {
  const m = new Map(); // roomId -> {lat,lng}
  const re = /"id":"([A-Za-z0-9+/=]+)","location":\{"__typename":"DemandStayListingLocation","coordinate":\{"__typename":"Coordinate","latitude":(-?[\d.]+),"longitude":(-?[\d.]+)/g;
  for (const [, id, lat, lng] of text.matchAll(re)) {
    const room = Buffer.from(id, "base64").toString().split(":")[1];
    if (room) m.set(room, { lat: Number(lat), lng: Number(lng) });
  }
  return m;
}

export async function searchBooking(page, zone, trip, { pages = 2 } = {}) {
  const url = buildBookingUrl(trip, zone);
  const cap = captureResponses(page, /\/dml\/graphql/);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="property-card"]', { timeout: 20000 }).catch(() => {});
  await dismissCookies(page);
  for (let i = 1; i < pages; i += 1) {
    await scrollAll(page);
    const more = page.getByRole("button", { name: /Cargar más resultados/i });
    if (!(await more.isVisible().catch(() => false))) break;
    await more.click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  const cards = await page.$$eval('[data-testid="property-card"]', (els) =>
    els.map((e) => ({ text: e.innerText, href: e.querySelector('a[data-testid="title-link"]')?.href }))
  );
  cap.stop();
  const coords = bookingCoords([await page.content(), ...cap.texts].join("\n"));
  return {
    searchUrl: url,
    items: cards
      .filter((c) => c.href)
      .map((c) => {
        const slug = c.href.match(/\/hotel\/[a-z]{2}\/([^./?]+)/)?.[1];
        return { provider: "booking", zone: zone.name, url: cleanUrl(c.href), ...parseBookingCard(c.text), ...coords.get(slug) };
      })
  };
}

export async function searchAirbnb(page, zone, trip, { pages = 2 } = {}) {
  const url = buildAirbnbUrl(trip, zone);
  const cap = captureResponses(page, /\/api\/v3\/StaysSearch/);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const byId = new Map();
  let coords = new Map();
  for (let i = 0; i < pages; i += 1) {
    await page.waitForSelector('[itemprop="itemListElement"]', { timeout: 20000 }).catch(() => {});
    await dismissCookies(page);
    await scrollAll(page);
    const cards = await page.$$eval('[itemprop="itemListElement"]', (els) =>
      els.map((e) => ({ text: e.innerText, href: e.querySelector('a[href*="/rooms/"]')?.href }))
    );
    coords = new Map([...coords, ...airbnbCoords([await page.content(), ...cap.texts].join("\n"))]);
    for (const c of cards) {
      const id = c.href?.match(/\/rooms\/(\d+)/)?.[1];
      // Airbnb mezcla sugerencias con otras fechas: su precio no es comparable
      const sameDates = c.href?.includes(`check_in=${trip.checkin}`) && c.href.includes(`check_out=${trip.checkout}`);
      if (id && sameDates && !byId.has(id)) byId.set(id, { provider: "airbnb", zone: zone.name, url: cleanUrl(c.href), ...parseAirbnbCard(c.text), ...coords.get(id) });
    }
    const next = page.locator('a[aria-label="Siguiente"]');
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  cap.stop();
  return { searchUrl: url, items: [...byId.values()] };
}

const RUNNERS = { booking: searchBooking, airbnb: searchAirbnb };

// Recorre zonas × webs con un solo navegador, que se cierra al acabar (en reposo no consume nada).
// hooks: onItems(items, step), onProgress(text), cancelled() -> bool
export async function runSearch(q, hooks = {}, { headed = false } = {}) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: !headed });
  const failures = [];
  const seen = new Set(); // el mismo anuncio sale en zonas solapadas
  try {
    const context = await browser.newContext({
      locale: "es-ES",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 1200 }
    });
    // no descargar imágenes ni fuentes: menos red y menos RAM
    await context.route("**/*", (r) => (["image", "media", "font"].includes(r.request().resourceType()) ? r.abort() : r.continue()));
    const page = await context.newPage();
    const steps = q.zones.flatMap((zone) => q.providers.map((provider) => ({ zone, provider })));
    for (const [i, step] of steps.entries()) {
      if (hooks.cancelled?.()) break;
      hooks.onProgress?.(`${step.zone.name} · ${step.provider} (${i + 1}/${steps.length})`);
      try {
        const { items, searchUrl } = await RUNNERS[step.provider](page, step.zone, q, { pages: q.pages });
        // Booking interpreta el radio con holgura y la caja de Airbnb es mayor que un polígono: recorte exacto si hay coordenadas
        const fresh = items
          .filter((it) => it.lat == null || insideZone(step.zone, it.lat, it.lng))
          .filter((it) => {
            const id = it.url.split("?")[0];
            return !seen.has(id) && seen.add(id);
          });
        hooks.onItems?.(fresh.map((it) => evaluate(it, q)), step);
        if (!items.length) failures.push({ ...step, zone: step.zone.name, error: "0 resultados", searchUrl });
      } catch (e) {
        failures.push({ ...step, zone: step.zone.name, error: e.message.split("\n")[0] });
      }
    }
  } finally {
    await browser.close();
  }
  return { failures };
}
