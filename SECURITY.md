# Seguridad

## Informar de una vulnerabilidad

No abras un issue público. Usa **[Report a vulnerability](https://github.com/daespasa/cobijo/security/advisories/new)** (avisos privados de GitHub) con los pasos para reproducirla. Respondo en cuanto pueda.

## Modelo de amenazas

Cobijo está pensado para ejecutarse **en tu máquina o en tu red de casa**, con pocos usuarios de confianza. Por defecto escucha solo en `127.0.0.1`.

Lo que protege:

- **Contraseñas**: `scrypt` (N=16384, r=8, p=1) con sal aleatoria por usuario, comparación en tiempo constante. Un usuario inexistente tarda lo mismo que una contraseña errónea.
- **Sesiones**: token aleatorio de 256 bits en una cookie `HttpOnly`, `SameSite=Lax`, de 30 días. En la base de datos solo se guarda su SHA-256. Cerrar sesión la invalida en el servidor; cambiar la contraseña cierra las demás.
- **CSRF**: las peticiones que modifican datos deben ser JSON y del mismo origen.
- **Fuerza bruta**: 10 intentos fallidos por IP bloquean el login 15 minutos.
- **Aislamiento**: cada usuario solo ve y modifica sus búsquedas, listas y guardados (cubierto por `src/server.test.mjs`).
- **Entrada**: toda la entrada se valida en el servidor (fechas, rangos, zonas, comodidades, tamaño máximo del cuerpo). Lo que se guarda en una lista se copia de datos del servidor, nunca de lo que mande el navegador.
- **Navegador**: `Content-Security-Policy` estricta (solo scripts propios, mapas de Esri y Nominatim), `X-Frame-Options: DENY`, `nosniff`. Los textos que vienen de Booking/Airbnb se escapan antes de pintarse.
- **Ficheros**: el servidor solo sirve lo que hay en `public/`, sin poder salir de esa carpeta.
- **Recursos**: máximo 3 búsquedas pendientes por usuario; un único Chromium a la vez.

Lo que **no** cubre:

- No hay HTTPS propio. Si lo expones fuera de `127.0.0.1` (`HOST=0.0.0.0`), ponlo detrás de un proxy con TLS y arranca con `COOKIE_SECURE=1`.
- No hay registro público ni recuperación de contraseña por correo: los usuarios se gestionan desde la terminal (`npm run users`).

## Datos locales

`data/` (base de datos con usuarios, hashes, sesiones e historial) y `output/` están en `.gitignore`. No los subas.
