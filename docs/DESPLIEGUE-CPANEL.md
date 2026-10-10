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

| Aspecto                   | Qué mirar                                                         | Si falla                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Búfer de Apache           | Los avisos llegan en el momento, no de golpe al cabo de un minuto | La API ya envía `X-Accel-Buffering: no` y `Cache-Control: no-transform`. Si aun así se agrupan, pide que desactiven `mod_deflate` para `text/event-stream`   |
| Tiempo máximo de conexión | El flujo aguanta abierto más de 30 s                              | La API manda un latido cada 25 s para evitar el cierre por inactividad; el cliente reconecta solo si se corta                                                |
| Un solo proceso           | Cada pestaña abierta mantiene una conexión                        | Deja la API en **un proceso**; ver el apartado siguiente. Un proceso Node aguanta miles de conexiones abiertas, porque una conexión en espera no consume CPU |

Si el alojamiento cortara el flujo de forma agresiva, la aplicación **sigue funcionando**:
el tiempo real se degrada y los datos se refrescan al navegar, pero nada se rompe.

---

## 2. Requisitos

- Node.js 20.19+, 22.12+ o 24+ (cPanel → _Setup Node.js App_); es lo que exige Prisma 7
- MariaDB 10.6 o superior (cPanel → _MySQL Databases_)
- Dos subdominios: uno para el cliente y otro para la API

Ejemplo:

| Parte             | Subdominio                  | Puerto interno |
| ----------------- | --------------------------- | -------------- |
| Cliente (Next.js) | `campus.tu-dominio.com`     | 3100           |
| API (NestJS)      | `api-campus.tu-dominio.com` | 3200           |

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

4. Fija el cotejamiento por defecto de la base. En phpMyAdmin, con la base elegida, pestaña
   **SQL**:

```sql
ALTER DATABASE usuario_lms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Prisma crea cada tabla con `utf8mb4_unicode_ci`, pero MariaDB 11 usa por defecto
`utf8mb4_uca1400_ai_ci`. Una tabla creada fuera de Prisma —una importación, una copia, una
tabla auxiliar hecha a mano— heredaría el de la base, y la primera consulta que la cruce con
las de la aplicación falla con «Illegal mix of collations». Por lo mismo, **toda la
estructura se cambia con Prisma** (`npx prisma db push`), nunca con `CREATE`/`ALTER TABLE` a
mano.

---

## 4. Preparar los artefactos

En tu equipo, no en el servidor:

```bash
npm run init
npm run build
```

Esto deja:

- `apps/api/dist` — la API compilada
- `apps/client/prod` — el cliente en modo _standalone_, con todo lo que necesita

Sube al servidor, por cada aplicación:

**API** (`~/lms-api`), desde `apps/api`:

```
dist/   prisma/   prisma.config.ts   package.json   package-lock.json
```

**Cliente** (`~/lms-client`): el contenido de `apps/client/prod`. Ya incluye sus
dependencias; no hay que instalar nada.

Las dependencias de la API se instalan en el servidor, desde el terminal de cPanel y dentro
de `~/lms-api` (con el entorno de Node de la aplicación activado, como indica el propio
panel):

```bash
npm ci
npx prisma generate
```

`npm ci` instala también las herramientas de Prisma, que hacen falta para generar el
cliente de base de datos, crear las tablas y sembrar los datos iniciales. Por eso no se usa
`--omit=dev`.

---

## 5. Configurar las aplicaciones Node

cPanel → **Setup Node.js App** → _Create Application_, una por cada parte.

### API

| Campo                    | Valor                       |
| ------------------------ | --------------------------- |
| Application root         | `lms-api`                   |
| Application URL          | `api-campus.tu-dominio.com` |
| Application startup file | `dist/main.js`              |
| Node.js version          | 20+                         |
| Environment              | Production                  |

Variables de entorno (botón _Add Variable_):

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

Opcional: `DATABASE_POOL_SIZE` (ver _Conexiones con la base de datos_, más abajo).

Genera el secreto con:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

La API **no arranca** si `JWT_SECRET` falta, es corto o es uno de los valores de ejemplo.
Es deliberado: con un secreto adivinable, cualquiera puede fabricarse un token de
administrador.

`NODE_ENV=production` no es opcional aunque el desplegable _Environment_ ya diga
_Production_: es lo que hace que la API lea estas variables en vez de buscar un `.env`, y
lo que mantiene la documentación interna (`/docs`) fuera de internet.

No hace falta declarar `TRUST_PROXY`: por defecto la API confía en el bucle local, que es
por donde entra Apache, y así cuenta las peticiones **por visitante**. Sólo tendrías que
tocarlo si algún día pones otro proxy delante, y sólo con direcciones propias.

### La API corre en un solo proceso

No subas el número de procesos de la API en cPanel, aunque haya mucha gente conectada.
Tres cosas viven en la memoria del proceso y dejarían de funcionar bien si hubiera varios:

- **El tiempo real.** Un aviso sólo llega a quien esté conectado al mismo proceso que lo
  emite: con dos procesos, la mitad de la gente no se entera de una calificación o de que un
  curso entró en mantenimiento.
- **El bloqueo de edición de cursos.** Dos administradores en procesos distintos podrían
  editar el mismo curso a la vez sin verse.
- **El límite de peticiones.** Cada proceso cuenta por su lado, así que el tope de 5
  intentos por minuto sobre una misma cuenta se convertiría en 5 por cada proceso.

Las sesiones no dependen de esto: qué token vale lo decide la base de datos, así que cerrar
sesión o cambiar la contraseña corta el acceso en la siguiente petición en cualquier caso.

Un proceso basta de sobra para este uso. Medido con 60 personas navegando a la vez: 375
peticiones por segundo, sin fallos y con el 95 % de las respuestas por debajo de 280 ms. Si
algún día hiciera falta más, el camino es un servidor mayor, no más procesos: repartir la
carga exigiría llevar esas tres piezas a un servicio compartido (por ejemplo Redis), y un
alojamiento cPanel normalmente no lo ofrece.

### Conexiones con la base de datos

La API abre como mucho **10 conexiones** simultáneas con MariaDB y las reutiliza. En cPanel
el número de conexiones por usuario de base suele estar limitado (`max_user_connections`), y
ese cupo lo comparten phpMyAdmin, las copias de seguridad y el terminal. Para verlo, en
phpMyAdmin → **SQL**:

```sql
SHOW VARIABLES LIKE 'max_user_connections';
```

`0` significa que no hay límite por usuario. Si hay uno, deja al menos 3 libres: con un
límite de 10, define `DATABASE_POOL_SIZE=7` en las variables de la API y reiníciala. Más de
10 rara vez ayuda: las consultas sólo competirían por la misma CPU del servidor de base. El
máximo admitido es 50.

El resto de límites va fijo en el código (`apps/api/src/prisma/pool-settings.ts`):

| Límite                          | Valor | Para qué                                                                                          |
| ------------------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| Duración máxima de una consulta | 15 s  | Una consulta desbocada no retiene una conexión: MariaDB la corta (error 1969) y la petición falla |
| Espera por una conexión libre   | 10 s  | Si todas están ocupadas, la petición falla en vez de quedarse colgada                             |
| Conexiones ociosas conservadas  | 2     | Las demás se cierran tras 50 s sin uso, antes del `wait_timeout` de algunos alojamientos          |

La duración máxima se aplica con `max_statement_time`, que sólo tiene MariaDB: por eso el
requisito es MariaDB y no MySQL.

### Cliente

| Campo                    | Valor                   |
| ------------------------ | ----------------------- |
| Application root         | `lms-client`            |
| Application URL          | `campus.tu-dominio.com` |
| Application startup file | `server.js`             |
| Environment              | Production              |

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
npx prisma db seed
```

`db push` crea el esquema. La semilla crea **un administrador por sede** y las plantillas
de correo, e imprime las contraseñas **una sola vez**: anótalas antes de cerrar el
terminal.

Se puede ejecutar en producción sin miedo: **no pisa nada**. Un administrador que ya exista
se deja intacto —ni su contraseña ni su rol— y una plantilla ya creada se respeta aunque se
haya editado desde el panel. Volver a ejecutarla no duplica nada.

