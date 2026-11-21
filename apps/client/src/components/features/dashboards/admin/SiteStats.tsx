'use client';

import { AlertCircle, BookOpen, GraduationCap, Users } from 'lucide-react';
import { HighlightedStat } from '@/components/ui/HighlightedStat';
import { formatPoints } from '@/lib/grading';
import { plural } from '@/lib/text';
import type { CountrySummary } from '@/types/models';
import { averageLabel, averageTone } from './average';

/** Las cuatro cifras de la sede, cada una con el enlace a la pantalla donde se gestiona. */
export function SiteStats({ stats, count }: { stats: CountrySummary | null; count: (value: number) => string }) {
  const pendingRequests = stats?.pendingRequests ?? 0;
  const average = stats?.overallAverage ?? null;
  const users = stats?.users;
  const courses = stats?.courses;
  const students = users?.students ?? 0;
  const teachers = users?.teachers ?? 0;
  const admins = users?.admins ?? 0;
  const published = courses?.published ?? 0;
  const drafts = courses?.draft ?? 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
      <HighlightedStat
        label="Usuarios totales"
        value={users?.total ?? 0}
        icon={<Users className="h-5 w-5" />}
        color="primary"
        detail={{
          text: `${count(students)} ${plural(students, 'estudiante', 'estudiantes')} · ${count(teachers)} ${plural(teachers, 'examinador', 'examinadores')} · ${count(admins)} ${plural(admins, 'administrador', 'administradores')}`,
        }}
        href="/dashboard/admin/users"
        className="stagger-1 animate-fade-slide-in"
      />
      <HighlightedStat
        label="Cursos"
        value={published + drafts}
        icon={<BookOpen className="h-5 w-5" />}
        color="info"
        detail={{
          text: `${count(published)} ${plural(published, 'publicado', 'publicados')} · ${count(drafts)} en borrador`,
        }}
        href="/dashboard/course-builder"
        className="stagger-2 animate-fade-slide-in"
      />
      <HighlightedStat
        label="Solicitudes pendientes"
        value={pendingRequests}
        icon={<AlertCircle className="h-5 w-5" />}
        color={pendingRequests > 0 ? 'warning' : 'success'}
        detail={
          pendingRequests > 0
            ? { text: 'Requieren revisión', tone: 'warning' }
            : { text: 'Todo al día', tone: 'success' }
        }
        href="/dashboard/admin/access-requests"
        className="stagger-3 animate-fade-slide-in"
      />
      <HighlightedStat
        label="Calificación media"
        value={average === null ? 0 : Number(formatPoints(average))}
        suffix=" / 100"
        icon={<GraduationCap className="h-5 w-5" />}
        color="accent"
        detail={{ text: averageLabel(average), tone: averageTone(average) }}
        className="stagger-4 animate-fade-slide-in"
      />
    </div>
  );
}
