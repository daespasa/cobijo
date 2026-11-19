const COMMON_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function safeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function safeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(",", ".").replace(/[^\d.-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniq(values) {
  return [...new Set(values.map(safeText).filter(Boolean))];
}

function detectProvider(url) {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes("booking.com")) return "booking";
  if (host.includes("airbnb.")) return "airbnb";
  return host;
}

function normalizeUrl(url) {
  const trimmed = safeText(url);
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("ttps://")) return `h${trimmed}`;
  return trimmed;
}

function enrichUrlWithSearch(url, search) {
  if (!search?.checkin || !search?.checkout) return url;

  const parsed = new URL(url);
  if (parsed.hostname.includes("booking.com")) {
    parsed.searchParams.set("checkin", search.checkin);
    parsed.searchParams.set("checkout", search.checkout);
    parsed.searchParams.set("group_adults", String(search.adults || 2));
    parsed.searchParams.set("no_rooms", String(search.rooms || 1));
    parsed.searchParams.set("group_children", String(search.children || 0));
    parsed.searchParams.set("selected_currency", search.currency || "EUR");
  } else if (parsed.hostname.includes("airbnb.")) {
    parsed.searchParams.set("check_in", search.checkin);
    parsed.searchParams.set("check_out", search.checkout);
    parsed.searchParams.set("adults", String(search.adults || 2));
    if (search.children) parsed.searchParams.set("children", String(search.children));
    parsed.searchParams.set("currency", search.currency || "EUR");
  }

  return parsed.toString();
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function flattenJsonLd(rawBlocks) {
  const nodes = [];

  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const entry of node) visit(entry);
      return;
    }
    if (typeof node !== "object") return;

    nodes.push(node);

    if (Array.isArray(node["@graph"])) {
      for (const entry of node["@graph"]) visit(entry);
    }
  };

  for (const raw of rawBlocks) {
    try {
      visit(JSON.parse(raw));
    } catch {
      continue;
    }
  }

  return nodes;
}

function scoreEntity(entity) {
  let score = 0;
  const type = toArray(entity["@type"]).map((item) => String(item).toLowerCase());
  if (type.some((item) => ["hotel", "lodgingbusiness", "hotelroom", "apartment", "product", "place"].includes(item))) score += 5;
  if (entity.name) score += 3;
  if (entity.description) score += 2;
  if (entity.offers) score += 3;
  if (entity.address) score += 2;
  if (entity.aggregateRating) score += 2;
  if (entity.image) score += 1;
  return score;
}

function pickBestEntity(entities) {
  return [...entities].sort((a, b) => scoreEntity(b) - scoreEntity(a))[0] || null;
}

function pickFirst(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const found = pickFirst(...value);
      if (found) return found;
      continue;
    }
    if (value !== null && value !== undefined && safeText(value)) return value;
  }
  return null;
}

function normalizeAddress(address) {
  if (!address) return null;
  if (typeof address === "string") return safeText(address);
  if (typeof address !== "object") return null;

  const parts = [
    address.streetAddress,
    address.addressLocality,
    address.addressRegion,
    address.postalCode,
    address.addressCountry
  ]
    .map(safeText)
    .filter(Boolean);

  return parts.length ? parts.join(", ") : null;
}

function normalizeImages(image) {
  return toArray(image)
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === "string") return entry;
      if (typeof entry === "object") return entry.url || entry.contentUrl || entry["@id"] || null;
      return null;
    })
    .map(safeText)
    .filter(Boolean);
}

function detectBlockedPage(text) {
  const lower = safeText(text).toLowerCase();
  return [
    "verify that you're not a robot",
    "javascript is disabled",
    "enable javascript",
    "access denied",
    "robot",
    "captcha"
  ].some((needle) => lower.includes(needle));
}

function extractFirstNumber(pattern, text) {
  const match = safeText(text).match(pattern);
  return match ? safeNumber(match[1]) : null;
}

