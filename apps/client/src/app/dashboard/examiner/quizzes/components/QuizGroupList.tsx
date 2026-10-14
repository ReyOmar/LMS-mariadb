'use client';

import { useMemo } from 'react';
import { AlertCircle, BookMarked } from 'lucide-react';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';
import { EmptyState } from '@/components/ui/EmptyState';
import { ActivityGroup, ModuleGroup, useExpandedGroups } from '../../components/GroupAccordion';
import type { QuizAttempt } from '../../types';
import { QuizStudentCard } from './QuizStudentCard';
import { groupByModuleAndQuiz, type StudentWithAttempts } from './results';

interface Props {
  attempts: QuizAttempt[];
  threshold: number;
  onReleaseAttempt: (student: StudentWithAttempts, attempt: QuizAttempt) => void;
}

/** Intentos cargados del curso, plegados en módulo → cuestionario → alumno. */
export function QuizGroupList({ attempts, threshold, onReleaseAttempt }: Props) {
  const { country } = useCountry();
  const modules = useMemo(() => groupByModuleAndQuiz(attempts), [attempts]);
  const expandedModules = useExpandedGroups();
  const expandedQuizzes = useExpandedGroups();
  const expandedStudents = useExpandedGroups();

  if (modules.length === 0) {
    return (
      <EmptyState
        className="bg-card border border-dashed border-border rounded-2xl"
        icon={<AlertCircle className="h-10 w-10" />}
        title="Sin resultados"
        description="No se encontraron cuestionarios que coincidan con los filtros."
      />
    );
  }

  return (
    <div className="space-y-6">
      {modules.map((courseModule) => (
        <ModuleGroup
          key={courseModule.key}
          title={courseModule.moduleTitle}
          icon={<BookMarked className="h-5 w-5" />}
          subtitle={
            <>
              Promedio del módulo:{' '}
              <strong className="text-primary">{formatNumber(courseModule.average, country)}</strong>
            </>
          }
          open={expandedModules.isOpen(courseModule.key)}
          onToggle={() => expandedModules.toggle(courseModule.key)}
        >
          {courseModule.assignments.map((quiz) => {
            const quizKey = `${courseModule.key}-${quiz.key}`;
            return (
              <ActivityGroup
                key={quiz.key}
                title={quiz.assignmentTitle}
                aside={
                  <span className="text-xs font-bold bg-muted px-3 py-1 rounded-full text-muted-foreground">
                    Promedio: {formatNumber(quiz.average, country)}
                  </span>
                }
                open={expandedQuizzes.isOpen(quizKey)}
                onToggle={() => expandedQuizzes.toggle(quizKey)}
              >
                {quiz.students.map((student) => {
                  const studentKey = `${quizKey}-${student.student?.guid ?? 'unknown'}`;
                  return (
                    <QuizStudentCard
                      key={studentKey}
                      student={student}
                      threshold={threshold}
                      allowedAttempts={quiz.allowedAttempts}
                      expanded={expandedStudents.isOpen(studentKey)}
                      onToggle={() => expandedStudents.toggle(studentKey)}
                      onReleaseAttempt={(attempt) => onReleaseAttempt(student, attempt)}
                    />
                  );
                })}
              </ActivityGroup>
            );
          })}
        </ModuleGroup>
      ))}
    </div>
  );
}
