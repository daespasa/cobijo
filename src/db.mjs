// Base de datos (SQLite) y usuarios/sesiones. La usan el servidor y el CLI de usuarios.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const ROOT = path.resolve(import.meta.dirname, "..");
fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
export const db = new Database(process.env.COBIJO_DB || path.join(ROOT, "data", "busquedas.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    prefs TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    params TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued', -- queued | running | done | cancelled | error
    progress TEXT,
    failures TEXT,
    error TEXT
  );
  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY,
    search_id INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
    zone TEXT, provider TEXT, url TEXT NOT NULL, title TEXT, location TEXT,
    total_price REAL, per_person_night REAL, private_rooms INTEGER, bathrooms INTEGER, beds INTEGER,
    rating REAL, reviews INTEGER, fits_budget INTEGER, fits_privacy INTEGER, lat REAL, lng REAL
  );
  CREATE INDEX IF NOT EXISTS results_search ON results(search_id);
  -- listas de alojamientos guardados (cada usuario las que quiera)
  CREATE TABLE IF NOT EXISTS lists (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, name)
  );
`);
// migraciones de columnas añadidas después
for (const [table, col] of [["results", "lat REAL"], ["results", "lng REAL"], ["searches", "user_id INTEGER REFERENCES users(id) ON DELETE CASCADE"]]) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col}`);
  } catch {}
}
db.exec("CREATE INDEX IF NOT EXISTS searches_user ON searches(user_id)");

// Guardados: copia del resultado (sobrevive aunque se borre la búsqueda), dentro de una lista.
// La primera versión no tenía listas: se rehace la tabla y lo que hubiera va a «Favoritos».
const FAVORITES_SQL = `CREATE TABLE favorites (
  id INTEGER PRIMARY KEY,
  list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  url TEXT NOT NULL, provider TEXT, zone TEXT, title TEXT, location TEXT,
  total_price REAL, per_person_night REAL, private_rooms INTEGER, bathrooms INTEGER, beds INTEGER,
  rating REAL, reviews INTEGER, fits_budget INTEGER, fits_privacy INTEGER, lat REAL, lng REAL,
  UNIQUE (list_id, url)
)`;
export const FAV_COLS = "url, provider, zone, title, location, total_price, per_person_night, private_rooms, bathrooms, beds, rating, reviews, fits_budget, fits_privacy, lat, lng";
const favCols = db.prepare("SELECT name FROM pragma_table_info('favorites')").all().map((c) => c.name);
if (!favCols.length) db.exec(FAVORITES_SQL);
else if (!favCols.includes("list_id")) {
  db.transaction(() => {
    db.exec("ALTER TABLE favorites RENAME TO favorites_old");
    db.exec(FAVORITES_SQL);
    db.exec("INSERT OR IGNORE INTO lists (user_id, name) SELECT DISTINCT user_id, 'Favoritos' FROM favorites_old");
    db.exec(`INSERT OR IGNORE INTO favorites (list_id, created_at, ${FAV_COLS})
      SELECT l.id, f.created_at, ${FAV_COLS.split(", ").map((c) => "f." + c).join(", ")}
      FROM favorites_old f JOIN lists l ON l.user_id = f.user_id AND l.name = 'Favoritos'`);
    db.exec("DROP TABLE favorites_old");
  })();
}
db.exec("CREATE INDEX IF NOT EXISTS favorites_list ON favorites(list_id)");

// ---------- contraseñas (scrypt, de la librería estándar) ----------
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
export function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored).split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = crypto.scryptSync(String(password), Buffer.from(salt, "hex"), expected.length, SCRYPT);
  return crypto.timingSafeEqual(actual, expected);
}
export const passwordProblem = (p) =>
  typeof p !== "string" || p.length < 8 ? "La contraseña necesita al menos 8 caracteres" : p.length > 200 ? "La contraseña es demasiado larga" : null;

// ---------- usuarios ----------
export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/i;
export function createUser(username, password, name = username) {
  if (!USERNAME_RE.test(username)) throw new Error("Usuario: 3–32 letras, números, punto, guion o guion bajo");
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const id = Number(
    db.prepare("INSERT INTO users (username, name, password_hash) VALUES (?, ?, ?)").run(username, String(name).slice(0, 60), hashPassword(password)).lastInsertRowid
  );
  db.prepare("INSERT INTO lists (user_id, name) VALUES (?, 'Favoritos')").run(id); // para poder guardar desde el primer día
  return id;
}
export function setPassword(userId, password) {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hashPassword(password), userId);
}
export const randomPassword = () => crypto.randomBytes(12).toString("base64url");

// ---------- sesiones ----------
export const SESSION_DAYS = 30;
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex"); // en la BD solo el hash del token
export function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`).run(sha256(token), userId);
  db.prepare("UPDATE users SET last_login_at=datetime('now') WHERE id=?").run(userId);
  return token;
}
export function sessionUser(token) {
  if (!token) return null;
  return (
    db
      .prepare(
        `SELECT u.id, u.username, u.name, u.prefs, u.created_at, u.last_login_at, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
      )
      .get(sha256(token)) || null
  );
}
export const deleteSession = (token) => token && db.prepare("DELETE FROM sessions WHERE token_hash=?").run(sha256(token));
export const deleteOtherSessions = (userId, keepToken) =>
  db.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").run(userId, sha256(keepToken || ""));
export const purgeExpiredSessions = () => db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
