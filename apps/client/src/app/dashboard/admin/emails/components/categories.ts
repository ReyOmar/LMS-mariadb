import { GraduationCap, Settings, Shield, UserCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Grupo en el que se muestra un evento de correo, según a quién va dirigido. */
export interface EmailCategory {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  backgroundColor: string;
  borderColor: string;
  events: readonly string[];
}

export const CATEGORIES: readonly EmailCategory[] = [
  {
    key: 'students',
    label: 'Estudiantes',
    icon: GraduationCap,
    color: 'text-blue-700 dark:text-blue-400',
    backgroundColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    events: [
      'CALIFICACION_RECIBIDA',
      'RECORDATORIO_INACTIVIDAD',
      'MODULO_REINICIADO',
      'MATRICULA_NUEVA',
      'CERTIFICADO_GENERADO',
      'ENTREGA_RECHAZADA',
    ],
  },
  {
    key: 'examiners',
    label: 'Examinadores',
    icon: UserCheck,
    color: 'text-emerald-700 dark:text-emerald-400',
    backgroundColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    events: ['NUEVA_ENTREGA', 'CURSO_COMPLETADO'],
  },
  {
    key: 'administration',
    label: 'Administración',
    icon: Shield,
    color: 'text-amber-700 dark:text-amber-400',
    backgroundColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    events: ['NUEVA_SOLICITUD_ACCESO', 'USUARIO_APROBADO'],
  },
  {
    key: 'system',
    label: 'Sistema',
    icon: Settings,
    color: 'text-purple-700 dark:text-purple-400',
    backgroundColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    events: ['RECUPERAR_PASSWORD', 'CURSO_MANTENIMIENTO', 'CURSO_REACTIVADO'],
  },
];

/** Categoría donde recae un evento que aún no está repartido. */
const UNCATEGORIZED = CATEGORIES[CATEGORIES.length - 1];

export function eventCategory(key: string): EmailCategory {
  return CATEGORIES.find((c) => c.events.includes(key)) ?? UNCATEGORIZED;
}

/**
 * Reparte los eventos en sus categorías, en el orden de `CATEGORIES` y sin grupos vacíos.
 *
 * Se agrupa con `eventCategory`, no con las listas de cada categoría: así un evento nuevo
 * del servidor que aquí no está repartido aparece en «Sistema» en vez de desaparecer.
 */
export function groupByCategory<T extends { key: string }>(
  events: readonly T[],
): (EmailCategory & { eventsWithData: T[] })[] {
  return CATEGORIES.map((category) => ({
    ...category,
    eventsWithData: events.filter((event) => eventCategory(event.key).key === category.key),
  })).filter((group) => group.eventsWithData.length > 0);
}
