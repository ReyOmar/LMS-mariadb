# Despliegue en cPanel

Guía para **actualizar en cPanel la instalación de la versión de julio de 2026** (la que usaba
WebSockets, calificaba de 0 a 5 y no tenía sedes) a la versión actual. La segunda parte es la
referencia de la configuración.

## El servidor

| Qué                  | Valor                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Carpeta del proyecto | `/home/investig/lms-pesv-project`                                                                                  |
| API                  | Raíz `lms-pesv-project/apps/api` · `https://api-lms.investigaciongipia.com`                                        |
| Cliente              | Raíz `lms-pesv-project/apps/client/prod/apps/client` · arranque `server.js` · `https://lms.investigaciongipia.com` |
| Node.js              | 20.20.2 (vale: hace falta 20.19 o superior)                                                                        |
| Base de datos        | `investig_lms_db`, usuario `investig_lms`                                                                          |
| Archivos subidos     | Hoy en `apps/api/uploads`; pasan a `/home/investig/lms-data/uploads`                                               |

Las contraseñas no van en esta guía: cuando un paso pide la cadena de la base, cópiala de las
variables de la API en _Setup Node.js App_.

---

# Parte 1 · Actualización desde la versión de julio

## Qué cambia

| Tema                   | Julio                                        | Ahora                                                                                                                  |
| ---------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Sedes                  | Una sola                                     | Colombia y México, separadas. **Todo lo existente pasa a Colombia**; México empieza vacío, con su propio administrador |
| Notas                  | 0–5, aprobación 3,0                          | 0–100. Las notas se multiplican por 20: un 4,5 pasa a 90 y la aprobación 3,0 a **60** (se puede subir por curso)       |
| Estructura de un curso | Curso › módulo › lección › recurso           | Curso › módulo › recurso. Los recursos de cada lección quedan seguidos en su módulo, en el mismo orden                 |
| Archivos               | `apps/api/uploads`, dentro de la aplicación  | `/home/investig/lms-data/uploads`, fuera de la aplicación; el material reservado se sirve con enlace firmado           |
| Tiempo real            | WebSockets (no funcionaban detrás de Apache) | Server-Sent Events: HTTP normal, sin configurar nada                                                                   |
| Arranque de la API     | `app.js`                                     | `dist/main.js`                                                                                                         |
| Base de datos          | MySQL o MariaDB                              | **Sólo MariaDB** (10.6 o superior): la API usa `max_statement_time`, que MySQL no tiene                                |
| Sesiones               | Varias por cuenta                            | Una por cuenta. **Todo el mundo tendrá que volver a entrar** después de actualizar                                     |
| Protección de datos    | —                                            | Cada persona acepta la política de datos la primera vez que entra; queda registrada la fecha y la versión              |
| Cuentas desactivadas   | Existían                                     | No existen: una cuenta desactivada en julio podrá volver a entrar (el diagnóstico las lista)                           |
| Otros sistemas         | —                                            | Piden matrículas por API, con una clave por sede, como el software PESV ([INTEGRACION.md](INTEGRACION.md))             |

La base se migra con un script incluido en el paquete (`apps/api/prisma/migracion-julio/migrar.js`).
Se ha ensayado sobre una copia con datos de julio: el resultado tiene **exactamente** la
estructura de una instalación nueva, y la API y el cliente funcionan sobre ella (acceso por
sede, cursos, entregas, cuestionarios, certificados y descargas de los archivos antiguos).

Calcula **una hora** de campus cerrado. Lo que más tarda es copiar los archivos.

## Paso 1 · Generar el paquete (en tu equipo)

```bash
git pull
npm run init
npm run package:cpanel -- --api-url https://api-lms.investigaciongipia.com/api
```

Deja un único archivo, `despliegue/lms-cpanel.zip` (≈30 MB), con la misma estructura que la
carpeta del proyecto en el servidor:

```
apps/api/           dist/, prisma/ (con el script de migración), prisma.config.ts, tsconfig.json,
                    package.json, package-lock.json — las dependencias se instalan allí
apps/client/prod/   el servidor del cliente, con todas sus dependencias
```

No lleva código fuente, historial de git ni archivos `.env` (el script se niega a generarlo si
encontrara alguno): es lo único que se sube al servidor.

`--api-url` fija dentro del cliente la dirección de la API: Next la incrusta al compilar, así
que la variable `NEXT_PUBLIC_API_URL` del panel no cuenta, y tampoco la de tu `.env` local (un
túnel o una dirección de desarrollo dejarían el campus sin conexión).

## Paso 2 · Ensayo en local con una copia de producción (recomendado)

