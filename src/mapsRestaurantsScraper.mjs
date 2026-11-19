const COMMON_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function safeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function safeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseReviewCount(value) {
  if (!value) return null;
  const parsed = Number(String(value).replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildMapsSearchUrl(query) {
  const encoded = encodeURIComponent(query);
  return `https://www.google.com/maps/search/${encoded}?hl=es`;
}

function extractCoordinates(url) {
  const text = safeText(url);
  const match = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  return {
    latitude: safeNumber(match[1]),
    longitude: safeNumber(match[2])
  };
}

function distanceKm(a, b) {
  if (!a?.latitude || !a?.longitude || !b?.latitude || !b?.longitude) return null;
  const earthRadius = 6371;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

async function handleConsent(page) {
  const title = await page.title().catch(() => "");
  const url = page.url();
  if (!/Antes de ir a Google/i.test(title) && !/consent\.google/i.test(url)) return false;

  const clicked = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('button, input[type="submit"]')];
    const target = controls.find((control) => /rechazar todo/i.test(control.textContent || control.value || control.getAttribute("aria-label") || ""))
      || controls.find((control) => /aceptar todo/i.test(control.textContent || control.value || control.getAttribute("aria-label") || ""));
    if (!target) return false;
    target.click();
    return true;
  }).catch(() => false);

  if (clicked) {
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }

  return clicked;
}

async function scrollResults(page, rounds = 3) {
  for (let i = 0; i < rounds; i += 1) {
    await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      if (feed) feed.scrollTop = feed.scrollHeight;
    });
    await page.waitForTimeout(1200);
  }
}

function parsePrice(text) {
  const match = safeText(text).match(/(Más de\s*\d+\s*€|\d+\s*-\s*\d+\s*€|[€]{1,4})/i);
  return match ? safeText(match[1]).replace(/\s*-\s*/g, "-").replace(/\s+/g, " ") : null;
}

function parseRating(text) {
  const match = safeText(text).match(/(\d+[,.]\d+)\s*\(([\d.,]+)\)/);
  return {
    rating: match ? safeNumber(match[1]) : null,
    review_count: match ? parseReviewCount(match[2]) : null
  };
}

function stripKnownPrefixes(text, name) {
  let value = safeText(text);
  if (name && value.toLowerCase().startsWith(name.toLowerCase())) {
    value = value.slice(name.length).trim();
  }
  return value;
}

function parseSnippet(text) {
  const match = safeText(text).match(/"([^"]{15,260})"/);
  return match ? safeText(match[1]) : null;
}

