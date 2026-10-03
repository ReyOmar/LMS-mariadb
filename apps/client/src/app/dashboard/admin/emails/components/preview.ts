/** Cómo se presenta una variable de plantilla y con qué valor se enseña de ejemplo. */
export interface VariableData {
  label: string;
  example: string;
  color: string;
}

const VARIABLES: Record<string, VariableData> = {
  nombre: {
    label: 'Nombre',
    example: 'Juan',
    color: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30',
  },
  apellido: {
    label: 'Apellido',
    example: 'Pérez',
    color: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30',
  },
  email: {
    label: 'Correo',
    example: 'juan@correo.com',
    color: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-500/30',
  },
  contrasena: {
    label: 'Contraseña',
    example: '••••••••',
    color: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30',
  },
  curso: {
    label: 'Curso',
    example: 'Módulo PESV Básico',
    color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
  },
  tarea: {
    label: 'Tarea',
    example: 'Evaluación final',
    color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  },
  calificacion: {
    label: 'Calificación',
    example: '85',
    color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
  },
  mensaje_aprobacion: {
    label: 'Frase del resultado',
    example: '¡Buen trabajo! Sigue así.',
    color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
  },
  emoji: {
    label: 'Icono del resultado',
    example: '🎉',
    color: 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-500/30',
  },
  enlace: {
    label: 'Enlace',
    example: 'https://plataforma.com/...',
    color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30',
  },
  fecha: {
    label: 'Fecha',
    example: '09/05/2026',
    color: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-500/30',
  },
  modulo: {
    label: 'Módulo',
    example: 'Módulo 1',
    color: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30',
  },
  codigo: {
    label: 'Código',
    example: 'CERT-2026-ABC',
    color: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30',
  },
  cursoTitulo: {
    label: 'Curso',
    example: 'Módulo PESV Básico',
    color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
  },
  tempPassword: {
    label: 'Contraseña temporal',
    example: '••••••••',
    color: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30',
  },
  resetUrl: {
    label: 'Enlace para restablecer',
    example: 'https://plataforma.com/reset-password?token=...',
    color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30',
  },
  url_campus: {
    label: 'Enlace al campus',
    example: 'https://plataforma.com/dashboard',
    color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30',
  },
  url_curso: {
    label: 'Enlace al curso',
    example: 'https://plataforma.com/courses/abc',
    color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30',
  },
  url_certificado: {
    label: 'Enlace al certificado',
    example: 'https://plataforma.com/dashboard/student/certificates',
    color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30',
  },
  url_monitoreo: {
    label: 'Enlace al monitoreo',
    example: 'https://plataforma.com/dashboard/examiner/monitoring',
    color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30',
  },
  url_solicitudes: {
    label: 'Enlace a las solicitudes',
    example: 'https://plataforma.com/dashboard/admin/access-requests',
    color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30',
  },
  url_calificaciones: {
    label: 'Enlace a las calificaciones',
    example: 'https://plataforma.com/dashboard/examiner/grading',
    color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30',
  },
  examinerNombre: {
    label: 'Examinador',
    example: 'Prof. García',
    color: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30',
  },
  adminNombre: {
    label: 'Administrador',
    example: 'Administrador',
    color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  },
  estudiante: {
    label: 'Estudiante',
    example: 'María López',
    color: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30',
  },
  solicitanteNombre: {
    label: 'Solicitante',
    example: 'Carlos Rodríguez',
    color: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30',
  },
  solicitanteEmail: {
    label: 'Correo del solicitante',
    example: 'carlos@correo.com',
    color: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-500/30',
  },
  solicitanteRol: {
    label: 'Rol solicitado',
    example: 'Estudiante',
    color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  },
  motivo: {
    label: 'Motivo',
    example: 'No consta en la plantilla de la empresa.',
    color: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-500/30',
  },
  sede: {
    label: 'Sede',
    example: 'Colombia',
    color: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30',
  },
  comentario: {
    label: 'Comentario',
    example: 'Revisa la sección 3...',
    color: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-500/30',
  },
  diasInactivo: {
    label: 'Días sin entrar',
    example: '7',
    color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  },
  quizTitulo: {
    label: 'Cuestionario',
    example: 'Cuestionario final',
    color: 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-500/30',
  },
  moduloTitulo: {
    label: 'Módulo',
    example: 'Módulo 1',
    color: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30',
  },
  nota: {
    label: 'Nota',
    example: '65',
    color: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30',
  },
};

const DEFAULT_COLOR = 'bg-slate-500/15 text-foreground border-slate-300 dark:border-slate-500/30';

export function variableData(v: string): VariableData {
  return VARIABLES[v] || { label: v.replace(/_/g, ' '), example: `[${v}]`, color: DEFAULT_COLOR };
}

/**
 * Variables admitidas por un evento, que la API guarda como JSON.
 *
 * Un valor dañado no puede tumbar la pantalla de correos: se trata como «sin variables».
 */
export function parseVariables(json: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(json || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
