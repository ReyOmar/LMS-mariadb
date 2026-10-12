/** Cómo se presenta una variable de plantilla y con qué valor se enseña de ejemplo. */
export interface VariableData {
  label: string;
  example: string;
  color: string;
}

const TONE = {
  blue: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30',
  violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-500/30',
  red: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  pink: 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-500/30',
  cyan: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30',
  indigo: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30',
  orange: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30',
  slate: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-500/30',
} as const;

const UNKNOWN_TONE = 'bg-slate-500/15 text-foreground border-slate-300 dark:border-slate-500/30';

/** Las variables que declaran los eventos de la API (`apps/api/prisma/email-templates.ts`). */
const VARIABLES: Record<string, VariableData> = {
  nombre: { label: 'Nombre', example: 'Juan', color: TONE.blue },
  email: { label: 'Correo', example: 'juan@correo.com', color: TONE.violet },
  curso: { label: 'Curso', example: 'Módulo PESV Básico', color: TONE.emerald },
  tarea: { label: 'Tarea', example: 'Evaluación final', color: TONE.amber },
  calificacion: { label: 'Calificación', example: '85', color: TONE.emerald },
  mensaje_aprobacion: { label: 'Frase del resultado', example: '¡Buen trabajo! Sigue así.', color: TONE.emerald },
  emoji: { label: 'Icono del resultado', example: '🎉', color: TONE.pink },
  codigo: { label: 'Código', example: 'CERT-2026-ABC', color: TONE.orange },
  cursoTitulo: { label: 'Curso', example: 'Módulo PESV Básico', color: TONE.emerald },
  tempPassword: { label: 'Contraseña temporal', example: '••••••••', color: TONE.red },
  resetUrl: {
    label: 'Enlace para restablecer',
    example: 'https://plataforma.com/reset-password?token=...',
    color: TONE.cyan,
  },
  url_campus: { label: 'Enlace al campus', example: 'https://plataforma.com/dashboard', color: TONE.cyan },
  url_curso: { label: 'Enlace al curso', example: 'https://plataforma.com/courses/abc', color: TONE.cyan },
  url_certificado: {
    label: 'Enlace al certificado',
    example: 'https://plataforma.com/dashboard/student/certificates',
    color: TONE.cyan,
  },
  url_monitoreo: {
    label: 'Enlace al monitoreo',
    example: 'https://plataforma.com/dashboard/examiner/monitoring',
    color: TONE.cyan,
  },
  url_solicitudes: {
    label: 'Enlace a las solicitudes',
    example: 'https://plataforma.com/dashboard/admin/access-requests',
    color: TONE.cyan,
  },
  url_calificaciones: {
    label: 'Enlace a las calificaciones',
    example: 'https://plataforma.com/dashboard/examiner/grading',
    color: TONE.cyan,
  },
  examinerNombre: { label: 'Examinador', example: 'Prof. García', color: TONE.indigo },
  adminNombre: { label: 'Administrador', example: 'Administrador', color: TONE.amber },
  estudiante: { label: 'Estudiante', example: 'María López', color: TONE.blue },
  solicitanteNombre: { label: 'Solicitante', example: 'Carlos Rodríguez', color: TONE.blue },
  solicitanteEmail: { label: 'Correo del solicitante', example: 'carlos@correo.com', color: TONE.violet },
  solicitanteRol: { label: 'Rol solicitado', example: 'Estudiante', color: TONE.amber },
  motivo: { label: 'Motivo', example: 'No consta en la plantilla de la empresa.', color: TONE.slate },
  sede: { label: 'Sede', example: 'Colombia', color: TONE.indigo },
  comentario: { label: 'Comentario', example: 'Revisa la sección 3...', color: TONE.slate },
  diasInactivo: { label: 'Días sin entrar', example: '7', color: TONE.amber },
  quizTitulo: { label: 'Cuestionario', example: 'Cuestionario final', color: TONE.pink },
  moduloTitulo: { label: 'Módulo', example: 'Módulo 1', color: TONE.indigo },
  nota: { label: 'Nota', example: '65', color: TONE.red },
};

export function variableData(variable: string): VariableData {
  return VARIABLES[variable] ?? { label: variable.replace(/_/g, ' '), example: `[${variable}]`, color: UNKNOWN_TONE };
}

/** Variables de un evento, guardadas como JSON: un valor dañado cuenta como «sin variables». */
export function parseVariables(json: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(json || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
