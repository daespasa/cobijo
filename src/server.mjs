// Cobijo: formulario + mapa + historial por usuario en SQLite. Sin framework: node:http.
// Uso: node src/server.mjs  →  http://127.0.0.1:8787
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { runSearch, AMENITIES, zoneGeometry } from "./searchScraper.mjs";
import { DEFAULTS, DESTINATIONS, ORIGIN } from "./tripConfig.mjs";
import {
  db, createUser, randomPassword, hashPassword, verifyPassword, setPassword, createSession, sessionUser, deleteSession,
  deleteOtherSessions, purgeExpiredSessions, SESSION_DAYS, FAV_COLS
} from "./db.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || "127.0.0.1";
const MAX_PENDING = 3; // búsquedas en cola o en marcha por usuario (cada una ocupa Chromium varios minutos)

// primer arranque: crea el usuario por defecto y le asigna las búsquedas que hubiera sin dueño
if (!db.prepare("SELECT 1 FROM users LIMIT 1").get()) {
  const admin = process.env.COBIJO_ADMIN || "admin";
  const password = randomPassword();
  createUser(admin, password, admin);
  console.log(`Usuario inicial «${admin}» creado. Contraseña: ${password}  (cámbiala desde la app)`);
}
db.prepare("UPDATE searches SET user_id=(SELECT MIN(id) FROM users) WHERE user_id IS NULL").run();
purgeExpiredSessions();

// una búsqueda que estaba en marcha cuando se apagó el servidor no va a terminar sola
db.prepare("UPDATE searches SET status='error', error='Interrumpida (se reinició el servidor)' WHERE status='running'").run();

const insertResult = db.prepare(`INSERT INTO results
  (search_id, zone, provider, url, title, location, total_price, per_person_night, private_rooms, bathrooms, beds, rating, reviews, fits_budget, fits_privacy, lat, lng, free_cancellation, is_new, guest_favorite)
  VALUES (@search_id, @zone, @provider, @url, @title, @location, @totalPrice, @perPersonNight, @privateRooms, @bathrooms, @beds, @rating, @reviews, @fitsBudget, @fitsPrivacy, @lat, @lng, @freeCancellation, @isNew, @guestFavorite)`);
const insertMany = db.transaction((searchId, items) => {
  for (const i of items) {
    insertResult.run({
      beds: null, bathrooms: null, rating: null, reviews: null, location: null, lat: null, lng: null,
      freeCancellation: null, isNew: null, guestFavorite: null, ...i,
      search_id: searchId, fitsBudget: i.fitsBudget ? 1 : 0, fitsPrivacy: i.fitsPrivacy ? 1 : 0
    });
  }
});

// --- Cola: una búsqueda a la vez (un solo Chromium vivo como mucho) ---
let running = null; // { id, cancel }
function pump() {
  if (running) return;
  const next = db.prepare("SELECT * FROM searches WHERE status='queued' ORDER BY id LIMIT 1").get();
  if (!next) return;
  running = { id: next.id, cancel: false };
  const job = running;
  db.prepare("UPDATE searches SET status='running' WHERE id=?").run(job.id);
  runSearch(JSON.parse(next.params), {
    cancelled: () => job.cancel,
    onProgress: (text) => db.prepare("UPDATE searches SET progress=? WHERE id=?").run(text, job.id),
    onItems: (items) => insertMany(job.id, items)
  })
    .then(({ failures }) => {
      db.prepare("UPDATE searches SET status=?, progress=NULL, failures=? WHERE id=?").run(job.cancel ? "cancelled" : "done", JSON.stringify(failures), job.id);
    })
    .catch((e) => db.prepare("UPDATE searches SET status='error', error=? WHERE id=?").run(String(e.message).split("\n")[0], job.id))
    .finally(() => {
      running = null;
      pump();
    });
}