Antes de tocar el servidor, repite la migración sobre una copia real. Descarga la base de
producción (phpMyAdmin → `investig_lms_db` → **Exportar** → SQL) y, con el Docker del proyecto
levantado (`docker compose up -d`):

```bash
docker exec lms-mariadb mariadb -uroot -proot -e "CREATE DATABASE lms_ensayo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON lms_ensayo.* TO 'lms_user'@'%';"
docker exec -i lms-mariadb mariadb -uroot -proot lms_ensayo < investig_lms_db.sql
cd apps/api
export DATABASE_URL="mysql://lms_user:lms_password@127.0.0.1:3306/lms_ensayo"
export STORAGE_DIR="$HOME/lms-ensayo-uploads"
node prisma/migracion-julio/migrar.js diagnostico
```

Sigue después los pasos 7.3 a 7.7 en tu equipo (el 7.5 sólo si descargas también
`apps/api/uploads` para usarla de `--origen`). Si salen bien en local, saldrán bien en el
servidor. Al terminar, borra la base: `docker exec lms-mariadb mariadb -uroot -proot -e "DROP DATABASE lms_ensayo;"`.

## Paso 3 · Comprobaciones previas

En phpMyAdmin → **SQL**:

```sql
SELECT VERSION();
```

Tiene que decir `MariaDB` y ser 10.6 o superior. Si es MySQL, no sigas: pide MariaDB al
alojamiento.

En la **Terminal** de cPanel, el espacio que ocupan los archivos subidos:

```bash
du -sh ~/lms-pesv-project/apps/api/uploads
```

Necesitas libre en la cuenta el doble de esa cifra (se copian antes de borrar los antiguos) más
unos 600 MB para las dependencias y las copias de seguridad. La cuota se ve en la portada de
cPanel (_Uso del disco_).

## Paso 4 · Cerrar el campus

**Setup Node.js App** → **Detener aplicación** en la API y en el cliente. A partir de aquí
nadie escribe en la base mientras se migra.

## Paso 5 · Copias de seguridad

En la Terminal:

```bash
mkdir -p ~/respaldo-julio
mysqldump --single-transaction --routines -u investig_lms -p investig_lms_db > ~/respaldo-julio/base.sql
tar --exclude=lms-pesv-project/apps/api/node_modules -czf ~/respaldo-julio/proyecto.tar.gz -C ~ lms-pesv-project
ls -lh ~/respaldo-julio
```

`mysqldump` pide la contraseña de la base (la que va en `DATABASE_URL`, entre `investig_lms:` y
`@`; si allí aparece algo como `%5D`, escribe el carácter real: `%5D` es `]`). Comprueba que
`base.sql` no está vacío. La copia del proyecto incluye `apps/api/uploads`. **No sigas sin estas
dos copias**: el paso 7.4 sólo se deshace restaurándolas.

## Paso 6 · Sustituir el código

En la Terminal:

```bash
cd ~/lms-pesv-project

# 1. Los archivos subidos salen de la aplicación
mkdir -p ~/lms-data
mv apps/api/uploads ~/lms-data/uploads-julio

# 2. Vaciar la API, conservando node_modules (el enlace al entorno de Node que crea cPanel)
find apps/api -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +

# 3. Retirar el cliente de julio (el paquete trae el nuevo completo)
rm -rf apps/client/prod

ls -la apps/api apps/client
```

`apps/api` queda vacía, o sólo con `node_modules` si existía. Es normal no verla: cPanel guarda
las dependencias en `~/nodevenv/lms-pesv-project/apps/api/20/lib/node_modules` y no siempre crea
el enlace en la carpeta de la aplicación. El paso 7.1 las instala allí en cualquier caso.

Después, en el **Administrador de archivos**: entra en `lms-pesv-project`, **Cargar**
`lms-cpanel.zip`, selecciónalo, **Extraer** en `/lms-pesv-project` y borra el zip. Comprueba
que existen `apps/api/dist/main.js` y `apps/client/prod/apps/client/server.js`.

## Paso 7 · Dependencias y migración de la base

### 7.1 · Dependencias de la API

Entra en el entorno de Node de la API (es el comando que muestra su página en _Setup Node.js
App_) e instala:

```bash
source /home/investig/nodevenv/lms-pesv-project/apps/api/20/bin/activate && cd /home/investig/lms-pesv-project/apps/api
npm install --include=dev
npx prisma generate
```

Usa `npm install` y no `npm ci`: `npm ci` borra `node_modules`, que aquí es un enlace gestionado
por cPanel. Las herramientas de Prisma son dependencias de desarrollo y hacen falta para migrar,
por eso se pide `--include=dev`: en modo _Production_ el panel pone `NODE_ENV=production` y npm las omitiría. El cliente no necesita instalar nada.

