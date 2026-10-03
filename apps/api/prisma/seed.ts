import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { EMAIL_TEMPLATES } from './email-templates';

/**
 * Datos iniciales de la instalación.
 *
 * Crea lo imprescindible para poder entrar y operar:
 *  - Un administrador por sede, con contraseña aleatoria que se imprime una sola vez.
 *  - Las plantillas de correo del sistema.
 *
 * **Es idempotente y no pisa nada**: un administrador que ya exista no se toca —ni su
 * contraseña ni su rol— y una plantilla ya creada se deja como esté, incluso si se editó
 * desde el panel. Por eso puede ejecutarse también en producción, que es cuando de verdad
 * hace falta: es la forma de crear el primer administrador de una instalación nueva.
 *
 * La configuración de cada sede la crea la propia API al arrancar
 * (`SettingsService.onModuleInit`), así que aquí no se toca.
 *
 * No importa nada de `src/`: en el servidor sólo se suben `dist/` y `prisma/`, y la semilla
 * se ejecuta desde ahí.
 */

/** Rondas de bcrypt; las mismas que usa la API (`common/domain/password`). */
const BCRYPT_ROUNDS = 10;

const INITIAL_ADMINS = [
  { country: 'COLOMBIA' as const, email: 'admin.co@pesv.com', firstName: 'Administrador', lastName: 'Colombia' },
  { country: 'MEXICO' as const, email: 'admin.mx@pesv.com', firstName: 'Administrador', lastName: 'México' },
];

/** Contraseña aleatoria legible: se muestra una vez y hay que cambiarla al entrar. */
function generatePassword(): string {
  return `${crypto.randomBytes(6).toString('base64url')}1a`;
}

function createClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL.');
  }
  const url = new URL(process.env.DATABASE_URL);
  const adapter = new PrismaMariaDb({
    host: url.hostname || '127.0.0.1',
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username) || 'root',
    password: decodeURIComponent(url.password) || '',
    database: url.pathname.replace(/^\//, '') || 'lms_db',
  });
  return new PrismaClient({ adapter });
}

const prisma = createClient();

async function seedAdmins(): Promise<{ email: string; country: string; password: string }[]> {
  const credentials: { email: string; country: string; password: string }[] = [];

  for (const admin of INITIAL_ADMINS) {
    const existing = await prisma.user.findUnique({ where: { email: admin.email }, select: { guid: true } });
    if (existing) {
      console.log(`· Administrador de ${admin.country} ya existe (${admin.email}); no se modifica.`);
      continue;
    }

    const password = generatePassword();
    await prisma.user.create({
      data: {
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: 'ADMIN',
        country: admin.country,
        password: await bcrypt.hash(password, BCRYPT_ROUNDS),
        usesDefaultPassword: true,
      },
    });

    credentials.push({ email: admin.email, country: admin.country, password });
  }

  return credentials;
}

async function seedEmailTemplates(): Promise<number> {
  let created = 0;

  for (const seed of EMAIL_TEMPLATES) {
    const existing = await prisma.emailEvent.findUnique({ where: { key: seed.key }, select: { id: true } });
    if (existing) continue;

    await prisma.emailEvent.create({
      data: {
        key: seed.key,
        displayName: seed.displayName,
        description: seed.description,
        variables: seed.variables,
        templates: { create: { ...seed.template, active: true } },
      },
    });
    created++;
  }

  return created;
}

async function main(): Promise<void> {
  console.log('Sembrando datos iniciales...');

  const credentials = await seedAdmins();
  const templates = await seedEmailTemplates();

  console.log(`· Plantillas de correo creadas: ${templates}`);

  if (credentials.length === 0) {
    console.log('\nNo se creó ninguna cuenta nueva.');
    return;
  }

  console.log('\n─── CREDENCIALES INICIALES ───');
  console.log('Anótalas ahora: no se pueden volver a consultar.');
  for (const credential of credentials) {
    console.log(`  ${credential.country.padEnd(9)} ${credential.email}  ${credential.password}`);
  }
  console.log('Al entrar por primera vez el sistema pedirá cambiar la contraseña.\n');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
