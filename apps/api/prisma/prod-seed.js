// ══════════════════════════════════════════════════════════
// Production Seed — Creates admin + default config if DB is empty
// Runs on every startup, safe to re-run (checks before inserting)
// ══════════════════════════════════════════════════════════
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');

async function seed() {
  const adapter = new PrismaPg(process.env.DATABASE_URL);
  const prisma = new PrismaClient({ adapter });

  try {
    // ── 1. Create default config if not exists ──
    const configExists = await prisma.lms_configuracion.findUnique({ where: { id: 1 } });
    if (!configExists) {
      await prisma.lms_configuracion.create({ data: { id: 1 } });
      console.log('⚙️  Default platform configuration created.');
    }

    // ── 2. Create admin if no users exist ──
    const userCount = await prisma.usuarios.count();
    if (userCount > 0) {
      console.log('✅ Database already has users, skipping admin seed.');
      return;
    }

    const adminPassword = await bcrypt.hash('admin123', 10);
    await prisma.usuarios.create({
      data: {
        email: 'admin@pesv.com',
        contrasena: adminPassword,
        nombre: 'Administrador',
        apellido: 'Principal',
        rol: 'ADMINISTRADOR',
        usa_clave_defecto: true,
      },
    });

    // ── 3. Create examiner ──
    const examPassword = await bcrypt.hash('exam123', 10);
    await prisma.usuarios.create({
      data: {
        email: 'examinador@pesv.com',
        contrasena: examPassword,
        nombre: 'Supervisor',
        apellido: 'PESV',
        rol: 'PROFESOR',
        usa_clave_defecto: true,
      },
    });

    console.log('');
    console.log('🌱 ════════════════════════════════════════');
    console.log('   SEED COMPLETADO — Credenciales iniciales');
    console.log('   ────────────────────────────────────────');
    console.log('   👤 Admin:     admin@pesv.com / admin123');
    console.log('   👤 Examiner:  examinador@pesv.com / exam123');
    console.log('   ────────────────────────────────────────');
    console.log('   ⚠️  Cambia las contraseñas después del primer login');
    console.log('🌱 ════════════════════════════════════════');
    console.log('');
  } catch (err) {
    console.error('⚠️  Seed error (non-fatal):', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