La configuración de cada sede (marca, textos, contacto) la crea la propia API al arrancar,
así que no hay que sembrarla.

---

## 7. Comprobaciones

```bash
curl https://api-campus.tu-dominio.com/api/health
```

Debe responder `"status": "healthy"` y `database.status: "ok"`.

Después, en el navegador:

1. `https://campus.tu-dominio.com` carga la portada con la marca de la sede de Colombia.
2. Al cambiar de sede con el selector de la cabecera, la marca pasa a la de México.
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

La aplicación **no borra archivos por su cuenta**: sólo cuando alguien elimina o sustituye
desde el panel aquello a lo que pertenecen. Las entregas conservan su archivo después del
certificado, así que el almacenamiento crece con el uso; tenlo en cuenta al dimensionarlo.

### Tamaño máximo de los archivos

| Qué se sube                                                                                   | Dónde se fija el límite                                                               |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Entrega de una tarea                                                                          | Constructor → la tarea → _Peso máximo estudiante (MB)_. Vacío: el general de la sede  |
| Material que adjuntan los docentes                                                            | Panel → _Tema y apariencia → Subida de archivos_ (general de la sede; 10 MB de serie) |
| Logotipo, favicon, portadas, fotos de perfil (5 MB), fondo del acceso (10 MB) y firmas (2 MB) | Fijo                                                                                  |

Ningún límite puede superar el **tope técnico**, la variable opcional `MAX_UPLOAD_MB` de la
API: 2048 (2 GB) si no se define, 5000 como mucho. El alumno ve el tamaño máximo antes de
elegir el archivo, y lo que lo supere se rechaza con un mensaje que dice el límite.

Para que un archivo grande llegue a la API, **lo que hay delante tiene que dejarlo pasar**:

- **Apache (`LimitRequestBody`).** Desde Apache 2.4.54 corta por defecto en 1 GiB. Para
  admitir más, añade esta línea al `.htaccess` de la carpeta del subdominio de la API (el
  que _Setup Node.js App_ rellena con su configuración de Passenger), fuera del bloque que
  gestiona cPanel:

  ```
  LimitRequestBody 0
  ```

  `0` quita el límite de Apache; el de la plataforma lo sigue aplicando la API. No sirve
  poner `2147483648`: el máximo que Apache acepta es 2147483647, algo menos de lo que ocupa
  un archivo de 2 GB con su envoltorio. Si el `.htaccess` no lo admite, pídelo al hosting
  para ese subdominio.

- **ModSecurity**, si el alojamiento lo tiene activo: su `SecRequestBodyLimit` también
  corta las subidas. Pide que lo suban para el subdominio de la API o que desactiven
  ModSecurity en él (cPanel → _ModSecurity_).
- **Cloudflare u otro proxy delante.** Con el proxy de Cloudflare (nube naranja) en los
  planes Free y Pro no pasa nada de más de 100 MB, y la respuesta tiene que llegar en 100 s
  (error 524). Pon el subdominio de la API en _DNS only_ (nube gris). Con R2, la API tarda
  además en reenviar el archivo al bucket antes de responder: con 1–2 GB, varios minutos.
- **Espacio temporal.** Cada archivo se escribe en un temporal mientras llega (y Passenger
  puede guardar otra copia antes de pasárselo a la API). El de la API va a `/tmp`, que en
  algunos alojamientos es pequeño: con archivos grandes define `UPLOAD_TMP_DIR` con una
  carpeta de la cuenta, por ejemplo `/home/usuario/lms-tmp`. Los temporales se borran al
  terminar cada subida, también si se rechaza o se corta.

La API no pone tiempo máximo a una subida y el navegador sólo la cancela si deja de avanzar
durante dos minutos. El `Timeout` de Apache cuenta la inactividad, no la duración total, así
que una conexión lenta pero constante no se corta.

Tras cambiar `MAX_UPLOAD_MB` o `UPLOAD_TMP_DIR`, reinicia la API. Comprueba el resultado
con una tarea de límite alto y un archivo algo mayor de 1 GB.

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