Si `npm install` se niega con un mensaje de CloudLinux sobre la carpeta `node_modules`, pulsa
**Ejecutar NPM Install** en la página de la API y vuelve a esta Terminal. En cualquier caso,
comprueba que están las herramientas de Prisma antes de seguir:

```bash
npx prisma --version
```

### 7.2 · Preparar la Terminal

La Terminal no ve las variables de la aplicación: define las dos que usa la migración. Cuando
pida `DATABASE_URL`, pega el valor tal cual está en las variables de la API; no se ve al
escribirlo ni queda en el historial de la Terminal.

```bash
read -rsp 'DATABASE_URL: ' DATABASE_URL && export DATABASE_URL && echo
export STORAGE_DIR='/home/investig/lms-data/uploads'
```

Y en phpMyAdmin → `investig_lms_db` → **SQL** (no cambia ninguna tabla; evita errores de
«_Illegal mix of collations_» en tablas creadas después fuera de Prisma):

```sql
ALTER DATABASE investig_lms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 7.3 · Diagnóstico

```bash
node prisma/migracion-julio/migrar.js diagnostico
```

Sólo lee. Cuenta lo que hay y avisa:

- **✗ (impide seguir)**: correos con tildes u otros caracteres no ASCII, que ya no podrían
  entrar —cámbialos en phpMyAdmin por su forma ASCII:
  `UPDATE usuarios SET email = '…' WHERE email = '…';`—, notas por encima de 5 o más de una
  fila de configuración. Corrige y repite el diagnóstico.
- **! (aviso)**: cuentas desactivadas que volverán a poder entrar, módulos con varias
  lecciones, imágenes incrustadas en textos con la dirección antigua (hay que volver a
  insertarlas desde el constructor) o valores de archivo que no se reconocen.

### 7.4 · Migrar

```bash
node prisma/migracion-julio/migrar.js antes
npx prisma db push --accept-data-loss
node prisma/migracion-julio/migrar.js despues
```

- **`antes`** convierte las notas a 0–100, pasa cada recurso de su lección a su módulo
  conservando el orden, asigna todo a Colombia, guarda en cada certificado el nombre del
  titular y el título del curso, convierte las rutas de archivo a `carpeta/nombre` y retira las
  claves ajenas de julio para que `db push` las cree limpias. **Sólo se ejecuta una vez**: si se
  repite, se niega, porque volvería a multiplicar las notas. Si se cortara a mitad, restaura
  `base.sql` (ver _Volver a julio_) y empieza de nuevo el paso 7.
- **`db push`** aplica el esquema nuevo. Antes enumera lo que va a perder; es lo esperado:
  - columnas que ya no se usan: `usuarios.activo`; `lms_cursos.escala`, `emite_certificado`,
    `deleted_at`, `fecha_inicio`, `fecha_fin` y `codigo_acceso`; `lms_modulos.requiere_anterior`;
    `lms_recursos.leccion_guid`, `deleted_at`, `obligatorio` y `tiempo_lectura`;
    `lms_entregas.contenido_texto` e `ip_address`; `lms_progreso_recurso.tiempo_invertido`;
    `lms_plantillas_correo.es_sistema`, y de `lms_configuracion` `idioma`, `contrasena_defecto`,
    `email_remitente`, `email_nombre` y `bienvenida_html`;
  - tablas: `lms_lecciones` (sus recursos ya están en los módulos), `lms_metricas_capacitacion`
    (se calcula al vuelo), `lms_token_revocations` y `_migracion_julio` (la marca del paso
    anterior);
  - cambios de tipo de las notas a `Decimal(5,2)`, que con valores de 0 a 100 no pierden nada, y
    de columnas de texto que se amplían (`MEDIUMTEXT`, `VARCHAR(255)` o `VARCHAR(500)`);
  - una restricción única sobre `pais` y `codigo_integracion` de `lms_cursos`: la columna es
    nueva y está vacía, así que no puede fallar.

  Debe terminar con «_Your database is now in sync with your Prisma schema_». Si se detuviera
  con `errno: 121 "Duplicate key on write or update"`, ejecútalo otra vez: aplica lo que falta.

- **`despues`** marca como terminadas las matrículas ya certificadas, calcula el avance de cada
  matrícula, anota como ya publicados los cursos que lo estaban, retira los avisos de cursos,
  entregas o cuentas que ya no existen y los índices redundantes, y adapta las plantillas de
  correo a la escala 0–100 («/5.0» pasa a «puntos»). Puede repetirse sin daño.

### 7.5 · Colocar los archivos

```bash
node prisma/migracion-julio/migrar.js archivos --origen ~/lms-data/uploads-julio
```

Copia cada archivo que usa la base a su sitio en `/home/investig/lms-data/uploads`
(`portadas/`, `entregas/`, `certificados/`…), lo encuentre suelto o en su carpeta. Al final
lista los que la base usa y no están; si aparece alguno, búscalo en la copia y repite el paso,
que no vuelve a copiar lo que ya está. Si no aparece (una foto de perfil, por ejemplo), quien lo
subió puede subirlo de nuevo.

Copia, no mueve: necesitas el doble de espacio mientras tanto. Si la cuota no da, añade
`--mover`. Lo que quede en `uploads-julio` no lo usa nadie; bórralo cuando hayas comprobado el
campus.

### 7.6 · Administradores y correos de cada sede

```bash
npx prisma db seed
```

Crea `admin.co@pesv.com` (Colombia) y `admin.mx@pesv.com` (México) si no existen, e imprime sus
contraseñas **una sola vez**: anótalas. El administrador de julio y el resto de cuentas siguen
igual; si no quieres el `admin.co` adicional, bórralo después desde el panel. También crea las
plantillas de correo de México y los eventos nuevos, sin tocar las existentes.

### 7.7 · Comprobar

```bash
node prisma/migracion-julio/migrar.js comprobar
```

Repasa el esquema, la escala de las notas, las cuentas por sede y rol, las plantillas de cada
sede, que todos los cuestionarios se puedan leer y que cada archivo esté en su sitio. Debe
terminar con «Todo en orden» o con la lista concreta de lo que falta.

## Paso 8 · Configurar y arrancar la API

**Setup Node.js App** → `api-lms.investigaciongipia.com` → editar:

- **Archivo de inicio de la aplicación**: `dist/main.js` (antes `app.js`). Lo demás (raíz,
  URL, Node 20.20.2, modo _Production_) se queda igual.
- **Variables**, con _Añadir variable_:

  | Variable         | Valor                                                                        |
  | ---------------- | ---------------------------------------------------------------------------- |
  | `STORAGE_DIR`    | `/home/investig/lms-data/uploads`                                            |
  | `API_PUBLIC_URL` | `https://api-lms.investigaciongipia.com`                                     |
  | `MAIL_FROM`      | Remitente de los correos, de un dominio verificado en Brevo                  |
  | `MAIL_FROM_NAME` | Nombre que ven los destinatarios (opcional; si no, «Campus Virtual»)         |
  | `BREVO_API_KEY`  | La clave de la API de Brevo, si no estaba ya (ver _Correo_ en la referencia) |

  Si existen `SMTP_FROM` y `SMTP_FROM_NAME`, sus valores pasan a `MAIL_FROM` y `MAIL_FROM_NAME`;
  bórralas, y con Brevo también el resto de `SMTP_*`. Las demás (`APP_URL`, `CORS_ORIGIN`,
  `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`) se quedan como están. Recomendado: cambia
  `JWT_SECRET` por uno nuevo, ya que todo el mundo tendrá que volver a entrar de todas formas:

  ```bash
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```

