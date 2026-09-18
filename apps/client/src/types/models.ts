/**
 * Formas de los datos que devuelve la API.
 *
 * Es el espejo del esquema de Prisma y de las proyecciones de cada servicio, no una copia
 * literal de las tablas: lo que se declara aquí es lo que el navegador recibe realmente.
 * Dos diferencias importantes respecto a la base de datos:
 *
 *  - Los archivos reservados llegan como **URL firmada** (`archivo_url`, `archivo_adjunto_url`),
 *    nunca como clave de almacenamiento suelta.
 *  - Los cuestionarios llegan **sin las respuestas correctas** salvo en el editor de cursos.
 */

import type { Pais } from '@/lib/pais';

// ── Enumeraciones ──────────────────────────────────────────────────────────

export type RolUsuario = 'ADMINISTRADOR' | 'PROFESOR' | 'ESTUDIANTE';
export type EstadoCurso = 'BORRADOR' | 'PUBLICADO' | 'ARCHIVADO';
export type NivelDificultad = 'PRINCIPIANTE' | 'INTERMEDIO' | 'AVANZADO' | 'EXPERTO';
export type TipoRecurso = 'TEXTO' | 'VIDEO' | 'PDF' | 'ENLACE' | 'TAREA';
export type EstadoEntrega = 'BORRADOR' | 'ENTREGADA' | 'ENTREGADA_TARDE' | 'CALIFICADA' | 'EN_REVISION';
export type EstadoSolicitud = 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';

// ── Personas ───────────────────────────────────────────────────────────────

export interface Usuario {
  guid: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: RolUsuario;
  pais: Pais;
  activo: boolean;
  created_at: string;
  updated_at?: string;
  ultimo_acceso?: string | null;
  usa_clave_defecto?: boolean;
  foto_url?: string | null;
  /** Cursos de los que es responsable. Impide borrar la cuenta sin traspasarlos antes. */
  cursos_impartidos?: number;
  matriculas?: number;
}

export interface SolicitudDeAcceso {
  id: number;
  email: string;
  nombre: string;
  apellido: string;
  rol_pedido: RolUsuario;
  pais: Pais;
  estado: EstadoSolicitud;
  motivo?: string | null;
  created_at: string;
}

// ── Contenido ──────────────────────────────────────────────────────────────

export interface Curso {
  guid: string;
  titulo: string;
  descripcion?: string | null;
  descripcion_corta?: string | null;
  /** Clave de almacenamiento; es material público y se resuelve con `urlDeMarca`. */
  imagen_portada?: string | null;
  nivel: NivelDificultad;
  estado: EstadoCurso;
  duracion_horas?: number | null;
  /** Nota mínima para aprobar, en la escala 0–100. */
  nota_aprobacion: number;
  orden_estricto?: boolean;
  emite_certificado?: boolean;
  max_estudiantes?: number | null;
  profesor_guid: string;
  profesor?: Pick<Usuario, 'guid' | 'nombre' | 'apellido'>;
  modulos?: Modulo[];
  created_at: string;
  updated_at?: string;
  /** Sólo en el listado del alumno: cuándo se le asignó. */
  fecha_asignacion?: string;
}

export interface Modulo {
  guid: string;
  curso_guid: string;
  titulo: string;
  descripcion?: string | null;
  orden: number;
  requiere_anterior?: boolean;
  /** Los recursos cuelgan del módulo: ya no existe la capa intermedia de lecciones. */
  recursos?: Recurso[];
}

export interface Recurso {
  guid: string;
  modulo_guid: string;
  titulo: string;
  tipo: TipoRecurso;
  contenido_html?: string | null;
  url_referencia?: string | null;
  orden: number;
  obligatorio?: boolean;
  tiempo_lectura?: number | null;
  archivo_max_size_mb?: number | null;

  /** Clave de almacenamiento del adjunto. La usa el editor al guardar. */
  archivo_adjunto?: string | null;
  archivo_adjunto_nombre?: string | null;
  /** URL firmada del adjunto, lista para usar en un enlace. */
  archivo_adjunto_url?: string | null;
  url_archivo?: string | null;
  url_archivo_url?: string | null;

  /**
   * Configuración del cuestionario, serializada.
   * Con las respuestas correctas sólo en la vista de gestión; en la del alumno llega sin
   * ellas, y para realizar el intento las preguntas se piden aparte.
   */
  quiz_config?: string | null;
}

// ── Evaluación ─────────────────────────────────────────────────────────────

export interface Entrega {
  guid: string;
  estado: EstadoEntrega | 'PENDIENTE';
  fecha_entrega?: string | null;
  intento_numero?: number;
  /** Nombre original del archivo que subió el alumno. */
  archivo_nombre?: string | null;
  /** URL firmada de descarga; `null` si el archivo se purgó tras emitir el certificado. */
  archivo_url?: string | null;
  archivo_purgado?: boolean;
  /** Nota en la escala 0–100. `null` mientras no se haya calificado. */
  calificacion?: number | null;
  comentario?: string | null;
}

export interface EntregaParaCalificar extends Entrega {
  estudiante: Pick<Usuario, 'guid' | 'nombre' | 'apellido' | 'email'>;
  tarea_guid: string | null;
  tarea_titulo: string;
  modulo_guid?: string | null;
  modulo_titulo?: string | null;
  curso_guid: string | null;
  curso_titulo: string | null;
  /** Umbral del curso al que pertenece la entrega. */
  nota_aprobacion: number;
}

export interface EstadoDelCuestionario {
  intentos_realizados: number;
  max_intentos: number;
  mejor_nota: number | null;
  nota_aprobacion: number;
  aprobado: boolean;
  intento_en_curso: boolean;
  fecha_inicio: string | null;
  tiempo_minutos: number;
  puede_reintentar: boolean;
  /** Explicación para el alumno cuando no puede empezar. */
  motivo_bloqueo: string | null;
}

// ── Progreso y certificación ───────────────────────────────────────────────

export interface ProgresoDeCurso {
  completados: string[];
  /** Recursos desbloqueados porque su calificación lleva demasiado tiempo pendiente. */
  desbloqueados_por_espera: string[];
  tareas_pendientes: { recurso_guid: string; titulo: string; fecha_entrega: string | null }[];
  total_recursos: number;
  porcentaje: number;
  curso_titulo?: string;
}

export interface EstadoDeFinalizacion {
  completo: boolean;
  puede_certificarse: boolean;
  completados: number;
  total: number;
  porcentaje: number;
  tareas_pendientes: { recurso_guid: string; titulo: string; estado: string | null }[];
  /** Qué falta exactamente para poder certificarse. */
  motivo: string | null;
}

export interface Certificado {
  guid: string;
  curso_guid: string;
  curso_titulo: string;
  curso_imagen?: string | null;
  codigo_verificacion: string;
  fecha_completado: string;
  horas: number;
  nota_promedio: number | null;
}

// ── Comunicación ───────────────────────────────────────────────────────────

export interface Notificacion {
  id: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  url_accion?: string | null;
  created_at: string;
}

export interface Contacto {
  guid: string;
  nombre: string;
  apellido: string;
  rol: RolUsuario;
  foto_url?: string | null;
  ultimo_mensaje: string;
  ultimo_mensaje_fecha: string | null;
  no_leidos: number;
}

export interface Mensaje {
  id: number;
  remitente_guid: string;
  asunto: string;
  contenido: string;
  leido: boolean;
  created_at: string;
  /** Lo calcula el servidor para no tener que comparar con el usuario en cada render. */
  es_mio: boolean;
}