const isLat = (v) => Number.isFinite(v) && Math.abs(v) <= 90;
const isLng = (v) => Number.isFinite(v) && Math.abs(v) <= 180;
function cleanZone(z) {
  const name = String(z?.name ?? "").replace(/[\/?#]/g, " ").trim().slice(0, 60) || "Zona";
  if (z?.type === "polygon") {
    const points = Array.isArray(z.points) ? z.points.slice(0, 60).map((p) => [Number(p?.[0]), Number(p?.[1])]) : [];
    const ok = points.length >= 3 && points.every(([la, ln]) => isLat(la) && isLng(ln));
    return ok ? { type: "polygon", name, points } : null;
  }
  const c = { type: "circle", name, lat: Number(z?.lat), lng: Number(z?.lng), km: Number(z?.km) };
  return isLat(c.lat) && isLng(c.lng) && c.km >= 1 && c.km <= 300 ? c : null;
}

// --- Validación de entrada (lo que llega del navegador no es de fiar) ---
const int = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
function cleanForm(b) {
  const errors = [];
  if (!isDate(b.checkin) || !isDate(b.checkout)) errors.push("Fechas no válidas");
  const nights = (Date.parse(b.checkout) - Date.parse(b.checkin)) / 86400000;
  if (!(nights >= 1 && nights <= 30)) errors.push("Entre 1 y 30 noches");
  const f = {
    checkin: b.checkin,
    checkout: b.checkout,
    adults: int(b.adults, 1, 30),
    bedrooms: int(b.bedrooms, 0, 15),
    pets: int(b.pets, 0, 5),
    maxPerPersonNight: typeof b.maxPerPersonNight === "number" && b.maxPerPersonNight > 0 && b.maxPerPersonNight <= 2000 ? b.maxPerPersonNight : null,
    pages: int(b.pages, 1, 5),
    amenities: Array.isArray(b.amenities) ? b.amenities.filter((a) => Object.hasOwn(AMENITIES, a)) : [],
    providers: Array.isArray(b.providers) ? [...new Set(b.providers.filter((p) => ["booking", "airbnb"].includes(p)))] : [],
    freeCancellation: b.freeCancellation === true
  };
  for (const k of ["adults", "bedrooms", "pets", "maxPerPersonNight", "pages"]) if (f[k] === null) errors.push(`Valor no válido: ${k}`);
  if (!f.providers.length) errors.push("Elige al menos una web");
  return { f, errors };
}
export function validate(b) {
  const { f, errors } = cleanForm(b);
  const zones = Array.isArray(b.zones) ? b.zones.slice(0, 30).map(cleanZone) : [];
  if (!zones.length) errors.push("Marca al menos una zona en el mapa");
  if (zones.some((z) => !z)) errors.push("Zona no válida: un polígono necesita 3 puntos o más y un radio 1–300 km");
  else if (zones.some((z) => zoneGeometry(z).km > 300)) errors.push("Zona demasiado grande (máx. ~300 km de radio)");
  return { q: { ...f, zones }, errors };
}

// Preferencias: salida, valores del formulario y filtros de resultados. Cada parte es opcional.
const SORTS = ["price", "rating", "distance", "zone"];
const PROVIDER_FILTERS = ["all", "booking", "airbnb"];
export function cleanPrefs(b) {
  const prefs = {};
  const errors = [];
  if (b?.origin != null) {
    const o = { name: String(b.origin.name ?? "").trim().slice(0, 60) || "Salida", lat: Number(b.origin.lat), lng: Number(b.origin.lng) };
    if (isLat(o.lat) && isLng(o.lng)) prefs.origin = o;
    else errors.push("Punto de salida no válido");
  }
  if (b?.form != null) {
    const { f, errors: e } = cleanForm(b.form);
    errors.push(...e);
    prefs.form = f;
  }
  if (b?.filters != null) {
    prefs.filters = {
      privacy: b.filters.privacy !== false,
      freeOnly: b.filters.freeOnly === true,
      minRating: [0, 7, 8, 9].includes(b.filters.minRating) ? b.filters.minRating : 0,
      sort: SORTS.includes(b.filters.sort) ? b.filters.sort : "price",
      provider: PROVIDER_FILTERS.includes(b.filters.provider) ? b.filters.provider : "all"
    };
  }
  return { prefs, errors };
}

// --- HTTP ---
const PUBLIC = path.join(ROOT, "public"); // build de web/ (npm run build)
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon"
};
function staticFile(pathname) {
  const file = path.normalize(path.join(PUBLIC, pathname === "/" ? "index.html" : decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC + path.sep) || !TYPES[path.extname(file)] || !fs.existsSync(file)) return null; // nada fuera de public/
  return file;
}

// Cabeceras de seguridad para todo: solo cargamos lo nuestro, el mapa de OpenFreeMap, Nominatim (lugares) y OSRM (rutas)
const SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // Leaflet y las animaciones ponen estilos en línea
    "img-src 'self' data: blob: https://tiles.openfreemap.org https://tile.openstreetmap.org", // OSM: respaldo sin WebGL
    "connect-src 'self' https://tiles.openfreemap.org https://nominatim.openstreetmap.org https://router.project-osrm.org",
    "worker-src 'self' blob:", // MapLibre dibuja el mapa en un web worker
    "font-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'"
  ].join("; "),
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "same-origin",
  "cross-origin-opener-policy": "same-origin"
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

