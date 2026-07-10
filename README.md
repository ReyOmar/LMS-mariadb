# 🎓 LMS PESV Education

Sistema de Gestión de Aprendizaje (LMS) para capacitación en Seguridad Vial (PESV).

## Arquitectura

```
apps/
├── api/          NestJS + Fastify + Prisma (PostgreSQL)
└── client/       Next.js 15 (React 19, TailwindCSS 4)
```

## Requisitos

- **Node.js** 20+
- **PostgreSQL** 15+ (local para desarrollo, Render para producción)

## Desarrollo Local

### 1. Configurar base de datos

Instala PostgreSQL localmente o usa Docker:

```bash
docker run -d --name lms-postgres \
  -e POSTGRES_USER=lms_user \
  -e POSTGRES_PASSWORD=lms_password \
  -e POSTGRES_DB=lms_db \
  -p 5432:5432 \
  postgres:16-alpine
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus valores (DATABASE_URL, JWT_SECRET, etc.)
```

Generar JWT_SECRET seguro:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Instalar y ejecutar

```bash
npm run init          # Instala dependencias + genera Prisma client
npm run db:push       # Crea las tablas en PostgreSQL
npm run db:seed       # Datos iniciales (usuarios, plantillas de correo)
npm run dev           # API (3200) + Client (3100) en paralelo
```

## Despliegue en Render (Free Tier)

### Opción A: Blueprint automático

1. Conecta tu repositorio en [Render Dashboard](https://dashboard.render.com)
2. Selecciona **Blueprint** y apunta al archivo `render.yaml`
3. Render creará automáticamente:
   - **PostgreSQL** gratuito (1GB)
   - **API** como Docker web service
   - **Client** como Docker web service
4. Configura las variables sensibles manualmente en el Dashboard:
   - `SMTP_PASS` (clave SMTP de Brevo)
   - `R2_*` (credenciales de Cloudflare R2, si usas almacenamiento cloud)

### Opción B: Deploy manual

1. Crea una base de datos PostgreSQL en Render (plan Free)
2. Crea un Web Service para la API:
   - **Docker**, apuntando a `apps/api/Dockerfile`
   - Variables de entorno: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `SMTP_*`
3. Crea un Web Service para el Client:
   - **Docker**, apuntando a `apps/client/Dockerfile`
   - Build arg: `NEXT_PUBLIC_API_URL=https://tu-api.onrender.com/api`

### Variables de Entorno Requeridas (API)

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Connection string de PostgreSQL |
| `JWT_SECRET` | Secret para tokens JWT (mín 16 chars) |
| `CORS_ORIGIN` | URL del frontend (sin trailing slash) |
| `APP_URL` | URL pública del frontend (para emails) |
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Login SMTP de Brevo |
| `SMTP_PASS` | Clave SMTP de Brevo |
| `SMTP_FROM` | Email remitente |

### Variables de Entorno Requeridas (Client)

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL pública de la API (build-time) |

## Limitaciones del Free Tier

- Los servicios se **duermen tras 15 min** de inactividad (primer request tarda ~30s)
- PostgreSQL tiene **1GB** de almacenamiento
- El almacenamiento local de archivos es **efímero** (se pierde al reiniciar)
  - Configura **Cloudflare R2** para almacenamiento persistente de archivos

## Scripts Disponibles

| Script | Descripción |
|---|---|
| `npm run dev` | Desarrollo: API + Client con hot reload |
| `npm run build` | Build de producción (API + Client) |
| `npm run start` | Inicia en modo producción |
| `npm run db:push` | Sincroniza schema con la base de datos |
| `npm run db:seed` | Datos iniciales |
| `npm run db:generate` | Regenera Prisma Client |
| `npm run typecheck` | Verificación de tipos TypeScript |
| `npm test` | Ejecuta tests (API) |

## Correos Electrónicos

El sistema usa **Brevo** (ex-Sendinblue) como servicio SMTP. Las plantillas de correo son editables desde el panel de administración del LMS.

Eventos de correo configurados:
- Recuperación de contraseña
- Bienvenida a usuario aprobado
- Calificación recibida
- Entrega rechazada
- Matrícula en curso
- Certificado generado
- Recordatorio de inactividad
- Y más...
