// Prueba de extremo a extremo de usuarios y sesiones contra una BD temporal.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cobijo-"));
const env = { ...process.env, COBIJO_ADMIN: "daespasa", COBIJO_DB: path.join(dir, "test.sqlite"), PORT: String(20000 + Math.floor(Math.random() * 20000)) };
const base = `http://127.0.0.1:${env.PORT}`;
const json = { "content-type": "application/json" };

let server;
let password;
test.before(async () => {
  server = spawn(process.execPath, [path.join(import.meta.dirname, "server.mjs")], { env });
  let out = "";
  await new Promise((resolve, reject) => {
    server.stdout.on("data", (d) => {
      out += d;
      if (out.includes("Cobijo en")) resolve();
    });
    server.on("exit", () => reject(new Error(out)));
  });
  password = out.match(/Contraseña: (\S+)/)[1];
});
test.after(() => {
  server.kill();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("login, sesión de 30 días, preferencias, aislamiento y logout", async () => {
  const anon = await fetch(`${base}/api/me`);
  assert.equal(anon.status, 401);
  assert.match(anon.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(anon.headers.get("x-content-type-options"), "nosniff");
  // un usuario que no existe responde igual que una contraseña mala
  const ghost = await fetch(`${base}/api/login`, { method: "POST", headers: json, body: JSON.stringify({ username: "nadie", password: "loquesea1" }) });
  assert.equal(ghost.status, 401);

  const bad = await fetch(`${base}/api/login`, { method: "POST", headers: json, body: JSON.stringify({ username: "daespasa", password: "nope-nope" }) });
  assert.equal(bad.status, 401);

  const ok = await fetch(`${base}/api/login`, { method: "POST", headers: json, body: JSON.stringify({ username: "DAESPASA", password }) });
  assert.equal(ok.status, 200);
  const setCookie = ok.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Max-Age=2592000/); // 30 días
  const cookie = { cookie: setCookie.split(";")[0] };
  const me = await (await fetch(`${base}/api/me`, { headers: cookie })).json();
  assert.equal(me.username, "daespasa");
  assert.ok(Date.parse(me.sessionExpiresAt + "Z") - Date.now() > 29 * 86400000);

  // CSRF: sin JSON o desde otro origen, no
  assert.equal((await fetch(`${base}/api/logout`, { method: "POST", headers: cookie })).status, 415);
  assert.equal((await fetch(`${base}/api/logout`, { method: "POST", headers: { ...cookie, ...json, origin: "https://evil.example" } })).status, 403);

  // preferencias
  const prefs = { origin: { name: "Sueca", lat: 39.2, lng: -0.31 }, filters: { privacy: false, freeOnly: true, minRating: 8, sort: "distance", provider: "airbnb" } };
  const put = await (await fetch(`${base}/api/me`, { method: "PUT", headers: { ...cookie, ...json }, body: JSON.stringify({ name: "Dani", prefs }) })).json();
  assert.equal(put.name, "Dani");
  assert.deepEqual(put.prefs, prefs);
  const badForm = await fetch(`${base}/api/me`, { method: "PUT", headers: { ...cookie, ...json }, body: JSON.stringify({ prefs: { form: { adults: -3 } } }) });
  assert.equal(badForm.status, 400);

  // aislamiento: la búsqueda de otro usuario no se ve ni se borra
  execFileSync(process.execPath, [path.join(import.meta.dirname, "users.mjs"), "add", "otra"], { env });
  const db = new Database(env.COBIJO_DB);
  const other = db.prepare("SELECT id FROM users WHERE username='otra'").get().id;
  const sid = db.prepare("INSERT INTO searches (params, status, user_id) VALUES ('{}', 'done', ?)").run(other).lastInsertRowid;
  db.close();
  assert.equal((await fetch(`${base}/api/searches/${sid}`, { headers: cookie })).status, 404);
  assert.equal((await fetch(`${base}/api/searches/${sid}`, { method: "DELETE", headers: { ...cookie, ...json } })).status, 404);
  assert.deepEqual(await (await fetch(`${base}/api/searches`, { headers: cookie })).json(), []);

  // listas: la de serie, crear, duplicado, guardar, copiar entre listas, aislamiento y borrado en cascada
  const req = (method, url, body) => fetch(`${base}${url}`, { method, headers: { ...cookie, ...json }, body: body && JSON.stringify(body) });
  const lists0 = await (await req("GET", "/api/lists")).json();
  assert.deepEqual(lists0.map((l) => l.name), ["Favoritos"]);
  const trip = await (await req("POST", "/api/lists", { name: "Fin de año" })).json();
  assert.equal((await req("POST", "/api/lists", { name: "Fin de año" })).status, 409);
  assert.equal((await req("POST", "/api/lists", { name: "   " })).status, 400);
  const db2 = new Database(env.COBIJO_DB);
  const me2 = db2.prepare("SELECT id FROM users WHERE username='daespasa'").get().id;
  const mySearch = db2.prepare("INSERT INTO searches (params, status, user_id) VALUES ('{}', 'done', ?)").run(me2).lastInsertRowid;
  const rid = db2.prepare("INSERT INTO results (search_id, url, title, per_person_night) VALUES (?, 'https://www.booking.com/hotel/es/x.html', 'Casa X', 44)").run(mySearch).lastInsertRowid;
  const otherRid = db2.prepare("INSERT INTO results (search_id, url, title) VALUES (?, 'https://www.airbnb.es/rooms/1', 'Ajena')").run(sid).lastInsertRowid;
  const otherList = db2.prepare("SELECT id FROM lists WHERE user_id=?").get(other).id;
  db2.close();
  const fav = await (await req("POST", "/api/favorites", { listId: trip.id, resultId: rid })).json();
  assert.equal(fav.title, "Casa X");
  assert.equal((await req("POST", "/api/favorites", { listId: trip.id, resultId: otherRid })).status, 404); // resultado de otro
  assert.equal((await req("POST", "/api/favorites", { listId: otherList, resultId: rid })).status, 404); // lista de otro
  const copy = await req("POST", "/api/favorites", { listId: lists0[0].id, favoriteId: fav.id });
  assert.equal(copy.status, 201);
  const renamed = await (await req("PUT", `/api/lists/${trip.id}`, { name: "Nochevieja" })).json();
  assert.equal(renamed.name, "Nochevieja");
  assert.equal(renamed.count, 1);
  assert.equal((await req("DELETE", `/api/lists/${otherList}`)).status, 404);
  await req("DELETE", `/api/lists/${trip.id}`);
  const left = await (await req("GET", "/api/favorites")).json();
  assert.deepEqual(left.map((f) => f.list_id), [lists0[0].id]); // solo queda la copia en Favoritos

  // cambio de contraseña
  const wrong = await fetch(`${base}/api/me/password`, { method: "POST", headers: { ...cookie, ...json }, body: JSON.stringify({ current: "x", next: "nueva-clave-1" }) });
  assert.equal(wrong.status, 400);
  const short = await fetch(`${base}/api/me/password`, { method: "POST", headers: { ...cookie, ...json }, body: JSON.stringify({ current: password, next: "corta" }) });
  assert.equal(short.status, 400);
  const changed = await fetch(`${base}/api/me/password`, { method: "POST", headers: { ...cookie, ...json }, body: JSON.stringify({ current: password, next: "nueva-clave-1" }) });
  assert.equal(changed.status, 200);

  // logout invalida la sesión en el servidor
  await fetch(`${base}/api/logout`, { method: "POST", headers: { ...cookie, ...json } });
  assert.equal((await fetch(`${base}/api/me`, { headers: cookie })).status, 401);
});
