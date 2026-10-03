'use client';

import Link from 'next/link';
import { BookOpen, Loader2, Mail, Trash2, X } from 'lucide-react';
import type { CourseStatus, User } from '@/types/models';
import { AccountAvatar } from './AccountAvatar';
import { LastAccess } from '@/components/ui/LastAccess';
import { managesCourses, ROLE_DISPLAY, type AssignedCourse } from './accounts';
import { shortDate } from '@/lib/dates';
import { COURSE_STATUS_LABEL } from '@/lib/labels';
import { useDialog } from '@/hooks/useDialog';

interface Props {
  user: User;
  courses: AssignedCourse[];
  loadingCourses: boolean;
  /** La propia cuenta no se puede eliminar desde aquí. */
  isSelf: boolean;
  onClose: () => void;
  onDelete: (user: User) => void;
}

const STATUS_COLOR: Record<CourseStatus, string> = {
  PUBLISHED: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  DRAFT: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  ARCHIVED: 'bg-muted text-muted-foreground',
};

/**
 * Ficha de una cuenta: sus datos y los cursos que imparte o cursa.
 *
 * Quien crea cursos ve «Cursos Creados» y quien los recibe «Cursos Matriculados»; es la
 * misma lista leída desde los dos lados de la relación.
 */
export function UserDetails({ user, courses, loadingCourses, isSelf, onClose, onDelete }: Props) {
  const isAdmin = user.role === 'ADMIN';
  const createsCourses = managesCourses(user.role);
  const coursesHeading = createsCourses ? 'Cursos creados' : 'Cursos matriculados';
  // Del examinador se puede saltar a su asignación; del resto no hay adónde ir.
  const coursesNavigable = user.role === 'TEACHER';
  const { dialogProps, titleId } = useDialog({ onClose });

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-end sm:items-start justify-center sm:pt-24 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        {...dialogProps}
        className="bg-card border border-border/50 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg p-6 sm:p-8 max-h-[90dvh] overflow-y-auto animate-in slide-in-from-bottom-4 duration-300"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <AccountAvatar user={user} size="lg" />
            <div>
              <h2 id={titleId} className="text-xl font-bold">
                {user.firstName} {user.lastName}
              </h2>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" /> {user.email}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isSelf && (
              <button
                type="button"
                onClick={() => onDelete(user)}
                className="p-2 hover:bg-red-500/10 hover:text-red-500 rounded-xl transition-colors text-muted-foreground"
                title="Eliminar cuenta"
                aria-label="Eliminar cuenta"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-xl transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className={`grid ${isAdmin ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'} gap-4 mb-6`}>
          <Field title="Rol">
            <p className={`text-sm font-bold ${ROLE_DISPLAY[user.role].text}`}>{ROLE_DISPLAY[user.role].label}</p>
          </Field>

          <Field title="Fecha de registro">
            <p className="text-sm font-bold">{shortDate(user.createdAt)}</p>
          </Field>

          <Field title="Seguridad">
            <p
              className={`text-sm font-bold ${user.usesDefaultPassword ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}
            >
              {user.usesDefaultPassword ? '⚠ Sin clave' : '✓ Con clave'}
            </p>
          </Field>

          <Field title="Último Acceso">
            <div className="mt-1">
              <LastAccess guid={user.guid} date={user.lastAccessAt} />
            </div>
          </Field>

          <Field title={coursesHeading}>
            <p className="text-sm font-bold">{loadingCourses ? '...' : courses.length}</p>
          </Field>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase text-muted-foreground tracking-wider mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> {coursesHeading}
          </h3>

          {loadingCourses ? (
            <div className="text-center py-6 text-muted-foreground text-sm flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando cursos…
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-6 bg-muted/10 rounded-xl border border-border/50">
              <p className="text-sm text-muted-foreground">
                Este usuario no tiene cursos {createsCourses ? 'creados' : 'matriculados'}.
              </p>
              {createsCourses && (
                <Link
                  href="/dashboard/course-builder"
                  className="text-xs text-primary font-bold hover:underline mt-2 inline-block"
                >
                  Ir a gestión de cursos para {isAdmin ? 'crear' : 'asignar'} →
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {courses.map((course) => {
                const rowClass = `flex items-center justify-between p-3 bg-muted/10 rounded-xl border border-border/30 transition-colors ${coursesNavigable ? 'cursor-pointer hover:border-primary hover:bg-primary/5' : 'hover:border-primary/30'}`;
                const content = (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center">
                        <BookOpen className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">{course.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {coursesNavigable ? 'Asignado' : isAdmin ? 'Creado' : 'Matriculado'}:{' '}
                          {shortDate(course.assignedAt || course.updatedAt || course.createdAt)}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${STATUS_COLOR[course.status]}`}>
                      {COURSE_STATUS_LABEL[course.status]}
                    </span>
                  </>
                );

                return coursesNavigable ? (
                  <Link
                    key={course.guid}
                    href={`/dashboard/admin/course-assignment?course=${course.guid}`}
                    className={rowClass}
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={course.guid} className={rowClass}>
                    {content}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-muted/20 rounded-xl p-4">
      <p className="text-xs text-muted-foreground font-bold uppercase mb-1">{title}</p>
      {children}
    </div>
  );
}