function parseOpenInfo(text) {
  const match = safeText(text).match(/(Abierto|Cerrado)[^"]{0,180}/i);
  return match ? safeText(match[0]).replace(/\s*.*$/, "") : null;
}

function parseCategoryAndAddress(text, price) {
  let value = safeText(text);
  const ratingMatch = value.match(/\d+[,.]\d+\s*\([\d.,]+\)/);
  if (ratingMatch) value = value.slice(ratingMatch.index + ratingMatch[0].length);
  if (price) value = value.replace(price, "");
  value = value.replace(/[·]+/g, " ").replace(/\s+/g, " ").trim();

  const statusIndex = value.search(/(Abierto|Cerrado|Cierra pronto)/i);
  if (statusIndex >= 0) value = value.slice(0, statusIndex).trim();
  value = value.replace(/Reservar mesa.*/i, "").trim();
  value = value.replace(/"[^"]+"/g, "").trim();

  const knownTypes = [
    "Restaurante",
    "Bar",
    "Cafetería",
    "Cafeteria",
    "Taberna",
    "Parrilla",
    "Marisquería",
    "Marisqueria",
    "Brasería",
    "Braseria",
    "Española",
    "Gallega",
    "Cocina gallega",
    "Italiana",
    "Marroquí",
    "Marroqui"
  ];
  const category = knownTypes.find((type) => new RegExp(`\\b${type}\\b`, "i").test(value)) || null;
  const address = category
    ? safeText(value.split(new RegExp(`\\b${category}\\b`, "i")).pop())
    : value || null;

  return {
    category,
    address: address || null
  };
}

export function parseRestaurantCard({ city, query, articleText, link }) {
  const name = safeText(link?.name) || safeText(articleText).split(/\s+\d+[,.]\d+\(/)[0];
  const textWithoutName = stripKnownPrefixes(articleText, name);
  const { rating, review_count } = parseRating(articleText);
  const price = parsePrice(articleText);
  const { category, address } = parseCategoryAndAddress(textWithoutName, price);
  const reviewSnippet = parseSnippet(articleText);
  const openInfo = parseOpenInfo(articleText);
  const coordinates = extractCoordinates(link?.href);
  const distanceFromStopKm = distanceKm(city.center, coordinates);

  return {
    name,
    city: city.name,
    city_id: city.id,
    source: "google_maps",
    query,
    url: link?.href || null,
    coordinates,
    distance_from_stop_km: distanceFromStopKm !== null ? Math.round(distanceFromStopKm * 10) / 10 : null,
    rating,
    review_count,
    price_range: price,
    category,
    address,
    open_info: openInfo,
    review_snippet: reviewSnippet,
    reservation_available: /reservar mesa/i.test(articleText),
    meal_uses: ["comer", "cenar"],
    score: (rating || 0) * 10000 + Math.min(review_count || 0, 2500),
    scraped_at: new Date().toISOString()
  };
}

function dedupeRestaurants(restaurants) {
  const seen = new Set();
  return restaurants.filter((restaurant) => {
    const key = `${restaurant.city_id}:${restaurant.name}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function scrapeRestaurantsForStop(page, city, options = {}) {
  const limit = options.limit || 8;
  const query = city.query;

  await page.goto(buildMapsSearchUrl(query), {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const consentHandled = await handleConsent(page);
    if (!consentHandled) break;
    await page.goto(buildMapsSearchUrl(query), {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
  }
  await page.waitForTimeout(6500);
  await scrollResults(page, 3);

  const raw = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href*="/maps/place/"]')].map((link) => ({
      name: link.getAttribute("aria-label") || "",
      href: link.href
    }));

    const articles = [...document.querySelectorAll('[role="article"]')]
      .map((article) => (article.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    return { links, articles, title: document.title };
  });

  if (!raw.articles.length) {
    return {
      city: city.name,
      city_id: city.id,
      status: "no_results",
      restaurants: [],
      error: `No visible Google Maps result cards found. Page title: ${raw.title}`
    };
  }

  const restaurants = raw.articles.map((articleText, index) =>
    parseRestaurantCard({
      city,
      query,
      articleText,
      link: raw.links[index]
    })
  );

  const filtered = dedupeRestaurants(restaurants)
    .filter((restaurant) => restaurant.name && restaurant.rating !== null)
    .filter((restaurant) => restaurant.rating >= (options.minRating || 4.2))
    .filter((restaurant) => restaurant.distance_from_stop_km === null || restaurant.distance_from_stop_km <= (city.radiusKm || 15))
    .filter((restaurant) => !/^hotel\b/i.test(restaurant.name) || restaurant.price_range || restaurant.open_info)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    city: city.name,
    city_id: city.id,
    status: "ok",
    restaurants: filtered,
    error: null
  };
}

export async function scrapeRestaurants(browser, stops, options = {}) {
  const context = await browser.newContext({
    locale: "es-ES",
    userAgent: COMMON_USER_AGENT,
    viewport: { width: 1440, height: 1200 }
  });

  const results = [];
  for (const stop of stops) {
    const page = await context.newPage();
    try {
      results.push(await scrapeRestaurantsForStop(page, stop, options));
    } catch (error) {
      results.push({
        city: stop.name,
        city_id: stop.id,
        status: "error",
        restaurants: [],
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      await page.close().catch(() => {});
    }
  }

  await context.close();
  return results;
}
