# Despliegue en cPanel

Guía para poner el LMS en un alojamiento cPanel con Node.js (Passenger) y MariaDB.

---

## 1. Sobre los WebSockets: ya no hacen falta

**Resumen: no tienes que escribir al hosting.** El sistema ya no usa WebSockets.

El problema que observaste es real y conocido. Las aplicaciones Node en cPanel se sirven
detrás de Apache con Passenger, y la configuración estándar no propaga la cabecera
`Upgrade` que necesita el protocolo WebSocket. La conexión se queda a medias, el navegador
reintenta en bucle y el tiempo real nunca llega a funcionar. Pedir que habiliten
`mod_proxy_wstunnel` es posible en un VPS, pero en alojamiento compartido casi nunca lo
conceden, y aunque lo hicieran quedarías atado a esa configuración.

La solución aplicada elimina el problema en lugar de rodearlo: el tiempo real pasó a
**Server-Sent Events**. Encaja porque todo lo que el sistema empuja va en una sola
dirección —notificaciones, presencia, avisos de calificación, revocación de sesión— y SSE
es exactamente eso: una respuesta HTTP que se mantiene abierta y va enviando líneas de
texto. Al ser HTTP/1.1 corriente, atraviesa Apache, Passenger y cualquier proxy intermedio
sin configuración especial.

La única acción que viajaba en sentido contrario (avisar de que se está editando un curso)
es ahora una petición `POST`/`DELETE` normal.

### Lo único que conviene comprobar

| Aspecto | Qué mirar | Si falla |
|---|---|---|
| Búfer de Apache | Los avisos llegan en el momento, no de golpe al cabo de un minuto | La API ya envía `X-Accel-Buffering: no` y `Cache-Control: no-transform`. Si aun así se agrupan, pide que desactiven `mod_deflate` para `text/event-stream` |
| Tiempo máximo de conexión | El flujo aguanta abierto más de 30 s | La API manda un latido cada 25 s para evitar el cierre por inactividad; el cliente reconecta solo si se corta |
| Procesos simultáneos | Cada pestaña abierta mantiene una conexión | Con muchos usuarios a la vez, sube el número de procesos de la aplicación Node en cPanel |

Si el alojamiento cortara el flujo de forma agresiva, la aplicación **sigue funcionando**:
el tiempo real se degrada y los datos se refrescan al navegar, pero nada se rompe.

---

## 2. Requisitos

- Node.js 20 o superior (cPanel → *Setup Node.js App*)
- MariaDB 10.6 o superior (cPanel → *MySQL Databases*)
- Dos subdominios: uno para el cliente y otro para la API

Ejemplo:

| Parte | Subdominio | Puerto interno |
|---|---|---|
| Cliente (Next.js) | `campus.tu-dominio.com` | 3100 |
| API (NestJS) | `api-campus.tu-dominio.com` | 3200 |

El cliente deduce la URL de la API a partir del prefijo del host, de modo que con esos
nombres no hace falta recompilar para cada dominio.

---

## 3. Base de datos

1. cPanel → **MySQL Databases** → crea la base (`usuario_lms`) y un usuario.
2. Asigna al usuario **todos los privilegios** sobre esa base.
3. Anota la cadena de conexión:

```
mysql://usuario_lmsuser:CONTRASEÑA@127.0.0.1:3306/usuario_lms
```

Si la contraseña lleva caracteres especiales, codifícalos (`@` → `%40`, `#` → `%23`).

---

## 4. Preparar los artefactos

En tu equipo, no en el servidor:

```bash
npm run init
npm run build
```

Esto deja:

- `apps/api/dist` — la API compilada
- `apps/client/prod` — el cliente en modo *standalone*, con todo lo que necesita

Sube al servidor, por cada aplicación:

**API** (`~/lms-api`)
```
dist/            prisma/          package.json     node_modules/
```

**Cliente** (`~/lms-client`): el contenido de `apps/client/prod`.

`node_modules` puede subirse comprimido o instalarse en el servidor con
`npm ci --omit=dev` desde el terminal de cPanel.

---

## 5. Configurar las aplicaciones Node

cPanel → **Setup Node.js App** → *Create Application*, una por cada parte.

### API

| Campo | Valor |
|---|---|
| Application root | `lms-api` |
| Application URL | `api-campus.tu-dominio.com` |
| Application startup file | `dist/main.js` |
| Node.js version | 20+ |
| Environment | Production |

Variables de entorno (botón *Add Variable*):

