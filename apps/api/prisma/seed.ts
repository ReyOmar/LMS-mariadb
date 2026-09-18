import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PLANTILLAS_CORREO } from './plantillas-correo';

/**
 * Datos iniciales de la instalación.
 *
 * Crea lo imprescindible para poder entrar y operar:
 *  - Un administrador por sede, con contraseña aleatoria que se imprime una sola vez.
 *  - Las plantillas de correo del sistema.
 *
 * Es idempotente: volver a ejecutarlo no duplica nada ni pisa lo que ya se haya editado
 * desde el panel. La configuración de cada sede la crea la propia API al arrancar
 * (`ConfiguracionService.onModuleInit`), así que aquí no se toca.
 */

if (process.env.NODE_ENV === 'production') {
  console.error('La semilla no se ejecuta en producción. Crea el primer administrador con el script de alta.');
  process.exit(1);
}

const SEDES = [
  { pais: 'COLOMBIA' as const, email: 'admin.co@pesv.com', nombre: 'Administrador', apellido: 'Colombia' },
  { pais: 'MEXICO' as const, email: 'admin.mx@pesv.com', nombre: 'Administrador', apellido: 'México' },
];

/** Contraseña aleatoria legible: se muestra una vez y hay que cambiarla al entrar. */
function generarContrasena(): string {
  return `${crypto.randomBytes(6).toString('base64url')}1a`;
}

function crearCliente(): PrismaClient {
  const url = new URL(process.env.DATABASE_URL ?? '');
  const adapter = new PrismaMariaDb({
    host: url.hostname || '127.0.0.1',
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username) || 'root',
    password: decodeURIComponent(url.password) || '',
    database: url.pathname.replace(/^\//, '') || 'lms_db',
  });
  return new PrismaClient({ adapter });
}

const prisma = crearCliente();

async function sembrarAdministradores(): Promise<{ email: string; pais: string; contrasena: string }[]> {
  const credenciales: { email: string; pais: string; contrasena: string }[] = [];

  for (const sede of SEDES) {
    const existente = await prisma.usuarios.findUnique({ where: { email: sede.email }, select: { guid: true } });
    if (existente) {
      console.log(`· Administrador de ${sede.pais} ya existe (${sede.email}); no se modifica.`);
      continue;
    }

    const contrasena = generarContrasena();
    await prisma.usuarios.create({
      data: {
        email: sede.email,
        nombre: sede.nombre,
        apellido: sede.apellido,
        rol: 'ADMINISTRADOR',
        pais: sede.pais,
        contrasena: await bcrypt.hash(contrasena, 10),
        usa_clave_defecto: true,
      },
    });

    credenciales.push({ email: sede.email, pais: sede.pais, contrasena });
  }

  return credenciales;
}

async function sembrarPlantillasDeCorreo(): Promise<number> {
  let creadas = 0;

  for (const semilla of PLANTILLAS_CORREO) {
    const existente = await prisma.lms_eventos_correo.findUnique({
      where: { identificador: semilla.identificador },
      select: { id: true },
    });
    if (existente) continue;

    const evento = await prisma.lms_eventos_correo.create({
      data: {
        identificador: semilla.identificador,
        nombre_legible: semilla.nombre_legible,
        descripcion: semilla.descripcion,
        variables: semilla.variables,
      },
    });

    await prisma.lms_plantillas_correo.create({
      data: {
        evento_id: evento.id,
        nombre_interno: semilla.plantilla.nombre_interno,
        asunto: semilla.plantilla.asunto,
        cuerpo_html: semilla.plantilla.cuerpo_html,
        es_sistema: semilla.plantilla.es_sistema,
        activo: true,
      },
    });
    creadas++;
  }

  return creadas;
}

async function main(): Promise<void> {
  console.log('Sembrando datos iniciales...');

  const credenciales = await sembrarAdministradores();
  const plantillas = await sembrarPlantillasDeCorreo();

  console.log(`· Plantillas de correo creadas: ${plantillas}`);

  if (credenciales.length === 0) {
    console.log('\nNo se creó ninguna cuenta nueva.');
    return;
  }

  console.log('\n─── CREDENCIALES INICIALES ───');
  console.log('Anótalas ahora: no se pueden volver a consultar.');
  for (const credencial of credenciales) {
    console.log(`  ${credencial.pais.padEnd(9)} ${credencial.email}  ${credencial.contrasena}`);
  }
  console.log('Al entrar por primera vez el sistema pedirá cambiar la contraseña.\n');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
