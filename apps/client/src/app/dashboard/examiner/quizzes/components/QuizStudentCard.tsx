'use client';

import { ChevronDown, History, RotateCcw } from 'lucide-react';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';
import { MAX_SCORE, scoreColor } from '@/lib/grading';
import { dateTime } from '@/lib/dates';
import { initials, plural } from '@/lib/text';
import type { QuizAttempt } from '../../types';
import { getAttemptScore, releasableAttempt, type StudentWithAttempts } from './results';

interface Props {
  student: StudentWithAttempts;
  threshold: number;
  /** Los del cuestionario; sin la cifra (`null`) no se ofrece habilitar otro. */
  allowedAttempts: number | null;
  expanded: boolean;
  onToggle: () => void;
  onReleaseAttempt: (attempt: QuizAttempt) => void;
}

/** Un alumno dentro de un cuestionario: su mejor nota y, al desplegarlo, todos sus intentos. */
export function QuizStudentCard({ student, threshold, allowedAttempts, expanded, onToggle, onReleaseAttempt }: Props) {
  const { country } = useCountry();
  const score = student.bestScore;
  const passed = score !== null && score >= threshold;
  const releasable = releasableAttempt(student, threshold, allowedAttempts);
  const tone = passed ? 'passed' : 'failed';

  return (
    <div
      className={`bg-background border rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md ${CARD_BORDER[tone]}`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="w-full text-left p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
      >
        <span className="flex-1 min-w-0 flex items-center gap-3">
          <span
            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow-inner ${AVATAR[tone]}`}
          >
            {initials(student.student?.firstName, student.student?.lastName)}
          </span>
          <span className="truncate flex-1">
            <span className="block font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">
              {student.student?.firstName} {student.student?.lastName}
            </span>
            <span className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
              <History className="h-3 w-3" /> {formatNumber(student.attemptCount, country)}{' '}
              {plural(student.attemptCount, 'intento realizado', 'intentos realizados')}
            </span>
          </span>
        </span>

        <span className="shrink-0 flex items-center gap-4">
          <ScoreBadge score={score} threshold={threshold} large />
          <ChevronDown
            className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {expanded && (
        <div className="bg-muted/10 border-t border-border/50 p-4 animate-in slide-in-from-top-2 duration-300">
          <AttemptHistory student={student} threshold={threshold} />

          {releasable && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => onReleaseAttempt(releasable)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:border-primary/50 hover:text-primary transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Habilitar otro intento
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const CARD_BORDER = { passed: 'border-emerald-500/30', failed: 'border-red-500/30' };

const AVATAR = {
  passed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-400',
};

function AttemptHistory({ student, threshold }: { student: StudentWithAttempts; threshold: number }) {
  return (
    <>
      <h5 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-4 px-2">
        Historial de intentos
      </h5>
      <ol className="space-y-3 relative ml-4 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border/50 before:to-transparent">
        {student.attempts.map((attempt, index) => (
          <li key={attempt.guid} className="relative flex items-center gap-3 pl-4">
            <span className="absolute left-0 -translate-x-1/2 flex items-center justify-center w-8 h-8 rounded-full border-4 border-card bg-background text-muted-foreground shadow-sm z-10 text-[10px] font-bold">
              #{student.attemptCount - index}
            </span>
            <div className="flex-1 ml-4 p-3 rounded-xl bg-card border border-border/50 shadow-sm flex items-center justify-between hover:border-primary/30 transition-colors">
              <span className="text-xs text-muted-foreground font-medium">{dateTime(attempt.submittedAt)}</span>
              <ScoreBadge score={getAttemptScore(attempt)} threshold={threshold} />
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

function ScoreBadge({ score, threshold, large = false }: { score: number | null; threshold: number; large?: boolean }) {
  const { country } = useCountry();
  if (score === null) return <span className="text-sm font-bold text-muted-foreground">—</span>;

  const background = score >= threshold ? 'bg-emerald-500/10' : 'bg-red-500/10';
  const color = scoreColor(score, threshold);
  return (
    <span
      className={`flex items-center gap-1 ${background} ${large ? 'px-4 py-2 rounded-xl' : 'px-2.5 py-1 rounded-md'}`}
    >
      <span className={`font-black ${large ? 'text-lg' : 'text-sm'} ${color}`}>{formatNumber(score, country)}</span>
      {large && <span className={`text-xs font-bold hidden sm:inline opacity-60 ${color}`}>/ {MAX_SCORE}</span>}
    </span>
  );
}
