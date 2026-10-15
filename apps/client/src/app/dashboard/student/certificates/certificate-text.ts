import { plural } from '@/lib/text';

/** «1 hora» / «8 horas»: el singular importa cuando el programa dura una. */
export function formatHours(hours: number): string {
  const value = Math.round(hours);
  return `${value} ${plural(value, 'hora', 'horas')}`;
}

/**
 * Lo que el alumno estuvo trabajando dentro del curso. Es aparte de la intensidad horaria y no
 * la sustituye: el certificado acredita el programa. Por debajo del minuto no se dan segundos.
 */
export function formatTimeSpent(seconds: number): string {
  if (!seconds || seconds < 60) return 'menos de 1 min';

  // Se redondea el total y no el resto de la hora: 59 min 40 s son «1 h», no «60 min».
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** Nombre del PDF descargado, sin los signos que algunos sistemas no admiten en un archivo. */
export function certificateFileName(courseTitle: string): string {
  const name = courseTitle.replace(/[^\p{L}\p{N} _-]/gu, '').trim();
  return `Certificado-${name || 'curso'}.pdf`;
}
