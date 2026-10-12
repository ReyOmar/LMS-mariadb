# LMS PESV Education

Plataforma de capacitación y certificación en seguridad vial (Plan Estratégico de Seguridad
Vial), con dos sedes independientes: **Colombia** y **México**.

---

## Cómo está organizado

```
apps/
├── api/      NestJS 11 + Fastify + Prisma 7 + MariaDB
└── client/   Next.js 15 (React 19, Tailwind 4)
docs/
├── AUDITORIA.md           Estado del proyecto antes de la refactorización
├── DESPLIEGUE-CPANEL.md   Puesta en producción
└── DECISIONES.md          Por qué el sistema es como es
```

---

## Las tres reglas del sistema

Antes de tocar nada conviene conocerlas, porque explican buena parte del código.

### 1. Las sedes no se mezclan

Colombia y México son operaciones separadas. Un usuario pertenece a **una sola sede** y sus
cursos, alumnos, entregas, certificados, mensajes y textos legales sólo existen dentro de
ella.

El país viaja dentro del token de sesión y lo inyecta el guard en cada petición. **Ningún
controlador lo acepta del cliente**, salvo en las dos rutas públicas de la portada, donde
todavía no hay sesión. La única frontera por la que podrían cruzarse los datos es la
matrícula, y ahí se comprueba explícitamente que alumno y curso compartan sede.

Ver `apps/api/src/common/domain/country.ts`.

### 2. Todo se califica sobre 100, y se aprueba con 80

Una sola definición de la escala, en `apps/api/src/common/domain/grading.ts` (y su espejo
en el cliente, `apps/client/src/lib/grading.ts`). Cada curso puede subir o bajar su propio
umbral (`passingScore`); el valor por defecto es 80.

Ninguna pantalla ni ningún servicio debe escribir la escala a mano.

### 3. La identidad la decide el servidor

Ningún endpoint acepta un identificador de usuario para decidir de quién son los datos: sale
del token. La propiedad de cursos, recursos y entregas se comprueba en un solo sitio:
`CourseAccessService` (`apps/api/src/courses/course-access.service.ts`).

---

## Convenciones del código

- **El código está en inglés**: clases, funciones, variables, archivos, rutas de la API y
  campos JSON. **Lo que ve una persona está en español**: la interfaz, los mensajes de error
  de la API, los correos y los registros. Los pocos comentarios necesarios también.
- **La base de datos conserva sus nombres en español** (`usuarios`, `lms_cursos`,
  `nota_aprobacion`, valores como `ESTUDIANTE` o `CALIFICADA`). El esquema de Prisma los
  traduce con `@map`/`@@map`, así que el código sólo los ve en el SQL escrito a mano.
- **Algunos valores son datos y no se traducen**: identificadores de los eventos de correo
  (`NUEVA_ENTREGA`…), variables de las plantillas (`{{nombre}}`, `{{url_campus}}`…),
  carpetas del almacenamiento (`portadas/`, `entregas/`…) y el JSON guardado de los
  cuestionarios, que `apps/api/src/courses/quiz-config.ts` convierte al formato de la API.
- Las rutas antiguas del cliente (`/cursos/…`, `/dashboard/constructor-cursos`,
  `/verificar?codigo=…`) redirigen de forma permanente a las actuales: ver
  `apps/client/next.config.mjs`.

---

## Desarrollo

### Requisitos

- Node.js 20.19+, 22.12+ o 24+ (lo exige Prisma 7)
- MariaDB 10.6+ (o MySQL 8)

### Puesta en marcha

```bash
# 1. Base de datos local con Docker (opcional)
docker compose up -d

# 2. Configuración
cp .env.example .env
# Rellena DATABASE_URL y genera JWT_SECRET:
#   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 3. Dependencias y cliente de Prisma
npm run init

# 4. Esquema y datos iniciales
npm run db:push
npm run db:seed          # imprime las contraseñas una sola vez: anótalas

# 5. Arrancar
npm run dev              # API en :3200, cliente en :3100
```

La semilla crea un administrador por sede (`admin.co@pesv.com` y `admin.mx@pesv.com`) y las
plantillas de correo. La configuración de cada sede la crea la API al arrancar.

### Comandos

| Comando             | Qué hace                                                               |
| ------------------- | ---------------------------------------------------------------------- |
| `npm run dev`       | API y cliente con recarga en caliente                                  |
| `npm run build`     | Compila ambos para producción (el cliente queda en `apps/client/prod`) |
| `npm start`         | Arranca lo compilado, igual que en producción                          |
| `npm run typecheck` | Comprobación de tipos de los dos proyectos                             |
| `npm run lint`      | Análisis estático de los dos proyectos, sin avisos permitidos          |
| `npm test`          | Pruebas de la API y del cliente                                        |
| `npm run db:push`   | Sincroniza el esquema con la base de datos                             |
| `npm run db:seed`   | Datos iniciales (idempotente)                                          |

