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

Ver `apps/api/src/common/domain/pais.ts`.

### 2. Todo se califica sobre 100, y se aprueba con 80

Una sola definición de la escala, en `apps/api/src/common/domain/calificacion.ts` (y su
espejo en el cliente, `apps/client/src/lib/calificacion.ts`). Cada curso puede subir o bajar
su propio umbral en `nota_aprobacion`; el valor por defecto es 80.

Ninguna pantalla ni ningún servicio debe escribir la escala a mano.

### 3. La identidad la decide el servidor

Ningún endpoint acepta un identificador de usuario para decidir de quién son los datos: sale
del token. La propiedad de cursos, recursos y entregas se comprueba en
`CursoAccesoService`, en un solo sitio.

---

## Desarrollo

### Requisitos

- Node.js 20+
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

| Comando | Qué hace |
|---|---|
| `npm run dev` | API y cliente con recarga en caliente |
| `npm run build` | Compila ambos para producción |
| `npm run typecheck` | Comprobación de tipos de los dos proyectos |
| `npm test` | Pruebas de la API |
| `npm run db:push` | Sincroniza el esquema con la base de datos |
| `npm run db:seed` | Datos iniciales (idempotente) |

---

## Cómo funciona el tiempo real

Sobre **Server-Sent Events**, no WebSocket. El motivo está explicado en
[docs/DESPLIEGUE-CPANEL.md](docs/DESPLIEGUE-CPANEL.md#1-sobre-los-websockets-ya-no-hacen-falta):
en cPanel, Apache no propaga la cabecera `Upgrade` y la conexión WebSocket nunca llega a
establecerse.

El flujo es de servidor a cliente (`GET /api/realtime/stream`). Ningún evento cruza entre
sedes: todo envío exige un destino con país.

---

## Almacenamiento de archivos

Dos destinos posibles, con la misma clave (`carpeta/nombre`) en ambos:

- **Cloudflare R2**, si están definidas las variables `R2_*`.
- **Disco local** (`apps/api/uploads`) en caso contrario.

Y dos clases de archivo:

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

---

## Documentación

- **[docs/AUDITORIA.md](docs/AUDITORIA.md)** — hallazgos del análisis previo, con el
  identificador que referencian los commits.
- **[docs/DECISIONES.md](docs/DECISIONES.md)** — las decisiones de diseño y su porqué.
- **[docs/DESPLIEGUE-CPANEL.md](docs/DESPLIEGUE-CPANEL.md)** — puesta en producción.

Con `NODE_ENV` distinto de `production`, la API publica su documentación interactiva en
`/docs`.