**Guardar** y **Reiniciar**. Comprueba:

```bash
curl https://api-lms.investigaciongipia.com/api/health
```

Debe responder `"status":"healthy"`, `"database":{"status":"ok"…}` y
`"storage":{"status":"ok"}`. Si no responde, el registro de la aplicación (normalmente
`~/lms-pesv-project/apps/api/stderr.log`) dice por qué; ver _Problemas frecuentes_.

En el primer arranque la API hace dos cosas solas, y lo deja en el registro: crea la
configuración de la sede de México y **borra los archivos de las entregas de los cursos ya
certificados** (conservando nombre, nota y comentario), como ya hacía julio al emitir cada
certificado.

## Paso 9 · Arrancar el cliente

En el cliente (`lms.investigaciongipia.com`) no cambia nada: misma raíz, mismo `server.js`, sin
instalar dependencias. La variable `NEXT_PUBLIC_API_URL` puede quedarse o borrarse: no se usa.
**Reiniciar** (o **Iniciar**).

## Paso 10 · Comprobar el campus

1. `https://lms.investigaciongipia.com` muestra la portada con la marca de siempre, en la sede
   de Colombia. El selector de la cabecera cambia a México.
2. Entra con el administrador de julio. Pide aceptar la política de datos.
3. En _Usuarios_, _Cursos_ y _Tareas_ están los datos de siempre; las notas, sobre 100.
4. Abre un curso como alumno: los recursos están en orden y las imágenes y los PDF se ven.
5. `https://lms.investigaciongipia.com/verify?code=CODIGO`, con el código de un certificado
   emitido en julio, dice que es válido. Los enlaces antiguos (`/verificar?codigo=…`,
   `/dashboard/…` en español) redirigen solos.
