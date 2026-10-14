import type { MonitoredStudent } from '@/types/models';
import { averageScore } from '@/lib/grading';
import type { ClosedRound } from '../../closed-round';

/**
 * El monitoreo sigue la formación en curso: al certificarse, el alumno deja de contar en ese curso
 * y, sin otro en curso, sale de la lista. Sus entregas no vienen por curso: su total espera a la
 * siguiente carga.
 */
export function withoutClosedRound(students: MonitoredStudent[], round: ClosedRound): MonitoredStudent[] {
  return students.flatMap((student) => {
    if (student.guid !== round.userGuid) return [student];

    const courses = student.courses.filter((course) => course.courseGuid !== round.courseGuid);
    if (courses.length === student.courses.length) return [student];
    if (courses.length === 0) return [];
    return [{ ...student, courses, progress: Math.round(averageScore(courses.map((course) => course.percent)) ?? 0) }];
  });
}