const COOKIE = "cobijo_session";
const readCookie = (req) =>
  (req.headers.cookie || "").split(/;\s*/).map((c) => c.split("=")).find(([k]) => k === COOKIE)?.[1] || null;
const sessionCookie = (token, maxAge) =>
  `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${process.env.COOKIE_SECURE ? "; Secure" : ""}`;

const publicUser = (u) => ({
  username: u.username,
  name: u.name,
  prefs: JSON.parse(u.prefs || "{}"),
  createdAt: u.created_at,
  lastLoginAt: u.last_login_at,
  sessionExpiresAt: u.expires_at
});

const DUMMY_HASH = hashPassword(randomPassword());

// Freno a la fuerza bruta: 10 fallos por IP en 15 min bloquean el login un rato
const loginFails = new Map();
function tooManyFails(ip) {
  const f = loginFails.get(ip);
  if (f && Date.now() - f.since > 15 * 60_000) loginFails.delete(ip);
  return (loginFails.get(ip)?.n || 0) >= 10;
}
function noteFail(ip) {
  const f = loginFails.get(ip) || { n: 0, since: Date.now() };
  f.n += 1;
  loginFails.set(ip, f);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 100_000) throw new Error("Petición demasiado grande");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const listSearches = db.prepare(`
  SELECT s.id, s.created_at, s.params, s.status, s.progress, s.error,
    COUNT(r.id) AS total, COALESCE(SUM(r.fits_budget AND r.fits_privacy), 0) AS fitting
  FROM searches s LEFT JOIN results r ON r.search_id = s.id
  WHERE s.user_id = ?
  GROUP BY s.id ORDER BY s.id DESC LIMIT 200`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const m = url.pathname.match(/^\/api\/searches\/(\d+)(\/cancel)?$/);
  try {
    const file = req.method === "GET" && !url.pathname.startsWith("/api/") && staticFile(url.pathname);
    if (file) {
      // los ficheros de assets/ llevan hash en el nombre: se pueden cachear para siempre
      const cache = file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache";
      res.writeHead(200, { ...SECURITY_HEADERS, "content-type": TYPES[path.extname(file)], "cache-control": cache });
      return fs.createReadStream(file).pipe(res);
    }
    if (url.pathname.startsWith("/api/") && req.method !== "GET") {
      // CSRF: solo aceptamos JSON (un formulario de otra web no puede mandarlo sin permiso) y del mismo origen
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { errors: ["Origen no permitido"] });
      if (!String(req.headers["content-type"]).startsWith("application/json")) return send(res, 415, { errors: ["Se espera JSON"] });
    }
    const token = readCookie(req);

    // --- sesión ---
    if (req.method === "POST" && url.pathname === "/api/login") {
      const ip = req.socket.remoteAddress;
      if (tooManyFails(ip)) return send(res, 429, { errors: ["Demasiados intentos. Espera 15 minutos y vuelve a probar."] });
      const { username, password } = await readJson(req);
      const u = typeof username === "string" && db.prepare("SELECT * FROM users WHERE username=?").get(username.trim());
      // si el usuario no existe se verifica igual contra un hash falso: misma duración, no revela qué usuarios existen
      if (!verifyPassword(password, u ? u.password_hash : DUMMY_HASH) || !u) {
        noteFail(ip);
        return send(res, 401, { errors: ["Usuario o contraseña incorrectos"] });
      }
      loginFails.delete(ip);
      const t = createSession(u.id);
      return send(res, 200, publicUser(sessionUser(t)), { "set-cookie": sessionCookie(t, SESSION_DAYS * 86400) });
    }
    if (req.method === "POST" && url.pathname === "/api/logout") {
      deleteSession(token);
      return send(res, 200, { ok: true }, { "set-cookie": sessionCookie("", 0) });
    }

    const user = sessionUser(token);
    if (url.pathname.startsWith("/api/") && !user) return send(res, 401, { errors: ["Inicia sesión"] }, token ? { "set-cookie": sessionCookie("", 0) } : {});

    if (req.method === "GET" && url.pathname === "/api/me") return send(res, 200, publicUser(user));
    if (req.method === "PUT" && url.pathname === "/api/me") {
      const b = await readJson(req);
      const current = JSON.parse(user.prefs || "{}");
      const { prefs, errors } = cleanPrefs(b.prefs ?? {});
      const name = b.name === undefined ? user.name : String(b.name).trim().slice(0, 60);
      if (!name) errors.push("El nombre no puede quedar vacío");
      if (errors.length) return send(res, 400, { errors });
      // reset: true borra las preferencias de búsqueda guardadas (vuelven los valores por defecto)
      const merged = b.reset ? { origin: prefs.origin ?? current.origin } : { ...current, ...prefs };
      db.prepare("UPDATE users SET name=?, prefs=? WHERE id=?").run(name, JSON.stringify(merged), user.id);
      return send(res, 200, publicUser(sessionUser(token)));
    }
    if (req.method === "POST" && url.pathname === "/api/me/password") {
      const { current, next } = await readJson(req);
      const row = db.prepare("SELECT password_hash FROM users WHERE id=?").get(user.id);
      if (!verifyPassword(current, row.password_hash)) return send(res, 400, { errors: ["La contraseña actual no es correcta"] });
      setPassword(user.id, next);
      deleteOtherSessions(user.id, token); // cierra la sesión en los demás dispositivos
      return send(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/meta") {
      return send(res, 200, {
        defaults: DEFAULTS,
        origin: ORIGIN,
        presets: DESTINATIONS,
        amenities: Object.entries(AMENITIES).map(([key, a]) => ({ key, label: a.label, only: a.booking ? (a.airbnb ? null : "booking") : "airbnb" }))
      });
    }

    // --- listas y guardados ---
    const listName = (v) => String(v ?? "").trim().slice(0, 60);
    const ownList = (id) => db.prepare("SELECT * FROM lists WHERE id=? AND user_id=?").get(id, user.id);
    const listsOf = () =>
      db.prepare(`SELECT l.id, l.name, l.created_at, COUNT(f.id) AS count FROM lists l LEFT JOIN favorites f ON f.list_id=l.id
        WHERE l.user_id=? GROUP BY l.id ORDER BY l.id`).all(user.id);
    if (req.method === "GET" && url.pathname === "/api/lists") return send(res, 200, listsOf());
    if (req.method === "POST" && url.pathname === "/api/lists") {
      const name = listName((await readJson(req)).name);
      if (!name) return send(res, 400, { errors: ["Ponle un nombre a la lista"] });
      if (db.prepare("SELECT 1 FROM lists WHERE user_id=? AND name=?").get(user.id, name)) return send(res, 409, { errors: [`Ya tienes una lista llamada «${name}»`] });
      const { lastInsertRowid } = db.prepare("INSERT INTO lists (user_id, name) VALUES (?, ?)").run(user.id, name);
      return send(res, 201, listsOf().find((l) => l.id === Number(lastInsertRowid)));
    }
    const lm = url.pathname.match(/^\/api\/lists\/(\d+)$/);
    if (lm) {
      const list = ownList(lm[1]);
      if (!list) return send(res, 404, { errors: ["Esa lista no existe"] });
      if (req.method === "PUT") {
        const name = listName((await readJson(req)).name);
        if (!name) return send(res, 400, { errors: ["Ponle un nombre a la lista"] });
        if (db.prepare("SELECT 1 FROM lists WHERE user_id=? AND name=? AND id<>?").get(user.id, name, list.id)) return send(res, 409, { errors: [`Ya tienes una lista llamada «${name}»`] });
        db.prepare("UPDATE lists SET name=? WHERE id=?").run(name, list.id);
        return send(res, 200, listsOf().find((l) => l.id === list.id));
      }
      if (req.method === "DELETE") {
        db.prepare("DELETE FROM lists WHERE id=?").run(list.id); // borra también sus alojamientos
        return send(res, 200, { ok: true });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/favorites") {
      return send(res, 200, db.prepare(`SELECT f.* FROM favorites f JOIN lists l ON l.id=f.list_id WHERE l.user_id=? ORDER BY f.id DESC`).all(user.id));
    }
    if (req.method === "POST" && url.pathname === "/api/favorites") {
      const { listId, resultId, favoriteId } = await readJson(req);
      const list = ownList(listId);
      if (!list) return send(res, 404, { errors: ["Esa lista no existe"] });
      // se copia de un resultado o de otro guardado tuyo, nunca de lo que mande el navegador
      const source = resultId != null
        ? db.prepare(`SELECT r.${FAV_COLS.split(", ").join(", r.")} FROM results r JOIN searches s ON s.id=r.search_id WHERE r.id=? AND s.user_id=?`).get(resultId, user.id)
        : db.prepare(`SELECT f.${FAV_COLS.split(", ").join(", f.")} FROM favorites f JOIN lists l ON l.id=f.list_id WHERE f.id=? AND l.user_id=?`).get(favoriteId, user.id);
      if (!source) return send(res, 404, { errors: ["Ese alojamiento ya no existe"] });
      const cols = FAV_COLS.split(", ");
      db.prepare(`INSERT OR IGNORE INTO favorites (list_id, ${FAV_COLS}) VALUES (?, ${cols.map(() => "?").join(", ")})`).run(list.id, ...cols.map((c) => source[c]));
      return send(res, 201, db.prepare("SELECT * FROM favorites WHERE list_id=? AND url=?").get(list.id, source.url));
    }
    const fav = url.pathname.match(/^\/api\/favorites\/(\d+)$/);
    if (fav && req.method === "DELETE") {
      db.prepare("DELETE FROM favorites WHERE id=? AND list_id IN (SELECT id FROM lists WHERE user_id=?)").run(fav[1], user.id);
      return send(res, 200, { ok: true });
    }

    // --- búsquedas (cada usuario solo ve las suyas) ---
    if (req.method === "GET" && url.pathname === "/api/searches") {
      return send(res, 200, listSearches.all(user.id).map((s) => ({ ...s, params: JSON.parse(s.params) })));
    }
    if (req.method === "POST" && url.pathname === "/api/searches") {
      const { q, errors } = validate(await readJson(req));
      if (errors.length) return send(res, 400, { errors });
      const pending = db.prepare("SELECT COUNT(*) n FROM searches WHERE user_id=? AND status IN ('queued','running')").get(user.id).n;
      if (pending >= MAX_PENDING) return send(res, 429, { errors: [`Ya tienes ${pending} búsquedas en marcha. Espera a que termine alguna o cancélala.`] });
      const { lastInsertRowid } = db.prepare("INSERT INTO searches (params, user_id) VALUES (?, ?)").run(JSON.stringify(q), user.id);
      pump();
      return send(res, 201, { id: Number(lastInsertRowid) });
    }
    const own = m && db.prepare("SELECT * FROM searches WHERE id=? AND user_id=?").get(m[1], user.id);
    if (m && !own) return send(res, 404, { errors: ["No existe"] });
    if (m && req.method === "GET" && !m[2]) {
      const results = db.prepare("SELECT * FROM results WHERE search_id=? ORDER BY per_person_night IS NULL, per_person_night").all(own.id);
      return send(res, 200, { ...own, params: JSON.parse(own.params), failures: JSON.parse(own.failures || "[]"), results });
    }
    if (m && req.method === "POST" && m[2]) {
      if (running?.id === own.id) running.cancel = true;
      db.prepare("UPDATE searches SET status='cancelled', progress=NULL WHERE id=? AND status='queued'").run(own.id);
      return send(res, 200, { ok: true });
    }
    if (m && req.method === "DELETE" && !m[2]) {
      if (running?.id === own.id) return send(res, 409, { errors: ["Cancela la búsqueda antes de borrarla"] });
      db.prepare("DELETE FROM searches WHERE id=?").run(own.id);
      return send(res, 200, { ok: true });
    }
    send(res, 404, { errors: ["No encontrado"] });
  } catch (e) {
    const known = e instanceof SyntaxError || /contraseña|demasiado grande/i.test(e.message);
    if (!known) console.error(e);
    send(res, known ? 400 : 500, { errors: [e instanceof SyntaxError ? "JSON no válido" : known ? e.message : "Error interno"] });
  }
});

if (process.argv[1] === import.meta.filename) {
  server.listen(PORT, HOST, () => {
    console.log(`Cobijo en http://${HOST}:${PORT}`);
    if (!["127.0.0.1", "localhost", "::1"].includes(HOST) && !process.env.COOKIE_SECURE)
      console.warn("Aviso: escuchando en la red sin HTTPS. Pon un proxy con TLS delante y arranca con COOKIE_SECURE=1.");
  });
  pump(); // retoma lo que quedó en cola
}