```
NODE_ENV           production
DATABASE_URL       mysql://usuario_lmsuser:CLAVE@127.0.0.1:3306/usuario_lms
JWT_SECRET         <64 caracteres aleatorios>
APP_PORT           3200
CORS_ORIGIN        https://campus.tu-dominio.com
APP_URL            https://campus.tu-dominio.com
API_PUBLIC_URL     https://api-campus.tu-dominio.com
BREVO_API_KEY      <clave de Brevo>
```

Genera el secreto con:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

La API **no arranca** si `JWT_SECRET` falta, es corto o es uno de los valores de ejemplo.
Es deliberado: con un secreto adivinable, cualquiera puede fabricarse un token de
administrador.

### Cliente

| Campo | Valor |
|---|---|
| Application root | `lms-client` |
| Application URL | `campus.tu-dominio.com` |
| Application startup file | `server.js` |
| Environment | Production |

```
NODE_ENV             production
PORT                 3100
NEXT_PUBLIC_API_URL  https://api-campus.tu-dominio.com/api
```

---

## 6. Crear las tablas y los datos iniciales

Desde el terminal de cPanel, en `~/lms-api`:

```bash
npx prisma db push
npx ts-node prisma/seed.ts
```

`db push` crea el esquema. La semilla crea **un administrador por sede** y las plantillas
de correo, e imprime las contraseñas **una sola vez**: anótalas antes de cerrar el
terminal.

La semilla está bloqueada con `NODE_ENV=production`. Para ejecutarla la primera vez:

```bash
NODE_ENV=development npx ts-node prisma/seed.ts
```

La configuración de cada sede (marca, textos, contacto) la crea la propia API al arrancar,
así que no hay que sembrarla.

---

## 7. Comprobaciones

```bash
curl https://api-campus.tu-dominio.com/api/health
```

Debe responder `"status": "healthy"` y `database.status: "ok"`.

Después, en el navegador:

1. `https://campus.tu-dominio.com` muestra el selector de sede.
2. Al elegir sede, la portada carga con la marca de esa sede.
3. El acceso con el administrador de la semilla pide cambiar la contraseña.
4. Dentro del panel, el indicador de conexión se mantiene activo: el flujo SSE funciona.

---

## 8. Archivos subidos

Sin `R2_*` configurado, los archivos se guardan en `~/lms-api/uploads`. **Ese directorio no
debe borrarse entre despliegues**: contiene entregas de alumnos y certificados emitidos.

Si tu procedimiento de despliegue reemplaza la carpeta de la aplicación, configura
Cloudflare R2 y el almacenamiento deja de depender del servidor:

```
R2_ACCOUNT_ID         <id de cuenta>
R2_ACCESS_KEY_ID      <clave>
R2_SECRET_ACCESS_KEY  <secreto>
R2_BUCKET_NAME        lms-uploads
```

El bucket **no debe ser público**: el material reservado —entregas, certificados y firmas—
se sirve a través de la API con enlaces firmados que caducan en una hora.

---

## 9. Correo

En alojamiento compartido los puertos SMTP salientes suelen estar cerrados. Por eso el
sistema usa preferentemente la **API HTTP de Brevo**, que va por el puerto 443:

1. Crea una cuenta en Brevo y genera una clave de API.
2. Añade `BREVO_API_KEY` a las variables de la aplicación API.
3. Verifica el dominio remitente en Brevo para que los correos no acaben en spam.

Si prefieres SMTP, rellena `SMTP_HOST`, `SMTP_USER` y `SMTP_PASS`; sólo se usan cuando
`BREVO_API_KEY` está vacío.

---

## 10. Actualizaciones

```bash
# En local
npm run build

# Sube dist/ (API) y prod/ (cliente)
# En el terminal de cPanel, si el esquema cambió:
npx prisma db push

# cPanel → Setup Node.js App → Restart, en las dos aplicaciones
```

Reinicia siempre la API después de cambiar una variable de entorno: se leen al arrancar.

---

## 11. Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| La API no arranca y el registro dice `JWT_SECRET` | Secreto ausente o demasiado corto | Genera uno de 64 caracteres y reinicia |
| El navegador bloquea las peticiones por CORS | `CORS_ORIGIN` no coincide con el dominio del cliente | Ponlo exacto, con `https://` y sin barra final |
| Las imágenes no cargan | `API_PUBLIC_URL` sin definir | Defínela y reinicia la API |
| El tiempo real no conecta | Proxy agrupando la respuesta | Revisa el apartado 1 |
| Los certificados salen sin logotipo | El logotipo no está subido en esa sede | Panel → Tema y apariencia, en cada sede |
| Un alumno no puede entrar | Está intentando acceder a la sede equivocada | Que cambie de sede en la portada antes de iniciar sesión |