6. El indicador de conexión del panel se mantiene activo: el tiempo real funciona.
7. Sube una portada de prueba y comprueba que se ve.
8. Envía un correo de prueba (por ejemplo, _¿Olvidaste tu contraseña?_ con tu cuenta). Si no
   llega, el registro de la API lo dice; ver _Correo_.

Después, en cada sede:

- **Portada pública → Textos legales**: completa el responsable del tratamiento (razón social,
  NIT o RFC, domicilio, correo de privacidad).
- **México**: entra con `admin.mx@pesv.com`, cambia la contraseña y configura marca y textos.
- Revisa la **nota de aprobación** de los cursos: quedó en el equivalente de julio (60 si era
  3,0). La de los cursos nuevos es 80.
- Si el diagnóstico avisó de cuentas desactivadas, elimínalas desde _Usuarios_ si no deben
  entrar.
- Si el software PESV va a conectarse: en _Integraciones_, conecta el sistema y entrega la
  clave a su equipo, y pon a cada curso el código acordado con ellos (ver
  [INTEGRACION.md](INTEGRACION.md#antes-de-conectar)).

Por último, aplica lo de _Seguridad_ (Parte 2) y avisa a los usuarios de que tendrán que volver a
iniciar sesión. Cuando el campus lleve unos días sin problemas, descarga `~/respaldo-julio` a un
lugar seguro y bórrala del servidor: contiene la base entera.

## Si algo sale mal: volver a julio

1. **Detener aplicación** en la API y el cliente.
2. Restaura la base: phpMyAdmin → `investig_lms_db` → marcar todas las tablas → **Eliminar**, y
   después **Importar** `~/respaldo-julio/base.sql` (o en la Terminal,
   `mysql -u investig_lms -p investig_lms_db < ~/respaldo-julio/base.sql` sobre la base vacía).
3. Restaura el proyecto:

   ```bash
   cd ~/lms-pesv-project
   find apps/api -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
   rm -rf apps/client/prod
   tar -xzf ~/respaldo-julio/proyecto.tar.gz -C ~
   ```

   La copia trae también `apps/api/uploads`.

4. En la API, archivo de inicio `app.js` otra vez; entra en su entorno (paso 7.1) y ejecuta
   `npm install`.
5. **Iniciar** las dos aplicaciones.

---

# Parte 2 · Referencia

## Requisitos

- Node.js 20.19+, 22.12+ o 24+ (cPanel → _Setup Node.js App_).
- MariaDB 10.6 o superior, con un usuario con todos los privilegios sobre la base.
- Dos subdominios: el del cliente y el de la API (por ejemplo `lms.` y `api-lms.`).

## Seguridad

Lo que Apache encuentra en la raíz web de un dominio se lo entrega a quien lo pida. Con una
carpeta `.git` a la vista, por ejemplo, se reconstruye el proyecto entero y cualquier clave que
haya pasado por él. Por eso:

- **El proyecto vive fuera de la raíz web** (`~/lms-pesv-project`, nunca en `public_html`). La
  raíz de cada subdominio (cPanel → _Dominios_) sólo contiene el `.htaccess` que crea cPanel; ni
  el proyecto, ni copias (`.sql`, `.zip`, `.tar.gz`) van ahí.
- **En el servidor no se usa git**: se sube sólo `lms-cpanel.zip`, que no lleva `.git` ni `.env`.
- **Las claves sólo en _Setup Node.js App_.** En producción la API no lee ningún `.env`: no
  crees uno en el servidor. En la Terminal, `DATABASE_URL` se pide sin eco (paso 7.2).
- **La base sólo acepta conexiones locales**: `DATABASE_URL` apunta a `127.0.0.1` y cPanel →
  _Remote MySQL_ no tiene ningún host.

En el `.htaccess` de la raíz de cada subdominio (cliente y API), fuera del bloque
`CLOUDLINUX PASSENGER CONFIGURATION`, añade:

```apache
Options -Indexes
RedirectMatch 404 "/\.(?!well-known/)"
```

La primera línea impide listar carpetas; la segunda responde 404 a cualquier ruta con una parte
que empiece por punto (`/.git/config`, `/.env`…), salvo `/.well-known/`, que usa AutoSSL para
renovar los certificados. Para comprobarlo, y buscar restos en la cuenta y rastros de que alguien
los haya pedido:

```bash
curl -o /dev/null -sw '%{http_code}\n' https://api-lms.investigaciongipia.com/.git/config   # 404
curl -o /dev/null -sw '%{http_code}\n' https://lms.investigaciongipia.com/.env              # 404
find ~ -maxdepth 4 \( -name .git -o -name '.env*' \) -not -path '*/node_modules/*' -not -path '*/nodevenv/*'
grep -hE '"[A-Z]+ [^"]*/\.(git|env)' ~/access-logs/* | tail
```

Si `find` encuentra algo dentro de una raíz web, o el registro de accesos muestra peticiones a
`/.git` o `/.env` con respuesta `200`, da por expuestas las claves: borra esos archivos y cambia
la contraseña del usuario de la base (cPanel → _Bases de datos MySQL_) y con ella
`DATABASE_URL`, `JWT_SECRET` (cierra todas las sesiones), `STORAGE_SECRET` si existe, y la clave
de Brevo (crea otra y elimina la anterior). Reinicia la API.

El historial del repositorio conserva una clave de Google Maps en un archivo antiguo de
`.devcontainer`. El campus ya no la usa: revócala en Google Cloud.

## Tiempo real sin WebSockets

Las aplicaciones Node de cPanel se sirven detrás de Apache con Passenger, que no propaga la
cabecera `Upgrade` de los WebSockets: por eso el tiempo real de julio no llegaba a funcionar.
Ahora va por **Server-Sent Events**, una respuesta HTTP que se mantiene abierta, y atraviesa
Apache sin configurar nada. La API manda `X-Accel-Buffering: no` y un latido cada 25 s.

El flujo sale **comprimido por la propia API**, evento a evento. Con «Optimize Website →
Compress all content» de cPanel (o con LiteSpeed), el servidor comprime también el flujo y
retiene lo comprimido hasta llenar su búfer: los avisos no llegarían nunca, sin ningún error
a la vista. Lo que ya llega comprimido no lo vuelve a comprimir, así que pasa al instante y no
hace falta tocar la compresión del alojamiento.

Apache no avisa a la API de que alguien cerró la pestaña: se entera al escribirle, con los
latidos. Por eso «En línea» puede tardar hasta un minuto en apagarse. Si el flujo se cortara,
el campus sigue funcionando: los datos se refrescan al navegar.

## La API corre en un solo proceso

No subas el número de procesos de la API. El tiempo real, el bloqueo de edición de cursos, el
límite de peticiones y la cola que atiende las matrículas de otros sistemas viven en la memoria
del proceso: con varios, un aviso sólo llegaría a quien esté conectado al mismo proceso, dos
administradores podrían editar el mismo curso a la vez, el tope de intentos de acceso se
multiplicaría y una misma solicitud podría atenderse dos veces. Un proceso aguanta de sobra este uso
(medido: 60 personas a la vez, 375 peticiones por segundo, el 95 % por debajo de 280 ms).

## Variables de la API

| Variable                                           | Obligatoria    | Para qué                                                                               |
| -------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| `NODE_ENV`                                         | Sí             | `production`: lee la configuración del panel y oculta `/docs`                          |
| `DATABASE_URL`                                     | Sí             | `mysql://usuario:clave@127.0.0.1:3306/base`; codifica los especiales (`@` → `%40`)     |
| `JWT_SECRET`                                       | Sí             | 32 caracteres o más; la API no arranca con uno corto o de ejemplo                      |
| `STORAGE_DIR`                                      | Sí             | Carpeta de archivos, fuera de la aplicación                                            |
| `CORS_ORIGIN`                                      | Sí             | Dominio del cliente, exacto; varios separados por comas                                |
| `APP_URL`                                          | Sí             | Dominio del cliente, para los enlaces de los correos y de la API de integración        |
| `API_PUBLIC_URL`                                   | Sí             | Dominio de la API, para las imágenes de los correos                                    |
| `MAIL_FROM`                                        | Para el correo | Dirección remitente, de un dominio verificado en Brevo; sin ella no sale ningún correo |
| `MAIL_FROM_NAME`                                   | No             | Nombre del remitente (por defecto, «Campus Virtual»)                                   |
| `BREVO_API_KEY`                                    | Para el correo | Clave de la API HTTP de Brevo (puerto 443)                                             |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | No             | Sólo si no hay `BREVO_API_KEY`                                                         |
| `DATABASE_POOL_SIZE`                               | No             | Conexiones con la base (10 por defecto, 50 como mucho)                                 |
| `MAX_UPLOAD_MB`                                    | No             | Tope técnico de una subida (2048 por defecto, 4096 como mucho)                         |
| `UPLOAD_TMP_DIR`                                   | No             | Carpeta temporal de las subidas si `/tmp` es pequeño                                   |
| `STORAGE_SECRET`                                   | No             | Firma de las descargas; por defecto, `JWT_SECRET`                                      |
| `TRUST_PROXY`                                      | No             | No hace falta en cPanel: por defecto confía en el bucle local, por donde entra Apache  |

Reinicia la API después de cambiar cualquier variable: se leen al arrancar.

### Conexiones con la base de datos

La API abre como mucho 10 conexiones. En cPanel el usuario de base suele tener un cupo
(`SHOW VARIABLES LIKE 'max_user_connections';` en phpMyAdmin; `0` es sin límite) que comparten
phpMyAdmin y las copias. Si hay límite, deja al menos 3 libres con `DATABASE_POOL_SIZE`. Cada
consulta tiene 15 s como máximo y espera 10 s por una conexión libre
(`apps/api/src/prisma/pool-settings.ts`).

## Archivos subidos

Viven en `STORAGE_DIR`, fuera de la aplicación, para que un despliegue no los toque y entren en
la copia del directorio personal. La API crea al arrancar las subcarpetas:

| Carpeta                                          | Qué guarda                                   | Cómo se sirve                         |
| ------------------------------------------------ | -------------------------------------------- | ------------------------------------- |
| `logos`, `portadas`, `fondos`                    | Marca de cada sede y portadas de los cursos  | Sin firma                             |
| `avatars`                                        | Fotos de perfil                              | Sin firma                             |
| `entregas`, `certificados`, `firmas`, `recursos` | Lo que documenta a una persona y el material | Enlace firmado que caduca en una hora |
| `.tmp`                                           | Archivos a medio escribir                    | Nunca                                 |

Restaura siempre la base y esta carpeta **del mismo momento**. `GET /api/health` dice
`storage: ok` si la API puede escribir en ella.

Para subidas de más de 1 GB, Apache las corta antes de llegar a la API: añade
`LimitRequestBody 0` al `.htaccess` del subdominio de la API, fuera del bloque de cPanel. Si hay
ModSecurity o el proxy de Cloudflare delante del subdominio de la API, también limitan el
tamaño (en Cloudflare, ponlo en _DNS only_).

## Correo

En alojamiento compartido los puertos SMTP salientes suelen estar cerrados, así que el correo
sale por la API HTTP de Brevo:

1. En Brevo, verifica el dominio del remitente: da unos registros DNS (DKIM y DMARC) que se
   añaden en cPanel → _Zone Editor_. Sin ellos Brevo rechaza el envío o acaba en spam.
2. Crea una clave de API y ponla en `BREVO_API_KEY`. Es la única copia que hace falta: no la
   guardes en ningún archivo del servidor.
3. Pon en `MAIL_FROM` una dirección de ese dominio (por ejemplo,
   `no-reply@investigaciongipia.com`) y, si quieres, el nombre en `MAIL_FROM_NAME`.

Al arrancar, el registro de la API dice si el correo quedó activo y, si no, qué falta. Cada envío
fallido queda anotado con la respuesta de Brevo. Con `BREVO_API_KEY` vacía se usa SMTP
(`SMTP_HOST` y, si el servidor lo pide, `SMTP_USER` y `SMTP_PASS`); sin ninguno de los dos el
campus funciona, pero no sale ningún correo.

## Actualizaciones posteriores

```bash
# En tu equipo
npm run package:cpanel -- --api-url https://api-lms.investigaciongipia.com/api
```

Copia de la base, **Detener aplicación** en las dos, y en la Terminal:

```bash
cd ~/lms-pesv-project
find apps/api -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
rm -rf apps/client/prod
# subir lms-cpanel.zip a lms-pesv-project y extraerlo allí
source /home/investig/nodevenv/lms-pesv-project/apps/api/20/bin/activate && cd apps/api
npm install --include=dev
npx prisma generate
npx prisma db push      # sólo si cambió el esquema; nunca con --accept-data-loss sin leer qué pierde
npx prisma db seed      # añade los correos nuevos sin tocar los que ya existen
```

**Reiniciar** las dos aplicaciones. Despliega siempre las dos partes juntas: comparten rutas y
nombres de campos. Los archivos subidos no se tocan: viven en `/home/investig/lms-data/uploads`.

### Si el servidor ya tenía una versión posterior a julio

Esta actualización pide, además:

- **Remitente del correo**: `SMTP_FROM` y `SMTP_FROM_NAME` pasan a llamarse `MAIL_FROM` y
  `MAIL_FROM_NAME`. Créalas con el mismo valor y borra las antiguas.
- **`db push` con pérdida**: retira columnas que ya no se usan (`lms_cursos.fecha_inicio`,
  `fecha_fin` y `codigo_acceso`, `lms_modulos.requiere_anterior`, `lms_recursos.obligatorio` y
  `tiempo_lectura`, `lms_plantillas_correo.es_sistema`). Si lo que enumera es eso, ejecuta
  `npx prisma db push --accept-data-loss`. Además amplía, sin perder nada, columnas que se
  quedaban cortas (el contenido de las lecciones, los textos legales, las plantillas de correo,
  el mensaje de bienvenida, el motivo de rechazo, la URL de referencia, el nombre del titular de
  los certificados y el título de los avisos), añade a los cursos la fecha de su primera
  publicación y un índice a los avisos.
- **Integración con otros sistemas**: `db push` crea `lms_clientes_integracion`,
  `lms_matriculas_externas` y la columna `lms_cursos.codigo_integracion`, y avisa de que
  añadirá una restricción única sobre `[pais,codigo_integracion]` («_If there are existing
  duplicate values, this will fail_»). La columna es nueva y está vacía: no puede fallar ni
  perder nada. Si es lo único que enumera, además de lo anterior, ejecuta
  `npx prisma db push --accept-data-loss`. Después, `npx prisma db seed` añade el correo
  _Curso solicitado no disponible_.

## Problemas frecuentes

| Síntoma                                                                      | Causa                                                             | Solución                                                                             |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| La API no arranca y el registro dice `JWT_SECRET`                            | Secreto ausente o de menos de 32 caracteres                       | Genera uno de 64 y reinicia                                                          |
| La API no arranca y el registro menciona `@prisma/client` o `.prisma/client` | Falta generar el cliente de la base                               | `npx prisma generate` en `apps/api` y reinicia                                       |
| `migrar.js` dice «Falta DATABASE_URL»                                        | La Terminal no ve las variables de la aplicación                  | Defínela como en el paso 7.2                                                         |
| `db push` se detiene con `errno: 121 "Duplicate key on write or update"`     | MariaDB rechaza recrear una clave ajena con el mismo nombre       | Ejecuta `npx prisma db push --accept-data-loss` otra vez hasta que diga «in sync»    |
| `db push` no puede crear `lms_contacto_chat_curso_guid_fkey`                 | Quedan contactos de chat de cursos ya borrados                    | En phpMyAdmin, la consulta de debajo de esta tabla; repite `db push`                 |
| `npm install` se queja de la carpeta `node_modules`                          | Se borró el enlace que crea cPanel                                | Pulsa **Ejecutar NPM Install** en _Setup Node.js App_ y repite `npx prisma generate` |
| No sale ningún correo                                                        | Falta `MAIL_FROM` o `BREVO_API_KEY`, o Brevo rechaza el remitente | El registro de la API dice cuál; ver _Correo_                                        |
| «No hay conexión con el servidor» al entrar                                  | El cliente no llega a la API                                      | Comprueba `/api/health` y que el paquete se generó con el `--api-url` correcto       |
| El navegador bloquea las peticiones por CORS                                 | `CORS_ORIGIN` no coincide con el dominio del cliente              | Ponlo exacto, con `https://` y sin barra final                                       |
| Las imágenes no salen en los correos                                         | Falta `API_PUBLIC_URL`                                            | Defínela y reinicia                                                                  |
| `/api/health` dice `storage: error`                                          | `STORAGE_DIR` no existe, no es de la cuenta o el disco está lleno | Revisa la ruta y el espacio; el registro de arranque dice qué falló                  |
| Una imagen o un PDF antiguo no se ve                                         | El archivo no estaba en el origen al ejecutar `archivos`          | `comprobar` lista los que faltan; búscalos en la copia y repite `archivos`           |
| `max_user_connections` o `Too many connections` en el registro               | La API y otras herramientas superan el cupo del usuario de base   | Baja `DATABASE_POOL_SIZE` y reinicia                                                 |
| Los certificados salen sin logotipo                                          | El logotipo de la sede no es PNG ni JPG                           | Panel → _Tema y apariencia_: súbelo en PNG o JPG                                     |
| Un alumno no puede entrar                                                    | Está en la sede equivocada                                        | Que cambie de sede con el selector de la pantalla de acceso                          |

Contactos de chat sin curso:

```sql
DELETE c FROM lms_contacto_chat c
LEFT JOIN lms_cursos cu ON cu.guid = c.curso_guid
WHERE cu.guid IS NULL;
```
