import { PrismaClient, lms_rol_usuario } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

// ── Guard: Prevent accidental execution in production ──
if (process.env.NODE_ENV === 'production') {
  console.error('❌ SEED BLOCKED: Cannot run seed in production. Set NODE_ENV to "development" to proceed.');
  process.exit(1);
}

// Generate strong random passwords for seed users
const generatePassword = () => crypto.randomBytes(6).toString('base64url'); // ~8 chars, URL-safe

const dbUrl = new URL(process.env.DATABASE_URL!);
const adapter = new PrismaMariaDb({
  host: dbUrl.hostname || '127.0.0.1',
  port: dbUrl.port ? parseInt(dbUrl.port) : 3306,
  user: decodeURIComponent(dbUrl.username) || 'root',
  password: decodeURIComponent(dbUrl.password) || '',
  database: dbUrl.pathname.replace(/^\//, '') || 'lms_db',
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database with secure credentials...');

  const adminPwd = generatePassword();
  const examPwd = generatePassword();
  const capaPwd = generatePassword();

  const adminPassword = await bcrypt.hash(adminPwd, 10);
  const examPassword = await bcrypt.hash(examPwd, 10);
  const capaPassword = await bcrypt.hash(capaPwd, 10);

  const adminUser = await prisma.usuarios.upsert({
    where: { email: 'admin@pesv.com' },
    update: { contrasena: adminPassword, rol: lms_rol_usuario.ADMINISTRADOR },
    create: {
      email: 'admin@pesv.com',
      contrasena: adminPassword,
      nombre: 'Administrador',
      apellido: 'Principal',
      rol: lms_rol_usuario.ADMINISTRADOR,
    },
  });

  const teacherUser = await prisma.usuarios.upsert({
    where: { email: 'examinador@pesv.com' },
    update: { contrasena: examPassword, rol: lms_rol_usuario.PROFESOR },
    create: {
      email: 'examinador@pesv.com',
      contrasena: examPassword,
      nombre: 'Supervisor',
      apellido: 'PESV',
      rol: lms_rol_usuario.PROFESOR,
    },
  });

  const studentUser = await prisma.usuarios.upsert({
    where: { email: 'capacitante@pesv.com' },
    update: { contrasena: capaPassword, rol: lms_rol_usuario.ESTUDIANTE },
    create: {
      email: 'capacitante@pesv.com',
      contrasena: capaPassword,
      nombre: 'Personal',
      apellido: 'En Capacitacion',
      rol: lms_rol_usuario.ESTUDIANTE,
    },
  });

  // ── SEED DE EVENTOS DE CORREO Y PLANTILLAS ──
  console.log('Seeding email events and templates...');
  
  const eventosBase = [
    {
      identificador: 'RECUPERAR_PASSWORD',
      nombre_legible: 'Recuperar Contraseña',
      descripcion: 'Se envía cuando un usuario solicita restablecer su contraseña.',
      variables: JSON.stringify(["nombre", "resetUrl"]),
      plantilla: {
        nombre_interno: 'Plantilla por defecto - Recuperación',
        asunto: 'Recuperar Contraseña - Campus Virtual',
        cuerpo_html: `<h2 style="color:#1e293b;margin:0 0 16px">Recuperar Contraseña</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{nombre}}</strong>, recibimos una solicitud para restablecer tu contraseña.</p>
<p style="color:#64748b;font-size:15px;line-height:1.6">Haz clic en el siguiente botón para crear una nueva contraseña:</p>
<div style="text-align:center;margin:32px 0">
  <a href="{{resetUrl}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Restablecer Contraseña</a>
</div>
<p style="color:#94a3b8;font-size:13px;line-height:1.6">Si no solicitaste este cambio, ignora este correo. El enlace expira en 1 hora.</p>
<p style="color:#94a3b8;font-size:12px;margin-top:24px;word-break:break-all">Link directo: <a href="{{resetUrl}}" style="color:#4f46e5">{{resetUrl}}</a></p>`,
        es_sistema: true,
      }
    },
    {
      identificador: 'CALIFICACION_RECIBIDA',
      nombre_legible: 'Calificación Recibida',
      descripcion: 'Se envía al estudiante cuando se califica una de sus entregas.',
      variables: JSON.stringify(["nombre", "tarea", "calificacion", "emoji", "mensaje_aprobacion", "url_campus"]),
      plantilla: {
        nombre_interno: 'Plantilla por defecto - Calificación',
        asunto: 'Calificación: {{tarea}} — {{calificacion}}/5.0',
        cuerpo_html: `<h2 style="color:#1e293b;margin:0 0 16px">{{emoji}} Calificación Recibida</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{nombre}}</strong>, tu entrega en <strong>"{{tarea}}"</strong> ha sido calificada.</p>
<div style="text-align:center;margin:24px 0;padding:20px;background:#f1f5f9;border-radius:12px">
  <span style="font-size:36px;font-weight:800;color:#1e293b">{{calificacion}}</span>
  <span style="font-size:18px;color:#94a3b8">/5.0</span>
</div>
{{mensaje_aprobacion}}
<div style="text-align:center;margin:24px 0">
  <a href="{{url_campus}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:12px 32px;border-radius:12px;text-decoration:none;font-size:14px">Ir al Campus</a>
</div>`,
        es_sistema: true,
      }
    },
    {
      identificador: 'RECORDATORIO_INACTIVIDAD',
      nombre_legible: 'Recordatorio de Inactividad',
      descripcion: 'Aviso enviado automáticamente tras varios días sin ingresar al campus.',
      variables: JSON.stringify(["nombre", "diasInactivo", "url_campus"]),
      plantilla: {
        nombre_interno: 'Plantilla por defecto - Inactividad',
        asunto: 'Recordatorio: Llevas {{diasInactivo}} días sin acceder',
        cuerpo_html: `<h2 style="color:#1e293b;margin:0 0 16px">🔔 Te extrañamos, {{nombre}}</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Han pasado <strong>{{diasInactivo}} días</strong> sin que accedas a la plataforma de capacitación.</p>
<p style="color:#64748b;font-size:15px;line-height:1.6">Tu progreso es importante. ¡Vuelve y continúa tu aprendizaje!</p>
<div style="text-align:center;margin:32px 0">
  <a href="{{url_campus}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Retomar Capacitación</a>
</div>`,
        es_sistema: true,
      }
    },
    {
      identificador: 'CURSO_REACTIVADO',
      nombre_legible: 'Curso Reactivado',
      descripcion: 'Aviso a los matriculados cuando un curso vuelve a estar disponible.',
      variables: JSON.stringify(["nombre", "cursoTitulo", "url_campus"]),
      plantilla: {
        nombre_interno: 'Plantilla por defecto - Curso Reactivado',
        asunto: 'Curso Reactivado: {{cursoTitulo}}',
        cuerpo_html: `<h2 style="color:#1e293b;margin:0 0 16px">✅ Curso Reactivado</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{nombre}}</strong>, el curso <strong>"{{cursoTitulo}}"</strong> que estaba en mantenimiento ya está disponible nuevamente.</p>
<div style="text-align:center;margin:32px 0">
  <a href="{{url_campus}}" style="display:inline-block;background:#10b981;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Continuar Curso</a>
</div>`,
        es_sistema: true,
      }
    },
    {
      identificador: 'NUEVA_SOLICITUD_ACCESO',
      nombre_legible: 'Nueva Solicitud de Acceso',
      descripcion: 'Se envía al administrador cuando alguien solicita registrarse en la plataforma.',
      variables: JSON.stringify(["adminNombre", "solicitanteNombre", "solicitanteEmail", "solicitanteRol", "url_solicitudes"]),
      plantilla: {
        nombre_interno: 'Plantilla por defecto - Solicitud Acceso',
        asunto: 'Nueva Solicitud: {{solicitanteNombre}}',
        cuerpo_html: `<h2 style="color:#1e293b;margin:0 0 16px">📋 Nueva Solicitud de Acceso</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{adminNombre}}</strong>, hay una nueva solicitud de acceso pendiente de aprobación.</p>
<div style="background:#f1f5f9;border-radius:12px;padding:20px;margin:20px 0">
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:6px 0;color:#94a3b8;width:100px">Nombre:</td><td style="padding:6px 0;color:#1e293b;font-weight:600">{{solicitanteNombre}}</td></tr>
    <tr><td style="padding:6px 0;color:#94a3b8">Email:</td><td style="padding:6px 0;color:#1e293b;font-weight:600">{{solicitanteEmail}}</td></tr>
    <tr><td style="padding:6px 0;color:#94a3b8">Cargo:</td><td style="padding:6px 0;color:#1e293b;font-weight:600">{{solicitanteRol}}</td></tr>
  </table>
</div>
<div style="text-align:center;margin:24px 0">
  <a href="{{url_solicitudes}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Revisar Solicitud</a>
</div>`,
        es_sistema: true,
      }
    },
    {
      identificador: 'NUEVA_ENTREGA',
      nombre_legible: 'Nueva Entrega Recibida',
      descripcion: 'Aviso al examinador cuando un estudiante entrega una tarea.',
      variables: JSON.stringify(["examinerNombre", "estudiante", "tarea", "curso", "url_calificaciones"]),
      plantilla: {
        nombre_interno: 'Plantilla por defecto - Nueva Entrega',
        asunto: 'Nueva Entrega: {{tarea}} — {{estudiante}}',
        cuerpo_html: `<h2 style="color:#1e293b;margin:0 0 16px">📝 Nueva Entrega Recibida</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{examinerNombre}}</strong>, <strong>{{estudiante}}</strong> ha enviado una entrega para revisar.</p>
<div style="background:#f1f5f9;border-radius:12px;padding:20px;margin:20px 0">
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:6px 0;color:#94a3b8;width:100px">Tarea:</td><td style="padding:6px 0;color:#1e293b;font-weight:600">{{tarea}}</td></tr>
    <tr><td style="padding:6px 0;color:#94a3b8">Curso:</td><td style="padding:6px 0;color:#1e293b;font-weight:600">{{curso}}</td></tr>
    <tr><td style="padding:6px 0;color:#94a3b8">Estudiante:</td><td style="padding:6px 0;color:#1e293b;font-weight:600">{{estudiante}}</td></tr>
  </table>
</div>
<div style="text-align:center;margin:24px 0">
  <a href="{{url_calificaciones}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Ir a Calificaciones</a>
</div>`,
        es_sistema: true,
      }
    },
    {
      identificador: 'MODULO_REINICIADO',
      nombre_legible: 'Módulo Reiniciado',
      descripcion: 'Se envía al estudiante si falla un cuestionario y se reinicia el módulo.',
      variables: JSON.stringify(["nombre", "quizTitulo", "moduloTitulo", "nota", "url_campus"]),
      plantilla: {
        nombre_interno: 'Plantilla por defecto - Módulo Reiniciado',
        asunto: 'Módulo Reiniciado: {{moduloTitulo}}',
        cuerpo_html: `<h2 style="color:#1e293b;margin:0 0 16px">🔄 Módulo Reiniciado</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{nombre}}</strong>, no superaste el cuestionario <strong>"{{quizTitulo}}"</strong>.</p>
<div style="text-align:center;margin:24px 0;padding:20px;background:#fef2f2;border-radius:12px">
  <span style="font-size:36px;font-weight:800;color:#ef4444">{{nota}}</span>
  <span style="font-size:18px;color:#94a3b8">/5.0</span>
</div>
<p style="color:#64748b;font-size:15px;line-height:1.6">Has sido devuelto al inicio del módulo <strong>"{{moduloTitulo}}"</strong>. Debes repasar todo el contenido antes de volver a intentar el cuestionario.</p>
<p style="color:#10b981;font-size:14px;font-weight:600">✅ Tus entregas de archivos ya completadas se mantienen.</p>
<div style="text-align:center;margin:32px 0">
  <a href="{{url_campus}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Repasar Módulo</a>
</div>`,
        es_sistema: true,
      }
    },
    {
      identificador: 'USUARIO_APROBADO',
      nombre_legible: 'Usuario Aprobado (Bienvenida)',
      descripcion: 'Se envía al usuario cuando su solicitud de acceso es aprobada, con sus credenciales temporales.',
      variables: JSON.stringify(["nombre", "email", "tempPassword", "url_campus"]),
      plantilla: {
        nombre_interno: 'Plantilla por defecto - Bienvenida',
        asunto: '🎓 ¡Bienvenido al Campus Virtual!',
        cuerpo_html: `<h2 style="color:#1e293b;margin:0 0 16px">¡Hola {{nombre}}! 👋</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Tu solicitud de acceso ha sido <strong style="color:#10b981">aprobada</strong>. Ya puedes iniciar sesión en el Campus Virtual.</p>
<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:20px;margin:20px 0">
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:6px 0;color:#94a3b8;width:120px">📧 Email:</td><td style="padding:6px 0;color:#1e293b;font-weight:600">{{email}}</td></tr>
    <tr><td style="padding:6px 0;color:#94a3b8">🔑 Contraseña:</td><td style="padding:6px 0;color:#1e293b;font-weight:600"><code style="background:#e2e8f0;padding:2px 8px;border-radius:4px">{{tempPassword}}</code></td></tr>
  </table>
</div>
<p style="color:#ef4444;font-size:14px;font-weight:600">⚠️ Deberás cambiar tu contraseña en el primer inicio de sesión.</p>
<div style="text-align:center;margin:32px 0">
  <a href="{{url_campus}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Ir al Campus Virtual</a>
</div>`,
        es_sistema: true,
      }
    },
    {
      identificador: 'CURSO_MANTENIMIENTO',
      nombre_legible: 'Curso en Mantenimiento',
      descripcion: 'Se envía a los estudiantes matriculados cuando un curso pasa a estado Borrador (mantenimiento).',
      variables: JSON.stringify(["nombre", "cursoTitulo", "url_campus"]),
      plantilla: {
        nombre_interno: 'Plantilla por defecto - Mantenimiento',
        asunto: '🔧 Curso en Mantenimiento: {{cursoTitulo}}',
        cuerpo_html: `<h2 style="color:#1e293b;margin:0 0 16px">🔧 Curso en Mantenimiento</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{nombre}}</strong>, el curso <strong>"{{cursoTitulo}}"</strong> ha sido puesto temporalmente en mantenimiento por el equipo administrativo.</p>
<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:12px;padding:16px;margin:20px 0">
  <p style="color:#92400e;font-size:14px;font-weight:600;margin:0">⚠️ Durante este período no podrás acceder al contenido del curso. Tu progreso se mantiene intacto.</p>
</div>
<p style="color:#64748b;font-size:14px;line-height:1.6">Te notificaremos cuando el curso vuelva a estar disponible.</p>
<div style="text-align:center;margin:32px 0">
  <a href="{{url_campus}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Ir al Campus</a>
</div>`,
        es_sistema: true,
      }
    },
    {
      identificador: 'MATRICULA_NUEVA',
      nombre_legible: 'Matrícula en Curso',
      descripcion: 'Se envía al estudiante cuando es matriculado en un nuevo curso.',
      variables: JSON.stringify(["nombre", "cursoTitulo", "url_curso"]),
      plantilla: {
        nombre_interno: 'Plantilla por defecto - Matrícula',
        asunto: '📚 Has sido matriculado en: {{cursoTitulo}}',
        cuerpo_html: `<h2 style="color:#1e293b;margin:0 0 16px">📚 ¡Nuevo Curso Disponible!</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{nombre}}</strong>, has sido matriculado exitosamente en el curso:</p>
<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:20px;margin:20px 0;text-align:center">
  <p style="font-size:18px;font-weight:800;color:#166534;margin:0">{{cursoTitulo}}</p>
</div>
<p style="color:#64748b;font-size:14px;line-height:1.6">Ya puedes comenzar a estudiar los módulos y completar las actividades del curso.</p>
<div style="text-align:center;margin:32px 0">
  <a href="{{url_curso}}" style="display:inline-block;background:#10b981;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Comenzar Curso</a>
</div>`,
        es_sistema: true,
      }
    },
    {
      identificador: 'CERTIFICADO_GENERADO',
      nombre_legible: 'Certificado Generado',
      descripcion: 'Se envía al estudiante cuando se genera su certificado de finalización de curso.',
      variables: JSON.stringify(["nombre", "cursoTitulo", "codigo", "url_certificado"]),
      plantilla: {
        nombre_interno: 'Plantilla por defecto - Certificado',
        asunto: '🏆 ¡Certificado Disponible! — {{cursoTitulo}}',
        cuerpo_html: `<h2 style="color:#1e293b;margin:0 0 16px">🏆 ¡Felicitaciones, {{nombre}}!</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Has completado exitosamente el curso <strong>"{{cursoTitulo}}"</strong> y tu certificado ya está disponible para descargar.</p>
<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:20px;margin:20px 0;text-align:center">
  <p style="color:#94a3b8;font-size:12px;margin:0 0 8px">Código de verificación</p>
  <p style="font-size:18px;font-weight:800;letter-spacing:2px;color:#1e293b;font-family:monospace;margin:0">{{codigo}}</p>
</div>
<p style="color:#64748b;font-size:14px;line-height:1.6">Puedes compartir el código de verificación con terceros para validar la autenticidad de tu certificado.</p>
<div style="text-align:center;margin:32px 0">
  <a href="{{url_certificado}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Ver Certificado</a>
</div>`,
        es_sistema: true,
      }
    },
    {
      identificador: 'ENTREGA_RECHAZADA',
      nombre_legible: 'Entrega Rechazada',
      descripcion: 'Se envía al estudiante cuando su entrega recibe una calificación por debajo de la nota mínima aprobatoria.',
      variables: JSON.stringify(["nombre", "tarea", "calificacion", "comentario", "url_campus"]),
      plantilla: {
        nombre_interno: 'Plantilla por defecto - Entrega Rechazada',
        asunto: '⚠️ Entrega requiere mejora: {{tarea}}',
        cuerpo_html: `<h2 style="color:#1e293b;margin:0 0 16px">⚠️ Entrega No Aprobada</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{nombre}}</strong>, tu entrega en <strong>"{{tarea}}"</strong> ha sido calificada pero no alcanzó la nota mínima aprobatoria.</p>
<div style="text-align:center;margin:24px 0;padding:20px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px">
  <span style="font-size:36px;font-weight:800;color:#ef4444">{{calificacion}}</span>
  <span style="font-size:18px;color:#94a3b8">/5.0</span>
</div>
<p style="color:#ef4444;font-size:14px;font-weight:600">Debes subir un nuevo documento para mejorar tu calificación.</p>
{{comentario}}
<div style="text-align:center;margin:32px 0">
  <a href="{{url_campus}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Ir al Campus</a>
</div>`,
        es_sistema: true,
      }
    },
    {
      identificador: 'CURSO_COMPLETADO',
      nombre_legible: 'Curso Completado (Examinador)',
      descripcion: 'Se envía al examinador asignado cuando un estudiante completa todos los requisitos de un curso.',
      variables: JSON.stringify(["examinerNombre", "estudiante", "cursoTitulo", "url_monitoreo"]),
      plantilla: {
        nombre_interno: 'Plantilla por defecto - Curso Completado',
        asunto: '✅ {{estudiante}} completó: {{cursoTitulo}}',
        cuerpo_html: `<h2 style="color:#1e293b;margin:0 0 16px">✅ Estudiante Completó el Curso</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{examinerNombre}}</strong>, el estudiante <strong>{{estudiante}}</strong> ha completado exitosamente todos los requisitos del curso:</p>
<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:20px;margin:20px 0;text-align:center">
  <p style="font-size:18px;font-weight:800;color:#166534;margin:0">{{cursoTitulo}}</p>
</div>
<p style="color:#64748b;font-size:14px;line-height:1.6">El certificado de finalización ha sido generado automáticamente para el estudiante.</p>
<div style="text-align:center;margin:32px 0">
  <a href="{{url_monitoreo}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Ver Monitoreo</a>
</div>`,
        es_sistema: true,
      }
    }
  ];

  for (const eb of eventosBase) {
    let evt = await prisma.lms_eventos_correo.findUnique({
      where: { identificador: eb.identificador }
    });
    if (!evt) {
      evt = await prisma.lms_eventos_correo.create({
        data: {
          identificador: eb.identificador,
          nombre_legible: eb.nombre_legible,
          descripcion: eb.descripcion,
          variables: eb.variables
        }
      });
      await prisma.lms_plantillas_correo.create({
        data: {
          evento_id: evt.id,
          nombre_interno: eb.plantilla.nombre_interno,
          asunto: eb.plantilla.asunto,
          cuerpo_html: eb.plantilla.cuerpo_html,
          es_sistema: eb.plantilla.es_sistema,
          activo: true
        }
      });
    }
  }

  console.log('--- CREDENCIALES GENERADAS EXITOSAMENTE ---');
  console.log('⚠️  GUARDE ESTAS CONTRASEÑAS — No se pueden recuperar.');
  console.log(`ADMIN: ${adminUser.email} / ${adminPwd}`);
  console.log(`SUPERVISOR: ${teacherUser.email} / ${examPwd}`);
  console.log(`CAPACITADO: ${studentUser.email} / ${capaPwd}`);
  console.log('---');
  console.log('Nota: Estos usuarios deberán cambiar su contraseña en el primer inicio de sesión.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