# Sube dist/, prisma/, prisma.config.ts, package.json y package-lock.json (API)
# y el contenido de prod/ (cliente). Después, en el terminal de cPanel (~/lms-api):
npm ci                 # sólo si cambiaron las dependencias
npx prisma generate
npx prisma db push     # sólo si cambió el esquema

# cPanel → Setup Node.js App → Restart, en las dos aplicaciones
```

Reinicia siempre la API después de cambiar una variable de entorno: se leen al arrancar.

**Despliega siempre las dos partes juntas.** El cliente y la API comparten las rutas y los
nombres de los campos; un cliente de una versión contra la API de otra deja pantallas sin
datos.

### Al actualizar a la versión con límites por usuario y correos sólo en ASCII

- **Índices nuevos.** Hay dos, sobre el archivo de las entregas y de las entregas
  archivadas: aceleran la limpieza de archivos sustituidos. `npx prisma db push` los crea sin
  tocar ningún dato.
- **Los correos de las cuentas sólo admiten caracteres ASCII.** La base compara los correos
  sin distinguir tildes, y un correo con ellas podía usarse para pedir cosas en nombre de
  otra cuenta. Antes de actualizar, comprueba que ninguna cuenta tenga uno, porque ya no
  podría entrar:

  ```sql
  SELECT email FROM usuarios WHERE email REGEXP '[^ -~]';
  ```

  Si aparece alguno, cámbialo en la base por su forma ASCII (los dominios internacionales
  se escriben `xn--…`): `UPDATE usuarios SET email = '…' WHERE email = '…';`. La interfaz
  no permite cambiar el correo de una cuenta.
- **SMTP sin usuario.** `SMTP_HOST` basta para un relé que no pide autenticación;
  `SMTP_USER` y `SMTP_PASS` sólo hacen falta si el servidor los exige, como Brevo.

### Al actualizar a la versión con el código en inglés

Esta versión renombró el código, las rutas de la API y las páginas del cliente al inglés.
Las tablas, columnas y valores existentes conservan su nombre. Los cambios de la base son
estos:

- **Columnas nuevas** para la prueba de la autorización de datos (`usuarios` y
  `lms_solicitudes_acceso`) y para identificar al responsable del tratamiento
  (`lms_configuracion`).
- **Un índice** en `lms_progreso_recurso(recurso_guid, usuario_guid)` que acelera el
  monitoreo.
- **Columnas retiradas** de `lms_configuracion` que nada usaba: `contrasena_defecto` (la
  contraseña temporal compartida, sustituida por una aleatoria por cuenta), `idioma`,
  `email_remitente`, `email_nombre` y `bienvenida_html`.
- **La columna `usuarios.activo`** y su índice: se retiró la función de activar y desactivar
  cuentas, y ninguna cuenta estaba desactivada.
- **Dos columnas nuevas en `lms_matriculas`**: `fecha_finalizacion` (cuándo se certificó la
  vuelta actual; nula mientras el curso está en curso) y `recursos_completados` (recuento
  del avance que usa el monitoreo). Con ellas, quien ya se certificó deja de recibir el
  recordatorio «Tienes formación pendiente» y los paneles dejan de recorrer toda la historia.
- **Índices**: nuevos en `lms_matriculas(curso_guid, activa, fecha_finalizacion)`,
  `lms_notificaciones(usuario_guid, tipo, created_at)`, `lms_entregas(fecha_entrega)` y
  `lms_entregas(estado, usuario_guid, calificacion)`; ampliados
  `lms_entregas(tarea_guid, usuario_guid)` → `(tarea_guid, usuario_guid, estado, calificacion)`
  y `lms_sesion_activa(usuario_guid, curso_guid)` → `(usuario_guid, curso_guid, fin_sesion)`;
  retirado `lms_certificados(usuario_guid)`, que la restricción única ya cubre.
- **Certificados que sobreviven a la cuenta**: `lms_certificados.usuario_guid` admite nulo,
  la nueva columna `nombre_titular` guarda el nombre con que se emitió y `pais`, la sede que
  lo emitió. Si se borra la cuenta del alumno, su certificado sigue verificándose con ese
  nombre y esa sede.
- **Plantillas de correo por sede**: `lms_plantillas_correo.pais`. Cada sede edita las suyas.
- **Tablas nuevas**: `lms_versiones_legales` (los textos legales que aceptó cada persona),
  `lms_entregas_archivadas` (las entregas de una vuelta ya certificada cuando el alumno
  vuelve a matricularse) y `lms_archivos` (quién subió cada archivo).
- **`lms_recursos.quiz_config`** pasa a `MEDIUMTEXT`: un cuestionario largo no cabía en
  `TEXT`. **`lms_cursos.emite_certificado`** se retira: nunca tuvo efecto.

Pasos, en este orden:

1. **Preparar los datos que el esquema nuevo exige**, en MariaDB y antes del `db push`
   (el `db push` no puede añadir una columna obligatoria a una tabla con filas):

   ```sql
   -- Nombre del titular de cada certificado, tomado de su cuenta.
   ALTER TABLE lms_certificados ADD COLUMN nombre_titular VARCHAR(191) NOT NULL DEFAULT '';
   UPDATE lms_certificados ce JOIN usuarios u ON u.guid = ce.usuario_guid
   SET ce.nombre_titular = CONCAT(u.nombre, ' ', u.apellido);

   -- Sede que emitió cada certificado, tomada de la cuenta o, si ya no existe, del curso.
   ALTER TABLE lms_certificados
     ADD COLUMN pais ENUM('COLOMBIA', 'MEXICO') NOT NULL DEFAULT 'COLOMBIA';
   UPDATE lms_certificados ce
   LEFT JOIN usuarios u ON u.guid = ce.usuario_guid
   LEFT JOIN lms_cursos cu ON cu.guid = ce.curso_guid
   SET ce.pais = COALESCE(u.pais, cu.pais, ce.pais);

   -- Las plantillas existentes pasan a ser las de Colombia y se copian para México.
   ALTER TABLE lms_plantillas_correo
     ADD COLUMN pais ENUM('COLOMBIA', 'MEXICO') NOT NULL DEFAULT 'COLOMBIA';
   INSERT INTO lms_plantillas_correo
     (evento_id, pais, nombre_interno, asunto, cuerpo_html, activo, es_sistema, created_at, updated_at)
   SELECT evento_id, 'MEXICO', nombre_interno, asunto, cuerpo_html, activo, es_sistema, NOW(3), NOW(3)
   FROM lms_plantillas_correo WHERE pais = 'COLOMBIA';
   ```

   El `db push` del paso siguiente retira después esos valores por defecto provisionales.

2. **Aplicar el esquema.** Como se retiran columnas, Prisma pide confirmarlo expresamente:

   ```bash
   npx prisma db push --accept-data-loss
   ```

   Lo único que se pierde es el contenido de esas cinco columnas de configuración, de
   `usuarios.activo` (que valía `1` en todas las cuentas) y de `lms_cursos.emite_certificado`.

3. **Rellenar las columnas nuevas de `lms_matriculas`**, en MariaDB, justo después del
   `db push` y antes de reiniciar la API. Sin este paso, todas las matrículas figurarían en
   curso —los ya certificados seguirían recibiendo recordatorios— y el monitoreo vería a
   todos en el 0 %.

   ```sql
   -- Matrículas cuya vuelta actual ya se certificó. La vuelta empieza en fecha_matricula,
   -- que se renueva al volver a matricular: un certificado anterior a esa fecha es de la
   -- vuelta pasada y la matrícula sigue en curso.
   UPDATE lms_matriculas m
   JOIN (SELECT usuario_guid, curso_guid, MAX(fecha_completado) AS fecha
         FROM lms_certificados
         WHERE curso_guid IS NOT NULL
         GROUP BY usuario_guid, curso_guid) c
     ON c.usuario_guid = m.usuario_guid AND c.curso_guid = m.curso_guid
   SET m.fecha_finalizacion = c.fecha
   WHERE m.fecha_finalizacion IS NULL AND c.fecha >= m.fecha_matricula;

   -- Recursos completados de cada matrícula.
   UPDATE lms_matriculas m
   SET m.recursos_completados = (
     SELECT COUNT(*)
     FROM lms_progreso_recurso p
     JOIN lms_recursos r ON r.guid = p.recurso_guid
     JOIN lms_modulos mo ON mo.guid = r.modulo_guid
     WHERE p.usuario_guid = m.usuario_guid AND mo.curso_guid = m.curso_guid
   );
   ```

   Se pueden repetir sin daño. A partir de aquí la API los mantiene sola: el certificado
   cierra la matrícula, volver a matricular la reabre y una tarea nocturna (3:15, hora de
   Colombia) reconcilia el recuento de las matrículas en curso.

4. **Retirar los índices que otros hacen redundantes.** El `db push` no los quita solo
   porque respaldan una clave ajena, aunque otro índice que empieza por la misma columna ya
   la cubre:

   ```sql
   DROP INDEX lms_progreso_recurso_recurso_guid_idx ON lms_progreso_recurso;
   DROP INDEX lms_certificados_usuario_guid_idx ON lms_certificados;
   ```

5. **Actualizar los correos.** En `~/lms-api`, ejecutar la semilla:

   ```bash
   npx prisma db seed
   ```

   Crea en las dos sedes los eventos de correo nuevos (por ejemplo `SOLICITUD_RECHAZADA`,
   el aviso de solicitud no aprobada) y pone al día las variables de los existentes. No
   toca las plantillas que ya están guardadas, editadas o no.

   Para que los correos de calificación ya guardados muestren el comentario del
   examinador, en MariaDB:

   ```sql
   UPDATE lms_plantillas_correo p JOIN lms_eventos_correo e ON e.id = p.evento_id
   SET p.cuerpo_html = REPLACE(p.cuerpo_html, '{{mensaje_aprobacion}}', '{{mensaje_aprobacion}}\n{{comentario}}')
   WHERE e.identificador = 'CALIFICACION_RECIBIDA' AND p.cuerpo_html NOT LIKE '%{{comentario}}%';
   ```

   Se puede repetir sin daño. La plantilla de bienvenida ya guardada (`USUARIO_APROBADO`)
   tampoco recibe sola la variable nueva `{{sede}}`: el administrador de cada sede puede
   añadirla desde _Plantillas de correo_ o copiar el texto de serie, que está en
   `apps/api/prisma/email-templates.ts`.

Después de actualizar:

- **Cada persona acepta la política de datos al entrar**, porque ninguna cuenta tiene aún
  registrada esa autorización. Queda guardada la fecha y la versión como prueba.
- **El administrador de cada sede completa el responsable del tratamiento** en _Portada
  pública → Textos legales_ (razón social, NIT o RFC, domicilio y correo para ejercer los
  derechos). Mientras falten, la página legal usa el nombre de la plataforma y el contacto
  de la portada.

- **Nadie pierde la sesión.** El rol y la sede de cada petición se leen de la base, no del
  token.
- **Los enlaces antiguos siguen funcionando.** Las páginas en español (`/cursos/…`,
  `/verificar?codigo=…`, `/dashboard/mensajes`, etc.) redirigen de forma permanente a las
  nuevas, de modo que los correos ya enviados y las notificaciones guardadas no se rompen.
- **La sede elegida en la portada vuelve una vez a Colombia** en cada navegador, porque la
  preferencia se guarda con otro nombre. Quien entre con su cuenta ve su sede igualmente.

### Al actualizar desde una versión anterior a las claves ajenas del chat

Esta versión añade claves ajenas que faltaban en dos tablas —contactos de chat y
conversaciones vaciadas—, de modo que lo de cada persona desaparezca con ella. Si la instalación viene de antes, puede tener filas apuntando a usuarios ya
borrados, y la base **rechazará la restricción** mientras queden:

```
Error: Cannot add or update a child row: a foreign key constraint fails
```

Antes del `db push`, retira esos restos:

```sql
DELETE t FROM lms_contacto_chat       t LEFT JOIN usuarios u ON u.guid = t.solicitante_guid WHERE u.guid IS NULL;
DELETE t FROM lms_contacto_chat       t LEFT JOIN usuarios u ON u.guid = t.receptor_guid    WHERE u.guid IS NULL;
DELETE t FROM lms_conversacion_oculta t LEFT JOIN usuarios u ON u.guid = t.usuario_guid     WHERE u.guid IS NULL;
DELETE t FROM lms_conversacion_oculta t LEFT JOIN usuarios u ON u.guid = t.contacto_guid    WHERE u.guid IS NULL;
```

Son filas que ya no se podían usar para nada: apuntan a cuentas inexistentes.

La tabla `lms_token_revocations` desaparece en esta versión: qué sesión vale lo dice ahora
la propia cuenta, y el `db push` la retira sola. Nadie pierde la sesión al actualizar.

---

## 11. Problemas frecuentes

| Síntoma                                                                                                                   | Causa                                                                                             | Solución                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| El registro dice `max_user_connections` o `Too many connections`                                                          | La API y otras herramientas superan el cupo de conexiones del usuario de base                     | Baja `DATABASE_POOL_SIZE` (apartado 5, _Conexiones con la base de datos_) y reinicia la API                                   |
| El registro dice `retrieve connection from pool timeout` o `max_statement_time exceeded`                                  | Consultas lentas que ocupan todas las conexiones                                                  | Busca en el registro qué ruta las lanza; no subas los límites sin saber cuál es                                               |
| La API no arranca y el registro dice `JWT_SECRET`                                                                         | Secreto ausente o demasiado corto                                                                 | Genera uno de 64 caracteres y reinicia                                                                                        |
| El navegador bloquea las peticiones por CORS                                                                              | `CORS_ORIGIN` no coincide con el dominio del cliente                                              | Ponlo exacto, con `https://` y sin barra final                                                                                |
| Las imágenes no cargan                                                                                                    | `API_PUBLIC_URL` sin definir                                                                      | Defínela y reinicia la API                                                                                                    |
| El tiempo real no conecta                                                                                                 | Proxy agrupando la respuesta                                                                      | Revisa el apartado 1                                                                                                          |
| Los certificados salen sin logotipo                                                                                       | El logotipo no está subido en esa sede                                                            | Panel → Tema y apariencia, en cada sede                                                                                       |
| Un alumno no puede entrar                                                                                                 | Está intentando acceder a la sede equivocada                                                      | Que cambie de sede con el selector de la portada o de la pantalla de acceso                                                   |
| `prisma db push` se detiene con `errno: 121 "Duplicate key on write or update"`                                           | Prisma intenta volver a crear una clave ajena que ya existe; los pasos anteriores sí se aplicaron | Ejecuta `npx prisma db push` otra vez: aplica lo que falta (también las claves ajenas). Comprueba al final que dice «in sync» |
| La API no arranca y el registro menciona `@prisma/client` o `.prisma/client`                                              | Falta generar el cliente de base de datos                                                         | `npx prisma generate` en `~/lms-api` y reinicia                                                                               |
| `npm run build` falla con «`<Html>` should not be imported outside of pages/\_document»                                   | Artefactos de una compilación anterior en `.next`                                                 | `pre-build.js` los retira antes de compilar; si aun así ocurre, borra `apps/client/.next` y repite                            |
| La compilación falla con «An error occurred in `next/font`»                                                               | La fuente se descarga de Google al compilar, y a veces limita las peticiones seguidas             | Repite la compilación al cabo de un minuto                                                                                    |
| El certificado acredita «1 hora»                                                                                          | El curso no declara su duración                                                                   | Constructor → el curso → _Duración del programa_                                                                              |
| Una subida grande falla con «El servidor rechazó el archivo por su tamaño antes de procesarlo» o con un error de conexión | Apache (`LimitRequestBody`), ModSecurity o un proxy la cortan antes de llegar a la API            | Apartado 8, _Tamaño máximo de los archivos_                                                                                   |
| Una subida grande falla con «Ha ocurrido un error interno» y el registro de la API dice `ENOSPC`                          | No queda espacio en la carpeta temporal                                                           | Define `UPLOAD_TMP_DIR` con una carpeta de la cuenta y reinicia la API                                                        |
