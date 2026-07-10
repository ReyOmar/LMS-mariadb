// ══════════════════════════════════════════════════════════
// Production Seed — Secure first-run setup
// Only runs when DB is empty (safe to re-run)
// ══════════════════════════════════════════════════════════
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Generate a cryptographically secure password (16 chars, URL-safe)
function generateSecurePassword() {
  return crypto.randomBytes(12).toString('base64url');
}

async function seed() {
  const adapter = new PrismaPg(process.env.DATABASE_URL);
  const prisma = new PrismaClient({ adapter });

  try {
    // ── 1. Ensure default platform config exists ──
    const configExists = await prisma.lms_configuracion.findUnique({ where: { id: 1 } });
    if (!configExists) {
      await prisma.lms_configuracion.create({ data: { id: 1 } });
      console.log('⚙️  Default platform configuration created.');
    }

    // ── 2. Create admin ONLY if no users exist ──
    const userCount = await prisma.usuarios.count();
    if (userCount > 0) {
      console.log('✅ Database already has users, skipping seed.');
      return;
    }

    // Generate secure random password (shown once in logs)
    const adminPassword = generateSecurePassword();
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    await prisma.usuarios.create({
      data: {
        email: 'admin@pesv.com',
        contrasena: hashedPassword,
        nombre: 'Administrador',
        apellido: 'Principal',
        rol: 'ADMINISTRADOR',
        usa_clave_defecto: true, // Forces password change on first login
      },
    });

    console.log('');
    console.log('🔐 ════════════════════════════════════════════════');
    console.log('   PRIMER INICIO — Credenciales de administrador');
    console.log('   ──────────────────────────────────────────────');
    console.log(`   📧 Email:      admin@pesv.com`);
    console.log(`   🔑 Contraseña: ${adminPassword}`);
    console.log('   ──────────────────────────────────────────────');
    console.log('   ⚠️  GUARDA esta contraseña — se genera UNA VEZ');
    console.log('   ⚠️  Se te pedirá cambiarla en el primer login');
    console.log('🔐 ════════════════════════════════════════════════');
    console.log('');
  } catch (err) {
    console.error('⚠️  Seed error (non-fatal):', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
