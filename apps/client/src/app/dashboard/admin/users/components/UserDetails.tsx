'use client';

import Link from 'next/link';
import { BookOpen, Loader2, Mail, Pencil, Trash2, X } from 'lucide-react';
import type { User } from '@/types/models';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { LastAccess } from '@/components/ui/LastAccess';
import { CourseStatusBadge } from '@/components/ui/CourseStatusBadge';
import { ROLE_STYLE } from '@/lib/role-style';
import { USER_ROLE_LABEL } from '@/lib/labels';
import { shortDate } from '@/lib/dates';
import { useDialog } from '@/hooks/useDialog';
import { courseDate, coursesHeading, emptyCoursesLink, type AssignedCourse } from './accounts';

interface Props {
  user: User;
  courses: AssignedCourse[];
  loadingCourses: boolean;
  isSelf: boolean;
  onClose: () => void;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
}

export function UserDetails({ user, courses, loadingCourses, isSelf, onClose, onEdit, onDelete }: Props) {
  const heading = coursesHeading(user.role);
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
            <UserAvatar person={user} role={user.role} size="lg" />
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
            <button
              type="button"
              onClick={() => onEdit(user)}
              className="p-2 hover:bg-primary/10 hover:text-primary rounded-xl transition-colors text-muted-foreground"
              title="Editar"
              aria-label="Editar cuenta"
            >
              <Pencil className="h-5 w-5" />
            </button>
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

        <div className={`grid ${user.role === 'ADMIN' ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'} gap-4 mb-6`}>
          <Field title="Rol">
            <p className={`text-sm font-bold ${ROLE_STYLE[user.role].text}`}>{USER_ROLE_LABEL[user.role]}</p>
          </Field>

          <Field title="Fecha de registro">
            <p className="text-sm font-bold">{shortDate(user.createdAt)}</p>
          </Field>

          <Field title="Seguridad">
            <p
              className={`text-sm font-bold ${user.usesDefaultPassword ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}
            >
              {user.usesDefaultPassword ? 'Clave temporal' : '✓ Clave propia'}
            </p>
          </Field>

          <Field title="Último acceso">
            <div className="mt-1">
              <LastAccess guid={user.guid} date={user.lastAccessAt} />
            </div>
          </Field>

          <Field title={heading}>
            <p className="text-sm font-bold">{loadingCourses ? '...' : courses.length}</p>
          </Field>
        </div>

        <div>
          <h3 className="text-sm font-bold uppercase text-muted-foreground tracking-wider mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> {heading}
          </h3>

          {loadingCourses ? (
            <div className="text-center py-6 text-muted-foreground text-sm flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando cursos…
            </div>
          ) : courses.length === 0 ? (
            <NoCourses user={user} heading={heading} />
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {courses.map((course) => (
                <CourseRow key={course.guid} user={user} course={course} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NoCourses({ user, heading }: { user: User; heading: string }) {
  const link = emptyCoursesLink(user.role);
  return (
    <div className="text-center py-6 bg-muted/10 rounded-xl border border-border/50">
      <p className="text-sm text-muted-foreground">Esta cuenta no tiene {heading.toLowerCase()}.</p>
      {link && (
        <Link href={link.href} className="text-xs text-primary font-bold hover:underline mt-2 inline-block">
          {link.label}
        </Link>
      )}
    </div>
  );
}

/** Del examinador se puede saltar a la asignación de cada curso; del resto no hay adónde ir. */
function CourseRow({ user, course }: { user: User; course: AssignedCourse }) {
  const navigable = user.role === 'TEACHER';
  const { label, date } = courseDate(user.role, course);
  const className = `flex items-center justify-between p-3 bg-muted/10 rounded-xl border border-border/30 transition-colors ${navigable ? 'cursor-pointer hover:border-primary hover:bg-primary/5' : 'hover:border-primary/30'}`;

  const content = (
    <>
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center">
          <BookOpen className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-bold">{course.title}</p>
          <p className="text-xs text-muted-foreground">
            {label}: {shortDate(date)}
          </p>
        </div>
      </div>
      <CourseStatusBadge status={course.status} className="text-xs px-2 py-1 rounded-lg" />
    </>
  );

  return navigable ? (
    <Link href={`/dashboard/admin/course-assignment?course=${encodeURIComponent(course.guid)}`} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
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
