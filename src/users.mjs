// Gestión de usuarios desde la terminal.
//   node src/users.mjs list
//   node src/users.mjs add <usuario> ["Nombre visible"]   (genera la contraseña y la muestra una vez)
//   node src/users.mjs passwd <usuario>                   (genera una nueva y cierra sus sesiones)
//   node src/users.mjs remove <usuario>
import { db, createUser, setPassword, randomPassword } from "./db.mjs";

const [cmd, username, name] = process.argv.slice(2);
const find = (u) => db.prepare("SELECT id, username FROM users WHERE username=?").get(u);

try {
  if (cmd === "list") {
    const rows = db.prepare("SELECT username, name, created_at, last_login_at FROM users ORDER BY id").all();
    console.table(rows);
  } else if (cmd === "add" && username) {
    const password = randomPassword();
    createUser(username, password, name || username);
    console.log(`Usuario «${username}» creado.\nContraseña: ${password}\n(Cámbiala desde la app: menú de usuario → Cambiar contraseña)`);
  } else if (cmd === "passwd" && username) {
    const u = find(username);
    if (!u) throw new Error(`No existe el usuario «${username}»`);
    const password = randomPassword();
    setPassword(u.id, password);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
    console.log(`Nueva contraseña de «${username}»: ${password}\nSe han cerrado sus sesiones abiertas.`);
  } else if (cmd === "remove" && username) {
    const u = find(username);
    if (!u) throw new Error(`No existe el usuario «${username}»`);
    db.prepare("DELETE FROM users WHERE id=?").run(u.id);
    console.log(`Usuario «${username}» borrado, con sus búsquedas y guardados.`);
  } else {
    console.log("Uso: node src/users.mjs list | add <usuario> [nombre] | passwd <usuario> | remove <usuario>");
    process.exitCode = 1;
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
