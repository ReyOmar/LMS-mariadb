/**
 * Plantillas de correo iniciales.
 *
 * La semilla las crea una sola vez en cada sede; a partir de ahí cada sede edita las suyas
 * desde el panel de administración y la semilla no las sobrescribe. Los marcadores `{{variable}}` los
 * sustituye `MailService` al enviar.
 *
 * Las notas se insertan ya formateadas ("85 / 100"), de modo que cambiar la escala del
 * sistema no obliga a reescribir ninguna plantilla.
 */

export interface SeedTemplate {
  key: string;
  displayName: string;
  description: string;
  /** JSON con los nombres de variable admitidos, para la ayuda del editor. */
  variables: string;
  template: {
    internalName: string;
    subject: string;
    bodyHtml: string;
    isSystem: boolean;
  };
}

export const EMAIL_TEMPLATES: SeedTemplate[] = [
  {
    key: 'RECUPERAR_PASSWORD',
    displayName: 'Recuperar Contraseña',
    description: 'Se envía cuando un usuario solicita restablecer su contraseña.',
    variables: JSON.stringify(['nombre', 'resetUrl']),
    template: {
      internalName: 'Plantilla por defecto - Recuperación',
      subject: 'Recuperar Contraseña - Campus Virtual',
      bodyHtml: `<h2 style="color:#1e293b;margin:0 0 16px">Recuperar Contraseña</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{nombre}}</strong>, recibimos una solicitud para restablecer tu contraseña.</p>
<p style="color:#64748b;font-size:15px;line-height:1.6">Haz clic en el siguiente botón para crear una nueva contraseña:</p>
<div style="text-align:center;margin:32px 0">
<a href="{{resetUrl}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Restablecer Contraseña</a>
</div>
<p style="color:#94a3b8;font-size:13px;line-height:1.6">Si no solicitaste este cambio, ignora este correo. El enlace expira en 1 hora.</p>
<p style="color:#94a3b8;font-size:12px;margin-top:24px;word-break:break-all">Link directo: <a href="{{resetUrl}}" style="color:#4f46e5">{{resetUrl}}</a></p>`,
      isSystem: true,
    },
  },
  {
    key: 'CALIFICACION_RECIBIDA',
    displayName: 'Calificación Recibida',
    description: 'Se envía al estudiante cuando se califica una de sus entregas.',
    variables: JSON.stringify([
      'nombre',
      'tarea',
      'calificacion',
      'emoji',
      'mensaje_aprobacion',
      'comentario',
      'url_campus',
    ]),
    template: {
      internalName: 'Plantilla por defecto - Calificación',
      subject: 'Calificación: {{tarea}} — {{calificacion}}',
      bodyHtml: `<h2 style="color:#1e293b;margin:0 0 16px">{{emoji}} Calificación Recibida</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{nombre}}</strong>, tu entrega en <strong>"{{tarea}}"</strong> ha sido calificada.</p>
<div style="text-align:center;margin:24px 0;padding:20px;background:#f1f5f9;border-radius:12px">
<span style="font-size:36px;font-weight:800;color:#1e293b">{{calificacion}}</span>
<span style="font-size:18px;color:#94a3b8"> puntos</span>
</div>
{{mensaje_aprobacion}}
{{comentario}}
<div style="text-align:center;margin:24px 0">
<a href="{{url_campus}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:12px 32px;border-radius:12px;text-decoration:none;font-size:14px">Ir al Campus</a>
</div>`,
      isSystem: true,
    },
  },
  {
    key: 'RECORDATORIO_INACTIVIDAD',
    displayName: 'Recordatorio de Inactividad',
    description: 'Aviso enviado automáticamente tras varios días sin ingresar al campus.',
    variables: JSON.stringify(['nombre', 'diasInactivo', 'url_campus']),
    template: {
      internalName: 'Plantilla por defecto - Inactividad',
      subject: 'Recordatorio: Llevas {{diasInactivo}} días sin acceder',
      bodyHtml: `<h2 style="color:#1e293b;margin:0 0 16px">🔔 Te extrañamos, {{nombre}}</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Han pasado <strong>{{diasInactivo}} días</strong> sin que accedas a la plataforma de capacitación.</p>
<p style="color:#64748b;font-size:15px;line-height:1.6">Tu progreso es importante. ¡Vuelve y continúa tu aprendizaje!</p>
<div style="text-align:center;margin:32px 0">
<a href="{{url_campus}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Retomar Capacitación</a>
</div>`,
      isSystem: true,
    },
  },
  {
    key: 'CURSO_REACTIVADO',
    displayName: 'Curso Reactivado',
    description: 'Aviso a los matriculados cuando un curso vuelve a estar disponible.',
    variables: JSON.stringify(['nombre', 'cursoTitulo', 'url_campus']),
    template: {
      internalName: 'Plantilla por defecto - Curso Reactivado',
      subject: 'Curso Reactivado: {{cursoTitulo}}',
      bodyHtml: `<h2 style="color:#1e293b;margin:0 0 16px">✅ Curso Reactivado</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{nombre}}</strong>, el curso <strong>"{{cursoTitulo}}"</strong> que estaba en mantenimiento ya está disponible nuevamente.</p>
<div style="text-align:center;margin:32px 0">
<a href="{{url_campus}}" style="display:inline-block;background:#10b981;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Continuar Curso</a>
</div>`,
      isSystem: true,
    },
  },
  {
    key: 'NUEVA_SOLICITUD_ACCESO',
    displayName: 'Nueva Solicitud de Acceso',
    description: 'Se envía al administrador cuando alguien solicita registrarse en la plataforma.',
    variables: JSON.stringify([
      'adminNombre',
      'solicitanteNombre',
      'solicitanteEmail',
      'solicitanteRol',
      'url_solicitudes',
    ]),
    template: {
      internalName: 'Plantilla por defecto - Solicitud Acceso',
      subject: 'Nueva Solicitud: {{solicitanteNombre}}',
      bodyHtml: `<h2 style="color:#1e293b;margin:0 0 16px">📋 Nueva Solicitud de Acceso</h2>
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
      isSystem: true,
    },
  },
  {
    key: 'SOLICITUD_RECHAZADA',
    displayName: 'Solicitud de Acceso Rechazada',
    description: 'Se envía a quien pidió acceso cuando un administrador rechaza su solicitud, con el motivo si lo dio.',
    variables: JSON.stringify(['nombre', 'sede', 'motivo']),
    template: {
      internalName: 'Plantilla por defecto - Solicitud Rechazada',
      subject: 'Tu solicitud de acceso al campus de {{sede}}',
      bodyHtml: `<h2 style="color:#1e293b;margin:0 0 16px">Solicitud de Acceso no Aprobada</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{nombre}}</strong>, la administración del campus de <strong>{{sede}}</strong> revisó tu solicitud de acceso y no la aprobó.</p>
{{motivo}}
<p style="color:#64748b;font-size:14px;line-height:1.6">Si crees que es un error, ponte en contacto con la administración de tu sede.</p>`,
      isSystem: true,
    },
  },
  {
    key: 'NUEVA_ENTREGA',
    displayName: 'Nueva Entrega Recibida',
    description: 'Aviso al examinador cuando un estudiante entrega una tarea.',
    variables: JSON.stringify(['examinerNombre', 'estudiante', 'tarea', 'curso', 'url_calificaciones']),
    template: {
      internalName: 'Plantilla por defecto - Nueva Entrega',
      subject: 'Nueva Entrega: {{tarea}} — {{estudiante}}',
      bodyHtml: `<h2 style="color:#1e293b;margin:0 0 16px">📝 Nueva Entrega Recibida</h2>
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
      isSystem: true,
    },
  },
  {
    key: 'MODULO_REINICIADO',
    displayName: 'Módulo Reiniciado',
    description: 'Se envía al estudiante si falla un cuestionario y se reinicia el módulo.',
    variables: JSON.stringify(['nombre', 'quizTitulo', 'moduloTitulo', 'nota', 'url_campus']),
    template: {
      internalName: 'Plantilla por defecto - Módulo Reiniciado',
      subject: 'Módulo Reiniciado: {{moduloTitulo}}',
      bodyHtml: `<h2 style="color:#1e293b;margin:0 0 16px">🔄 Módulo Reiniciado</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{nombre}}</strong>, no superaste el cuestionario <strong>"{{quizTitulo}}"</strong>.</p>
<div style="text-align:center;margin:24px 0;padding:20px;background:#fef2f2;border-radius:12px">
<span style="font-size:36px;font-weight:800;color:#ef4444">{{nota}}</span>
<span style="font-size:18px;color:#94a3b8"> puntos</span>
</div>
<p style="color:#64748b;font-size:15px;line-height:1.6">Has sido devuelto al inicio del módulo <strong>"{{moduloTitulo}}"</strong>. Debes repasar todo el contenido antes de volver a intentar el cuestionario.</p>
<p style="color:#10b981;font-size:14px;font-weight:600">✅ Tus entregas de archivos ya completadas se mantienen.</p>
<div style="text-align:center;margin:32px 0">
<a href="{{url_campus}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Repasar Módulo</a>
</div>`,
      isSystem: true,
    },
  },
  {
    key: 'USUARIO_APROBADO',
    displayName: 'Usuario Aprobado (Bienvenida)',
    description:
      'Se envía al usuario cuando se aprueba su solicitud de acceso o un administrador le crea la cuenta, con su contraseña temporal.',
    variables: JSON.stringify(['nombre', 'email', 'tempPassword', 'sede', 'url_campus']),
    template: {
      internalName: 'Plantilla por defecto - Bienvenida',
      subject: '🎓 ¡Bienvenido al Campus Virtual!',
      bodyHtml: `<h2 style="color:#1e293b;margin:0 0 16px">¡Hola {{nombre}}! 👋</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Tu cuenta en el Campus Virtual de <strong>{{sede}}</strong> está <strong style="color:#10b981">lista</strong>. Ya puedes iniciar sesión.</p>
<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:20px;margin:20px 0">
<table style="width:100%;border-collapse:collapse;font-size:14px">
  <tr><td style="padding:6px 0;color:#94a3b8;width:120px">📍 Sede:</td><td style="padding:6px 0;color:#1e293b;font-weight:600">{{sede}}</td></tr>
  <tr><td style="padding:6px 0;color:#94a3b8">📧 Email:</td><td style="padding:6px 0;color:#1e293b;font-weight:600">{{email}}</td></tr>
  <tr><td style="padding:6px 0;color:#94a3b8">🔑 Contraseña:</td><td style="padding:6px 0;color:#1e293b;font-weight:600"><code style="background:#e2e8f0;padding:2px 8px;border-radius:4px">{{tempPassword}}</code></td></tr>
</table>
</div>
<p style="color:#ef4444;font-size:14px;font-weight:600">⚠️ Deberás cambiar tu contraseña en el primer inicio de sesión.</p>
<div style="text-align:center;margin:32px 0">
<a href="{{url_campus}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Ir al Campus Virtual</a>
</div>`,
      isSystem: true,
    },
  },
  {
    key: 'CURSO_MANTENIMIENTO',
    displayName: 'Curso en Mantenimiento',
    description: 'Se envía a los estudiantes matriculados cuando un curso pasa a estado Borrador (mantenimiento).',
    variables: JSON.stringify(['nombre', 'cursoTitulo', 'url_campus']),
    template: {
      internalName: 'Plantilla por defecto - Mantenimiento',
      subject: '🔧 Curso en Mantenimiento: {{cursoTitulo}}',
      bodyHtml: `<h2 style="color:#1e293b;margin:0 0 16px">🔧 Curso en Mantenimiento</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{nombre}}</strong>, el curso <strong>"{{cursoTitulo}}"</strong> ha sido puesto temporalmente en mantenimiento por el equipo administrativo.</p>
<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:12px;padding:16px;margin:20px 0">
<p style="color:#92400e;font-size:14px;font-weight:600;margin:0">⚠️ Durante este período no podrás acceder al contenido del curso. Tu progreso se mantiene intacto.</p>
</div>
<p style="color:#64748b;font-size:14px;line-height:1.6">Te notificaremos cuando el curso vuelva a estar disponible.</p>
<div style="text-align:center;margin:32px 0">
<a href="{{url_campus}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Ir al Campus</a>
</div>`,
      isSystem: true,
    },
  },
  {
    key: 'MATRICULA_NUEVA',
    displayName: 'Matrícula en Curso',
    description: 'Se envía al estudiante cuando es matriculado en un nuevo curso.',
    variables: JSON.stringify(['nombre', 'cursoTitulo', 'url_curso']),
    template: {
      internalName: 'Plantilla por defecto - Matrícula',
      subject: '📚 Has sido matriculado en: {{cursoTitulo}}',
      bodyHtml: `<h2 style="color:#1e293b;margin:0 0 16px">📚 ¡Nuevo Curso Disponible!</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{nombre}}</strong>, has sido matriculado exitosamente en el curso:</p>
<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:20px;margin:20px 0;text-align:center">
<p style="font-size:18px;font-weight:800;color:#166534;margin:0">{{cursoTitulo}}</p>
</div>
<p style="color:#64748b;font-size:14px;line-height:1.6">Ya puedes comenzar a estudiar los módulos y completar las actividades del curso.</p>
<div style="text-align:center;margin:32px 0">
<a href="{{url_curso}}" style="display:inline-block;background:#10b981;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Comenzar Curso</a>
</div>`,
      isSystem: true,
    },
  },
  {
    key: 'CERTIFICADO_GENERADO',
    displayName: 'Certificado Generado',
    description: 'Se envía al estudiante cuando se genera su certificado de finalización de curso.',
    variables: JSON.stringify(['nombre', 'cursoTitulo', 'codigo', 'url_certificado']),
    template: {
      internalName: 'Plantilla por defecto - Certificado',
      subject: '🏆 ¡Certificado Disponible! — {{cursoTitulo}}',
      bodyHtml: `<h2 style="color:#1e293b;margin:0 0 16px">🏆 ¡Felicitaciones, {{nombre}}!</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Has completado exitosamente el curso <strong>"{{cursoTitulo}}"</strong> y tu certificado ya está disponible para descargar.</p>
<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:20px;margin:20px 0;text-align:center">
<p style="color:#94a3b8;font-size:12px;margin:0 0 8px">Código de verificación</p>
<p style="font-size:18px;font-weight:800;letter-spacing:2px;color:#1e293b;font-family:monospace;margin:0">{{codigo}}</p>
</div>
<p style="color:#64748b;font-size:14px;line-height:1.6">Puedes compartir el código de verificación con terceros para validar la autenticidad de tu certificado.</p>
<div style="text-align:center;margin:32px 0">
<a href="{{url_certificado}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Ver Certificado</a>
</div>`,
      isSystem: true,
    },
  },
  {
    key: 'ENTREGA_RECHAZADA',
    displayName: 'Entrega Rechazada',
    description:
      'Se envía al estudiante cuando su entrega recibe una calificación por debajo de la nota mínima aprobatoria.',
    variables: JSON.stringify(['nombre', 'tarea', 'calificacion', 'comentario', 'url_campus']),
    template: {
      internalName: 'Plantilla por defecto - Entrega Rechazada',
      subject: '⚠️ Entrega requiere mejora: {{tarea}}',
      bodyHtml: `<h2 style="color:#1e293b;margin:0 0 16px">⚠️ Entrega No Aprobada</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{nombre}}</strong>, tu entrega en <strong>"{{tarea}}"</strong> ha sido calificada pero no alcanzó la nota mínima aprobatoria.</p>
<div style="text-align:center;margin:24px 0;padding:20px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px">
<span style="font-size:36px;font-weight:800;color:#ef4444">{{calificacion}}</span>
<span style="font-size:18px;color:#94a3b8"> puntos</span>
</div>
<p style="color:#ef4444;font-size:14px;font-weight:600">Debes subir un nuevo documento para mejorar tu calificación.</p>
{{comentario}}
<div style="text-align:center;margin:32px 0">
<a href="{{url_campus}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Ir al Campus</a>
</div>`,
      isSystem: true,
    },
  },
  {
    key: 'CURSO_COMPLETADO',
    displayName: 'Curso Completado (Examinador)',
    description: 'Se envía al examinador asignado cuando un estudiante completa todos los requisitos de un curso.',
    variables: JSON.stringify(['examinerNombre', 'estudiante', 'cursoTitulo', 'url_monitoreo']),
    template: {
      internalName: 'Plantilla por defecto - Curso Completado',
      subject: '✅ {{estudiante}} completó: {{cursoTitulo}}',
      bodyHtml: `<h2 style="color:#1e293b;margin:0 0 16px">✅ Estudiante Completó el Curso</h2>
<p style="color:#64748b;font-size:15px;line-height:1.6">Hola <strong>{{examinerNombre}}</strong>, el estudiante <strong>{{estudiante}}</strong> ha completado exitosamente todos los requisitos del curso:</p>
<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:20px;margin:20px 0;text-align:center">
<p style="font-size:18px;font-weight:800;color:#166534;margin:0">{{cursoTitulo}}</p>
</div>
<p style="color:#64748b;font-size:14px;line-height:1.6">El certificado de finalización ha sido generado automáticamente para el estudiante.</p>
<div style="text-align:center;margin:32px 0">
<a href="{{url_monitoreo}}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;font-size:15px">Ver Monitoreo</a>
</div>`,
      isSystem: true,
    },
  },
];