> **Para el `build`, primero para el `dev`.** Los dos escriben en `apps/client/.next`. Si
> compilas con el servidor de desarrollo levantado, éste se queda pidiendo piezas que la
> compilación acaba de sustituir y responde con errores 500 y pantallas en blanco. No se ha
> roto nada: para el `dev`, vuelve a arrancarlo y listo.

---

## Cómo funciona el tiempo real

Sobre **Server-Sent Events**, no WebSocket. El motivo está explicado en
[docs/DESPLIEGUE-CPANEL.md](docs/DESPLIEGUE-CPANEL.md#1-sobre-los-websockets-ya-no-hacen-falta):
en cPanel, Apache no propaga la cabecera `Upgrade` y la conexión WebSocket nunca llega a
establecerse.

El flujo es de servidor a cliente (`GET /api/realtime/stream`). Ningún evento cruza entre
sedes: todo envío exige un destino con país.

Las conexiones viven en la memoria del proceso, así que la API debe correr en **un solo
proceso**: ver [docs/DESPLIEGUE-CPANEL.md](docs/DESPLIEGUE-CPANEL.md#la-api-corre-en-un-solo-proceso).

---

## Cómo paginan los listados

Los listados que crecen con la sede —cuentas y matriculados de un curso— van **por marca**,
no por número de filas a saltar. Cada página devuelve un `cursor` opaco con la última fila
entregada, y pedir la siguiente es enviarlo de vuelta. Cuando vale `null` es que ya no
queda nada.

Con `OFFSET` la base lee y descarta todo lo anterior, así que cada página cuesta más que la
previa; con la marca el coste es plano. Medido sobre una sede de 20.000 cuentas: recorrerla
entera son 381 páginas de 17 ms de mediana, la última igual de rápida que la primera.

Dos cosas lo sostienen y no se pueden tocar por separado:

- Un **orden total**: fecha _y_ identificador. Sin el desempate, dos altas del mismo
  milisegundo pueden repetirse o perderse al pasar de página.
- Un **índice con ese mismo orden** (`usuarios(pais, rol, created_at)`). Sin él la base
  ordena la sede entera en cada página y da igual cómo se pagine.

Los recuentos (el total y las pestañas) sólo se calculan en la primera página, porque
recorren la sede completa; la pantalla los conserva mientras trae el resto.

El código común está en `apps/api/src/common/domain/pagination.ts`.

---

## Almacenamiento de archivos

Los archivos se guardan en el disco del servidor, bajo `STORAGE_DIR` y con la clave
`carpeta/nombre`. En producción esa carpeta vive fuera de la aplicación, para que los
despliegues no la toquen; sólo en desarrollo, si no se define, se usa `apps/api/uploads`.

Hay dos clases de archivo:

- **Públicos** (`logos/`, `portadas/`, `fondos/`, `avatars/`): material de marca, se sirven
  sin más.
- **Reservados** (`entregas/`, `certificados/`, `firmas/`, `recursos/`): sólo con una URL
  firmada que emite la API y caduca en una hora.

El cliente nunca construye una ruta de descarga reservada; la recibe ya firmada.

---

## Correo

Dos vías, por orden de preferencia:

1. **API HTTP de Brevo** (`BREVO_API_KEY`), por el puerto 443. Es la recomendada en
   alojamiento compartido, donde los puertos SMTP suelen estar cerrados.
2. **SMTP** (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`).

Sin ninguna de las dos, el sistema funciona igual pero no sale ningún correo: los envíos se
registran y se descartan.

Las plantillas se editan desde el panel de administración. La marca de cada correo (color,
logotipo, nombre) se toma de la configuración de la sede del destinatario.

### En producción se envía con Brevo. En desarrollo, a un buzón local

**En cPanel**: se define `BREVO_API_KEY` y el correo sale por ahí. Es lo único que hay que
configurar, y es lo que dice la guía de despliegue.

**En tu máquina**: `docker compose up -d` levanta, junto a la base de datos, un buzón de
pruebas (Mailpit) que **atrapa** todo lo que la API intenta enviar y lo enseña en
<http://localhost:8025>. No sale nada a internet.

No son dos formas de hacer lo mismo ni compiten entre sí: Brevo **envía** en producción y el
buzón **retiene** en desarrollo. Sirve para probar de verdad lo que depende del correo
—código de verificación, enlace de recuperación, alta con clave temporal— sin gastar cuota
de Brevo ni mandar mensajes de prueba a direcciones reales. El buzón vive sólo en
`docker-compose.yml`: no se despliega, no añade dependencias y no aparece en el código.

Para apuntar tu `.env` al buzón:

```
BREVO_API_KEY=""
SMTP_HOST="127.0.0.1"
SMTP_PORT="1025"
```

---

## Documentación

- **[docs/AUDITORIA.md](docs/AUDITORIA.md)** — hallazgos del análisis previo, con el
  identificador que referencian los commits.
- **[docs/DECISIONES.md](docs/DECISIONES.md)** — las decisiones de diseño y su porqué.
- **[docs/DESPLIEGUE-CPANEL.md](docs/DESPLIEGUE-CPANEL.md)** — puesta en producción.

Con `NODE_ENV` distinto de `production`, la API publica su documentación interactiva en
`/docs`.
