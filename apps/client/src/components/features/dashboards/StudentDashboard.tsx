'use client';

import { BookOpen, Clock, GraduationCap } from 'lucide-react';
import { HighlightedStat } from '@/components/ui/HighlightedStat';
import { PageLoader } from '@/components/ui/PageLoader';
import { plural } from '@/lib/text';
import type { StudentMetrics } from '@/types/models';
import { activeCoursesDetail, summarizeCourses, type CourseSummary } from './student/courses';
import { useStudentDashboard } from './student/useStudentDashboard';
import { useActivityCalendar } from './student/useActivityCalendar';
import { ContinueLearningCard } from './student/ContinueLearningCard';
import { ActivityCalendar } from './student/ActivityCalendar';

export function StudentDashboard() {
  const { user, courses, metrics, loading } = useStudentDashboard();
  const calendar = useActivityCalendar(user?.guid);

  if (loading) return <PageLoader message="Cargando tu tablero…" />;

  const summary = summarizeCourses(courses);

  return (
    <div className="animate-fade-slide-in">
      {/* Cabecera */}
      <header className="mb-8">
        <p className="text-sm font-medium text-muted-foreground mb-1">Hola,</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{user?.firstName || 'Estudiante'} 👋</h1>
      </header>

      {/* Rejilla principal: continuar aprendiendo y calendario */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <ContinueLearningCard summary={summary} />
        <ActivityCalendar calendar={calendar} />
      </div>

      <StudentStats metrics={metrics} summary={summary} assigned={courses.length} />
    </div>
  );
}

/** Tiempo de estudio, cursos completados y cursos activos. */
function StudentStats({
  metrics,
  summary,
  assigned,
}: {
  metrics: StudentMetrics | null;
  summary: CourseSummary;
  /** Cursos que tiene asignados, por si las cifras aún no lo dicen. */
  assigned: number;
}) {
  const totalCourses = metrics?.totalCourses ?? assigned;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <HighlightedStat
        label="Tiempo de estudio"
        value={Math.round(Number(metrics?.totalHoursSpent ?? 0) * 10) / 10}
        suffix="h"
        icon={<Clock className="h-5 w-5" />}
        color="info"
        className="stagger-5 animate-fade-slide-in"
      />
      <HighlightedStat
        label="Cursos completados"
        value={metrics?.completedCourses ?? 0}
        detail={
          totalCourses > 0 ? { text: `de ${totalCourses} ${plural(totalCourses, 'asignado', 'asignados')}` } : undefined
        }
        icon={<GraduationCap className="h-5 w-5" />}
        color="success"
        className="stagger-6 animate-fade-slide-in"
      />
      <HighlightedStat
        label="Cursos activos"
        value={summary.active.length}
        detail={activeCoursesDetail(summary, assigned)}
        icon={<BookOpen className="h-5 w-5" />}
        color="primary"
        className="stagger-7 animate-fade-slide-in"
      />
    </div>
  );
}