function normalizeLine(line) {
  return safeText(line)
    .replace(/Dormitorio(\d)/gi, "Dormitorio $1")
    .replace(/Dormitorio\s+(\d)(?=\d)/gi, "Dormitorio $1 ")
    .replace(/Sala de estar(?=\d)/gi, "Sala de estar ")
    .replace(/(\d)(camas?|sof[aá]|baños?|dormitorios?|viajeros?|hu[eé]spedes?)/gi, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBetween(lines, startPattern, stopPatterns, maxItems = 20) {
  const startIndex = lines.findIndex((line) => startPattern.test(line));
  if (startIndex < 0) return [];

  const values = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (stopPatterns.some((pattern) => pattern.test(line))) break;
    const normalized = normalizeLine(line);
    if (normalized && !startPattern.test(normalized)) values.push(normalized);
    if (values.length >= maxItems) break;
  }
  return uniq(values);
}

function extractMoney(text) {
  const candidates = [...safeText(text).matchAll(/(?:€\s?[\d.,]+|[\d.,]+\s?€|EUR\s?[\d.,]+|[\d.,]+\s?EUR)/gi)]
    .map((match) => safeText(match[0]))
    .filter((value) => !/^€$/.test(value));
  return candidates[0] || null;
}

function extractPriceInfo({ text, price, currency, search }) {
  const visiblePrice = extractMoney(text);
  const amount = price !== null && price !== undefined ? safeText(price) : visiblePrice;
  const inferredCurrency = safeText(currency) || (amount && /€|eur/i.test(amount) ? "EUR" : null);
  const requiresDates = /indica las fechas|añade las fechas|consultar el precio exacto|mostrar precios/i.test(text);

  return {
    amount: amount || null,
    currency: inferredCurrency,
    raw: amount || null,
    requires_dates: !amount && requiresDates,
    search_dates: search?.checkin && search?.checkout
      ? {
          checkin: search.checkin,
          checkout: search.checkout,
          adults: search.adults || 2,
          children: search.children || 0,
          rooms: search.rooms || 1
        }
      : null
  };
}

function extractCapacity(text) {
  const normalized = normalizeLine(text).toLowerCase();
  return {
    guests: extractFirstNumber(/(\d+)\s*(?:viajeros?|hu[eé]spedes?|personas?)/i, normalized),
    bedrooms: extractFirstNumber(/(\d+)\s*(?:dormitorios?|habitaciones?)/i, normalized),
    beds: extractFirstNumber(/(\d+)\s*camas?/i, normalized),
    bathrooms: extractFirstNumber(/(\d+(?:[.,]\d+)?)\s*baños?/i, normalized)
  };
}

function extractBedCount(text) {
  const value = normalizeLine(text).toLowerCase();
  let total = 0;
  const matches = [...value.matchAll(/(\d+)\s+(?:camas?|sof[aá]\s+cama)/gi)];
  for (const match of matches) total += Number(match[1]);
  if (!matches.length && /cama|sof[aá]\s+cama/i.test(value)) total += 1;
  return total;
}

function inferCapacityFromRoomOptions(baseCapacity, roomOptions) {
  const optionWithMostGuests = [...roomOptions].sort((a, b) => (b.max_guests || 0) - (a.max_guests || 0))[0];
  const optionWithMostBeds = [...roomOptions].sort((a, b) => (b.bed_count || 0) - (a.bed_count || 0))[0];
  const inferredBeds = Math.max(baseCapacity.beds || 0, optionWithMostBeds?.bed_count || 0) || null;

  return {
    guests: baseCapacity.guests || optionWithMostGuests?.max_guests || null,
    bedrooms: baseCapacity.bedrooms || extractFirstNumber(/(\d+)\s*(?:dormitorios?|habitaciones?)/i, optionWithMostBeds?.name || "") || null,
    beds: inferredBeds,
    bathrooms: baseCapacity.bathrooms
  };
}

function cleanLongText(value, maxLength = 1800) {
  const text = safeText(value);
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

function extractParagraphs(lines) {
  return uniq(
    lines
      .map(normalizeLine)
      .filter((line) => line.length >= 80)
      .filter((line) => line.length <= 1600)
      .filter((line) => !/^["“].*["”]$/.test(line))
      .filter((line) => !/cookies|booking\.com forma parte|colaboradores usamos|hazte una cuenta|inicia sesi[oó]n/i.test(line))
      .filter((line) => !/^(inicio|hoteles|alojamiento|vuelos|servicios|comentarios|normas|mostrar precios)$/i.test(line))
  ).slice(0, 18);
}

function extractApartmentProfile(lines, description) {
  const paragraphs = extractParagraphs(lines);
  const relevant = paragraphs.filter((line) =>
    /apartamento|alojamiento|dormitorio|habitaci[oó]n|baño|cocina|sal[oó]n|sala|cama|sof[aá]|wifi|aire acondicionado|vistas|soleado|c[oó]modo|familias|grupos|ubicaci[oó]n|centro|catedral|parking|supermercados|cafeter/i.test(line)
  );

  return uniq([description, ...relevant]).map((line) => cleanLongText(line, 1200)).slice(0, 10);
}

function extractHighlights(lines) {
  const joined = lines.join("\n");
  const terms = [
    ["wifi", "WiFi"],
    ["cocina", "Cocina equipada"],
    ["aire acondicionado", "Aire acondicionado"],
    ["baño privado", "Baño privado"],
    ["vistas", "Vistas"],
    ["centro", "Ubicacion centrica"],
    ["familia", "Apto para familias"],
    ["grupos", "Apto para grupos"],
    ["parking", "Parking cercano"],
    ["catedral", "Cerca de la catedral"],
    ["supermercados", "Supermercados cercanos"],
    ["transporte", "Transporte publico cercano"]
  ];

  return terms
    .filter(([needle]) => new RegExp(needle, "i").test(joined))
    .map(([, label]) => label)
    .slice(0, 12);
}

function extractOutdoorFeatures(lines) {
  const text = lines.join("\n");
  const hasPositiveLine = (pattern) =>
    lines.some((line) => {
      const normalized = normalizeLine(line);
      return new RegExp(pattern, "i").test(normalized) && !/[¿?]/.test(normalized) && normalized.length < 500;
    });

  const features = [
    hasPositiveLine("balc[oó]n") ? "Balcon" : null,
    hasPositiveLine("terraza") ? "Terraza" : null,
    hasPositiveLine("jard[ií]n") ? "Jardin" : null,
    hasPositiveLine("patio") ? "Patio" : null,
    /vistas al mar/i.test(text) ? "Vistas al mar" : null,
    /vistas a la ciudad/i.test(text) ? "Vistas a la ciudad" : null,
    /vistas/i.test(text) ? "Vistas" : null
  ];

  return uniq(features);
}

function extractRoomOptions(lines) {
  const options = [];
  const starts = /^(apartamento|casa|habitaci[oó]n|villa|estudio|suite)\b/i;
  const detail = /(dormitorio|sala de estar|cama|sof[aá]|baño)/i;

  for (let i = 0; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);
    if (!starts.test(line)) continue;
    if (line.length > 120 && !/\b(?:de\s+\d+\s+dormitorios?|unifamiliar|suite|estudio)\b/i.test(line)) continue;

    const option = { name: line, beds: [], max_guests: extractFirstNumber(/(\d+)\s*(?:personas?|hu[eé]spedes?|viajeros?)/i, line) };
    for (const next of lines.slice(i + 1, i + 10)) {
      const normalized = normalizeLine(next);
      if (/mostrar precios|reservar|selecciona/i.test(normalized)) break;
      if (starts.test(normalized) && normalized !== line) break;
      const guests = extractFirstNumber(/^×\s*(\d+)$/i, normalized) || extractFirstNumber(/^x\s*(\d+)$/i, normalized);
      if (guests) option.max_guests = guests;
      if (detail.test(normalized)) option.beds.push(normalized);
    }

    if (option.beds.length || /dormitorio|habitaci[oó]n|cama/i.test(option.name)) {
      const bedCount = option.beds.reduce((sum, bedLine) => sum + extractBedCount(bedLine), 0);
      options.push({
        ...option,
        beds: uniq(option.beds),
        bed_count: bedCount || null
      });
    }
  }

  const seen = new Set();
  return options.filter((option) => {
    const key = `${option.name}|${option.beds.join("|")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function extractSleepingArrangement(lines) {
  const rooms = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);
    if (!/^(dormitorio|sala de estar)\s*\d*/i.test(line)) continue;
    const beds = [];
    for (const next of lines.slice(i + 1, i + 5)) {
      const normalized = normalizeLine(next);
      if (/^(dormitorio|habitaci[oó]n|sala de estar)\s*\d*/i.test(normalized)) break;
      if (/cama|sof[aá]/i.test(normalized)) beds.push(normalized);
    }
    rooms.push({ room: line, beds: uniq(beds) });
  }
  return rooms.filter((room) => room.beds.length).slice(0, 12);
}

function extractFeaturedReviews(lines) {
  return uniq(
    lines
      .map(normalizeLine)
      .filter((line) => /^“.*”$/.test(line) || /^".*"$/.test(line))
      .map((line) => line.replace(/^["“]|["”]$/g, ""))
      .filter((line) => line.length > 25)
  ).slice(0, 8);
}

function extractAmenities({ lines, best }) {
  const structured = toArray(best?.amenityFeature).map((item) => item?.name || item?.value || null);
  const popular = extractBetween(
    lines,
    /^(servicios m[aá]s populares|servicios de .+)$/i,
    [/^igualamos/i, /^indica las fechas/i, /^instalaciones/i, /^normas/i, /^comentarios/i, /^mostrar precios/i],
    30
  );

  const knownTerms = [
    "WiFi gratis",
    "Wifi",
    "Cocina",
    "Baño privado",
    "Habitaciones familiares",
    "Habitaciones sin humo",
    "Aire acondicionado",
    "TV",
    "Nevera",
    "Horno",
    "Microondas",
    "Cafetera",
    "Hervidor",
    "Secador de pelo",
    "Parking",
    "Balcón",
    "Terraza",
    "Jardín",
    "Patio",
    "Vistas",
    "Vistas al mar",
    "Vistas a la ciudad",
    "Ropa de cama",
    "Toallas",
    "Lavadora",
    "Lavavajillas",
    "Bañera",
    "Ducha"
  ].filter((term) => new RegExp(term, "i").test(lines.join("\n")));

  return uniq([...structured, ...popular, ...knownTerms])
    .filter((item) => !/empieza tu b[uú]squeda|destino|cualquier lugar|llegada|salida|viajeros|hazte anfitri[oó]n|guardar|compartir|servicios, nuevo/i.test(item))
    .filter((item) => !/puntos fuertes|reserva ahora|disponibilidad|solicitar|consulta|inicia sesi[oó]n|hazte una cuenta|puedes ahorrar|parking privado disponible|¡parking gratis!|zona mejor valorada/i.test(item))
    .slice(0, 50);
}

function extractPolicies(lines) {
  const policyLines = lines.filter((line) =>
    /entrada|salida|cancelaci[oó]n|prepago|niños|cunas|supletorias|mascotas|fumadores|fiestas|edad mínima/i.test(line)
  );
  return uniq(policyLines.map(normalizeLine)).slice(0, 30);
}

function extractHost(text) {
  const match = safeText(text).match(/Hola, soy\s+([^,.]+)[,.]?\s+([^]{0,500})/i);
  if (!match) return null;
  return {
    name: safeText(match[1]),
    description: safeText(match[0]).slice(0, 600)
  };
}

function extractLocationNotes(text) {
  const lines = String(text || "").split("\n").map(normalizeLine).filter(Boolean);
  return lines
    .filter((line) => /ubicaci[oó]n|centro|alrededores|restaurantes|supermercados|transporte|catedral|playa|plaza|parking/i.test(line))
    .filter((line) => line.length > 40)
    .filter((line) => line.length < 900)
    .filter((line) => !/ir al contenido principal|hazte una cuenta|booking\.com|cookies|pol[ií]tica de privacidad/i.test(line))
    .slice(0, 8);
}

function buildGeneralDescription({ description, apartmentProfile, capacity, sleepingArrangement, amenities, locationNotes, outdoorFeatures }) {
  const parts = [];
  if (description) parts.push(description);
  for (const paragraph of apartmentProfile) {
    if (!parts.some((existing) => existing.includes(paragraph) || paragraph.includes(existing))) parts.push(paragraph);
  }

  const detailBits = [
    capacity.guests ? `Capacidad detectada: ${capacity.guests} viajeros.` : null,
    capacity.bedrooms ? `Dormitorios detectados: ${capacity.bedrooms}.` : null,
    capacity.beds ? `Camas detectadas: ${capacity.beds}.` : null,
    capacity.bathrooms ? `Banos detectados: ${capacity.bathrooms}.` : null,
    sleepingArrangement.length
      ? `Distribucion: ${sleepingArrangement.map((room) => `${room.room}: ${room.beds.join(", ")}`).join(" | ")}.`
      : null,
    outdoorFeatures.length ? `Exterior y vistas: ${outdoorFeatures.join(", ")}.` : null,
    amenities.length ? `Servicios destacados: ${amenities.slice(0, 12).join(", ")}.` : null,
    locationNotes.length ? `Ubicacion: ${locationNotes.slice(0, 3).join(" ")}` : null
  ].filter(Boolean);

  return cleanLongText([...parts, ...detailBits].join("\n\n"), 5000);
}

function parseStructuredData(rawBlocks) {
  const entities = flattenJsonLd(rawBlocks);
  const best = pickBestEntity(entities);
  return { entities, best };
}

function extractMeta(metaMap, keys) {
  for (const key of keys) {
    if (metaMap[key]) return metaMap[key];
  }
  return null;
}

function buildListingRecord({ url, provider, pageData, search }) {
  const { metaMap, title, text, lines, canonical, ldScripts, domImages } = pageData;
  const { entities, best } = parseStructuredData(ldScripts);

  const offers = best?.offers || best?.mainEntity?.offers || null;
  const offer = Array.isArray(offers) ? offers[0] : offers;
  const rating = best?.aggregateRating || best?.review?.aggregateRating || null;
  const geo = best?.geo || null;

  const rawTitle =
    pickFirst(best?.name, best?.headline, metaMap["og:title"], metaMap["twitter:title"], title) ||
    title ||
    null;

  const description =
    pickFirst(
      best?.description,
      metaMap["og:description"],
      metaMap["twitter:description"],
      metaMap.description
    ) || null;

  const address = normalizeAddress(pickFirst(best?.address, best?.location?.address));
  const imageUrls = normalizeImages(pickFirst(best?.image, metaMap["og:image"], metaMap["twitter:image"]));

  const price = pickFirst(
    offer?.price,
    offer?.lowPrice,
    offer?.highPrice,
    metaMap["product:price:amount"],
    metaMap["og:price:amount"]
  );
  const currency = pickFirst(offer?.priceCurrency, metaMap["product:price:currency"], metaMap["og:price:currency"]);

  const ratingValue = pickFirst(rating?.ratingValue, metaMap["ratingValue"]);
  const reviewCount = pickFirst(rating?.reviewCount, rating?.ratingCount);

  const propertyType = pickFirst(
    toArray(best?.["@type"]).find(Boolean),
    pageData.breadcrumbs?.find((crumb) => /apartamento|hotel|villa|casa|habitaci[oó]n/i.test(crumb)),
    metaMap["og:type"],
    provider === "booking" ? "hotel" : "apartment"
  );

  const blocked = detectBlockedPage(text);
  const cleanAmenities = extractAmenities({ lines, best });
  const cleanImages = uniq([...imageUrls, ...domImages])
    .filter((src) => !/images-flags|\/avatars\/|googleusercontent\.com|review\/avatars/i.test(src))
    .slice(0, 20);
  const cleanTitle = safeText(rawTitle);
  const cleanDescription = safeText(description);
  const cleanAddress = safeText(address);
  const priceInfo = extractPriceInfo({ text, price, currency, search });
  const cleanRating = ratingValue !== null && ratingValue !== undefined ? safeNumber(ratingValue) : null;
  const cleanReviews = reviewCount !== null && reviewCount !== undefined ? safeNumber(reviewCount) : null;
  const cleanGeo = geo
    ? {
        latitude: safeNumber(geo.latitude ?? geo.lat ?? null),
        longitude: safeNumber(geo.longitude ?? geo.lng ?? null)
      }
    : null;
  const roomOptions = extractRoomOptions(lines);
  const capacity = inferCapacityFromRoomOptions(extractCapacity(text), roomOptions);
  const sleepingArrangement = extractSleepingArrangement(lines);
  const policies = extractPolicies(lines);
  const host = extractHost(text);
  const locationNotes = extractLocationNotes(text);
  const apartmentProfile = extractApartmentProfile(lines, cleanDescription);
  const outdoorFeatures = extractOutdoorFeatures(lines);
  const highlights = uniq([...extractHighlights(lines), ...outdoorFeatures]);
  const featuredReviews = extractFeaturedReviews(lines);
  const generalDescription = buildGeneralDescription({
    description: cleanDescription,
    apartmentProfile,
    capacity,
    sleepingArrangement,
    amenities: cleanAmenities,
    locationNotes,
    outdoorFeatures
  });

  const summaryParts = [
    cleanTitle ? `Nombre: ${cleanTitle}` : null,
    cleanDescription ? `Descripcion: ${cleanDescription}` : null,
    cleanAddress ? `Direccion: ${cleanAddress}` : null,
    priceInfo.amount && priceInfo.currency ? `Precio: ${priceInfo.amount} ${priceInfo.currency}` : priceInfo.amount ? `Precio: ${priceInfo.amount}` : null,
    capacity.guests ? `Capacidad: ${capacity.guests} viajeros` : null,
    capacity.bedrooms ? `Dormitorios: ${capacity.bedrooms}` : null,
    capacity.beds ? `Camas: ${capacity.beds}` : null,
    capacity.bathrooms ? `Banos: ${capacity.bathrooms}` : null,
    cleanRating !== null ? `Rating: ${cleanRating}` : null,
    cleanReviews !== null ? `Reviews: ${cleanReviews}` : null,
    cleanAmenities.length ? `Servicios: ${cleanAmenities.slice(0, 8).join(", ")}` : null
  ].filter(Boolean);

  return {
    url,
    canonical,
    provider,
    status: blocked ? "blocked" : "ok",
    title: cleanTitle,
    description: cleanDescription,
    address: cleanAddress,
    propertyType: safeText(propertyType) || null,
    geo: geo
      ? {
          latitude: cleanGeo?.latitude,
          longitude: cleanGeo?.longitude
        }
      : null,
    price: priceInfo.amount,
    currency: priceInfo.currency,
    priceInfo,
    ratingValue: cleanRating,
    reviewCount: cleanReviews,
    capacity,
    roomOptions,
    sleepingArrangement,
    apartmentProfile,
    generalDescription,
    highlights,
    outdoorFeatures,
    featuredReviews,
    imageUrls: cleanImages,
    amenities: cleanAmenities,
    policies,
    host,
    locationNotes,
    breadcrumbs: pageData.breadcrumbs || [],
    summary: summaryParts.join(" | "),
    blockedReason: blocked ? "page_blocked_or_verification" : null
  };
}

export async function scrapeListing(page, inputUrl, search) {
  const url = normalizeUrl(inputUrl);
  const scrapeUrl = enrichUrlWithSearch(url, search);
  const provider = detectProvider(url);

  await page.goto(scrapeUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  const pageData = await page.evaluate(() => {
    const metaMap = {};
    for (const meta of document.querySelectorAll("meta")) {
      const key = meta.getAttribute("property") || meta.getAttribute("name");
      const value = meta.getAttribute("content");
      if (key && value && !metaMap[key]) metaMap[key] = value;
    }

    const ldScripts = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((script) => script.textContent || "")
      .filter(Boolean);

    const text = document.body?.innerText || "";
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const breadcrumbs = [...document.querySelectorAll('[data-testid="breadcrumb-item"], [data-testid="breadcrumb-current"], nav[aria-label="Breadcrumbs"] a')]
      .map((element) => element.textContent || "")
      .map((value) => value.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const domImages = [...document.querySelectorAll("img")]
      .map((img) => img.currentSrc || img.src)
      .filter(Boolean)
      .filter((src) => /^https?:\/\//i.test(src));

    return {
      title: document.title || "",
      canonical: document.querySelector('link[rel="canonical"]')?.href || null,
      metaMap,
      ldScripts,
      text,
      lines,
      breadcrumbs,
      domImages
    };
  });

  return buildListingRecord({
    url,
    provider,
    pageData,
    search
  });
}

export async function scrapeAll(browser, urls, search = null) {
  const context = await browser.newContext({
    locale: "es-ES",
    userAgent: COMMON_USER_AGENT,
    viewport: { width: 1440, height: 1200 }
  });

  const results = [];
  for (const inputUrl of urls) {
    const page = await context.newPage();
    try {
      const record = await scrapeListing(page, inputUrl, search);
      results.push({
        ...record,
        scrapedAt: new Date().toISOString()
      });
    } catch (error) {
      results.push({
        url: normalizeUrl(inputUrl),
        provider: detectProvider(normalizeUrl(inputUrl)),
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        scrapedAt: new Date().toISOString(),
        title: "",
        description: "",
        address: "",
        propertyType: null,
        geo: null,
        price: null,
        currency: null,
        priceInfo: {
          amount: null,
          currency: search?.currency || "EUR",
          raw: null,
          requires_dates: !search?.checkin || !search?.checkout,
          search_dates: search?.checkin && search?.checkout
            ? {
                checkin: search.checkin,
                checkout: search.checkout,
                adults: search.adults || 2,
                children: search.children || 0,
                rooms: search.rooms || 1
              }
            : null
        },
        ratingValue: null,
        reviewCount: null,
        capacity: {
          guests: null,
          bedrooms: null,
          beds: null,
          bathrooms: null
        },
        roomOptions: [],
        sleepingArrangement: [],
        apartmentProfile: [],
        generalDescription: "",
        highlights: [],
        outdoorFeatures: [],
        featuredReviews: [],
        imageUrls: [],
        amenities: [],
        policies: [],
        host: null,
        locationNotes: [],
        breadcrumbs: [],
        summary: ""
      });
    } finally {
      await page.close().catch(() => {});
    }
  }

  await context.close();
  return results;
}
