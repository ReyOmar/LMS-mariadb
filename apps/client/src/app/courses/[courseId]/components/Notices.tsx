'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Award, Clock, Eye, Sparkles, Trophy, X } from 'lucide-react';
import { plural } from '@/lib/text';
import { useDialog } from '@/hooks/useDialog';

/**
 * Los momentos en que el visor de curso deja de mostrar contenido y habla con el alumno:
 * el curso se cerró para mantenimiento, ya lo terminó, acaba de terminarlo, o ha llegado
 * al final pero le faltan tareas por calificar.
 *
 * Comparten el molde de tarjeta centrada para que ninguno parezca un error del sistema:
 * todos son situaciones normales del recorrido.
 */

// ── Pantallas completas ────────────────────────────────────────────────────

function Card({ children, border }: { children: ReactNode; border: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
      <div className={`max-w-lg w-full bg-card border rounded-3xl overflow-hidden shadow-xl relative ${border}`}>
        {children}
      </div>
    </div>
  );
}

function BackToMyCourses({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/dashboard/student/courses"
      className={`inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm transition-colors ${className}`}
    >
      <ArrowLeft className="h-4 w-4" /> Volver a mis cursos
    </Link>
  );
}

/** El examinador pasó el curso a borrador: el contenido sigue ahí, pero no se puede avanzar. */
export function CourseUnderMaintenance({ title }: { title: string }) {
  return (
    <Card border="border-amber-500/30">
      <div className="p-12 text-center">
        <div className="w-24 h-24 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
          <AlertTriangle className="h-12 w-12 text-amber-500" />
        </div>
        <h1 className="text-3xl font-black mb-4 text-foreground tracking-tight">Curso en mantenimiento</h1>
        <p className="text-muted-foreground mb-2 text-lg leading-relaxed">
          El administrador o examinador ha iniciado un período de mantenimiento para el curso{' '}
          <strong className="text-foreground">{title}</strong>.
        </p>
        <p className="text-muted-foreground mb-10 text-sm">
          Todos los contenidos se conservan intactos. Vuelve más tarde cuando el curso sea publicado de nuevo.
        </p>
        <Link
          href="/dashboard/student/courses"
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 rounded-2xl font-bold shadow-lg transition-all hover:scale-105 active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
          Volver a mis cursos
        </Link>
      </div>
    </Card>
  );
}

/** El alumno ya tiene certificado: puede repasar el contenido, pero no repetir el avance. */
export function CourseAlreadyEnded({
  title,
  onViewOnly,
  onViewCertificate,
}: {
  title: string;
  onViewOnly: () => void;
  onViewCertificate: () => void;
}) {
  return (
    <Card border="border-emerald-500/30">
      <button
        type="button"
        onClick={onViewOnly}
        className="absolute top-4 right-4 z-20 p-2 rounded-xl bg-background/80 hover:bg-muted border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Cerrar"
      >
        <X className="h-5 w-5" />
      </button>

      <Header
        background="from-emerald-500/15 via-primary/10 to-emerald-500/5"
        bar="from-emerald-400 via-primary to-emerald-500"
        circle="from-emerald-500/20 to-primary/20"
        icon={<Trophy className="h-12 w-12 text-emerald-500" />}
        title="¡Curso finalizado!"
        description="Ya completaste exitosamente el curso"
        name={title}
        nameClass="text-emerald-700 dark:text-emerald-400"
      />

      <div className="p-8 text-center">
        <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
          Tu certificado de finalización ya fue generado. Puedes descargarlo o revisitar el contenido del curso en modo
          de solo lectura.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={onViewCertificate}
            className="w-full sm:flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-4 rounded-2xl transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 text-sm"
          >
            <Award className="h-5 w-5" /> Ver mi certificado
          </button>
          <button
            type="button"
            onClick={onViewOnly}
            className="w-full sm:flex-1 bg-muted hover:bg-border text-foreground font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm"
          >
            <Eye className="h-5 w-5" /> Repasar el contenido
          </button>
        </div>

        <BackToMyCourses className="mt-5" />
      </div>
    </Card>
  );
}

// ── Diálogos sobre el curso ────────────────────────────────────────────────

function Header({
  background,
  bar,
  circle,
  icon,
  title,
  description,
  name,
  nameClass,
  titleId,
}: {
  background: string;
  bar: string;
  circle: string;
  icon: ReactNode;
  title: string;
  description: string;
  name: string;
  nameClass: string;
  /** Cuando la cabecera encabeza una ventana, el título le da nombre. */
  titleId?: string;
}) {
  return (
    <div className={`relative bg-gradient-to-br p-10 text-center overflow-hidden ${background}`}>
      <div className={`absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r ${bar}`} />
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-primary/5 rounded-full" />
      <div className="absolute -bottom-8 -left-8 w-28 h-28 bg-emerald-500/5 rounded-full" />

      <div className="relative z-10">
        <div
          className={`w-24 h-24 bg-gradient-to-br rounded-full flex items-center justify-center mx-auto mb-5 ring-4 ring-background shadow-xl ${circle}`}
          style={{ animation: 'bounce 2s infinite' }}
        >
          {icon}
        </div>
        <div className="flex items-center justify-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <h2 id={titleId} className="text-2xl font-black text-foreground">
            {title}
          </h2>
          <Sparkles className="h-5 w-5 text-amber-500" />
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
        <p className={`font-bold text-lg mt-1 ${nameClass}`}>{name}</p>
      </div>
    </div>
  );
}

function Background({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 p-4">
      {children}
    </div>
  );
}

/** Papelillos de la celebración. Son decorativos, así que no reciben eventos del ratón. */
function Confetti() {
  const colors = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

  return (
    <>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 50 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: '-5%',
              backgroundColor: colors[i % colors.length],
              animation: `confettiFall ${2 + Math.random() * 3}s ease-in-out ${Math.random() * 2}s infinite`,
              opacity: 0.8,
              width: `${4 + Math.random() * 8}px`,
              height: `${4 + Math.random() * 8}px`,
              borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </>
  );
}

/** Acaba de terminar el curso. Las acciones aparecen con retardo, para que se lea el aviso. */
export function Celebration({
  title,
  actionsVisible,
  onKeepGoing,
  onViewCertificate,
}: {
  title: string;
  actionsVisible: boolean;
  onKeepGoing: () => void;
  onViewCertificate: () => void;
}) {
  const { dialogProps, titleId } = useDialog({ onClose: onKeepGoing });

  return (
    <Background>
      <Confetti />

      {/* Hasta que aparecen las acciones no hay nada que enfocar y el foco queda en la tarjeta. */}
      <div
        {...dialogProps}
        className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300 relative z-10 outline-none"
      >
        <Header
          background="from-primary/20 via-primary/10 to-emerald-500/10"
          bar="from-primary via-amber-500 to-emerald-500"
          circle="from-primary/20 to-emerald-500/20"
          icon={<Award className="h-12 w-12 text-primary" />}
          title="¡Felicidades!"
          description="Has completado exitosamente el curso"
          name={title}
          nameClass="text-primary"
          titleId={titleId}
        />

        <div
          inert={!actionsVisible}
          className="p-6 text-center transition-all duration-700 ease-out"
          style={{
            opacity: actionsVisible ? 1 : 0,
            transform: actionsVisible ? 'translateY(0)' : 'translateY(12px)',
            maxHeight: actionsVisible ? '300px' : '0px',
            overflow: 'hidden',
            padding: actionsVisible ? undefined : '0 1.5rem',
          }}
        >
          <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
            Tu certificado de finalización ya ha sido generado y está disponible para descargar en formato PDF.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onKeepGoing}
              className="flex-1 bg-muted hover:bg-border text-foreground font-bold py-3.5 rounded-xl transition-colors text-sm"
            >
              Seguir en el curso
            </button>
            <button
              type="button"
              onClick={onViewCertificate}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3.5 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2 text-sm"
            >
              <Award className="h-4 w-4" /> Ver certificado
            </button>
          </div>
        </div>
      </div>
    </Background>
  );
}

/** Terminó el contenido pero el examinador aún no ha calificado todo. */
export function UngradedAssignments({
  assignments,
  onAcknowledge,
  onGoToMessages,
}: {
  assignments: { title: string }[];
  onAcknowledge: () => void;
  onGoToMessages: () => void;
}) {
  const { dialogProps, titleId } = useDialog({ onClose: onAcknowledge });

  return (
    <Background>
      <div
        {...dialogProps}
        className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300"
      >
        <div className="relative bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-orange-500/10 p-8 text-center overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500" />
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-amber-500/5 rounded-full" />

          <div className="relative z-10">
            <div className="w-20 h-20 bg-amber-500/15 rounded-full flex items-center justify-center mx-auto mb-4 ring-4 ring-background shadow-xl">
              <Clock className="h-10 w-10 text-amber-500" />
            </div>
            <h2 id={titleId} className="text-xl font-black text-foreground mb-2">
              Contenido completado
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Has terminado todos los recursos, pero hay tareas pendientes de calificación.
            </p>
          </div>
        </div>

        <div className="p-6">
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-5">
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-2">
              ⏳ {assignments.length} {plural(assignments.length, 'tarea', 'tareas')} esperando calificación:
            </p>
            <ul className="space-y-1.5">
              {assignments.map((assignment, i) => (
                <li key={`${assignment.title}-${i}`} className="text-xs text-muted-foreground flex items-center gap-2">
                  <Clock className="h-3 w-3 text-amber-500 shrink-0" />
                  <span className="font-medium text-foreground">{assignment.title}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-muted-foreground text-sm mb-6 leading-relaxed text-center">
            Tu certificado se generará <strong className="text-foreground">automáticamente</strong> cuando el examinador
            califique todas las tareas pendientes. Puedes comunicarte con él a través de la sección de mensajes.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onAcknowledge}
              className="flex-1 bg-muted hover:bg-border text-foreground font-bold py-3.5 rounded-xl transition-colors text-sm"
            >
              Entendido
            </button>
            <button
              type="button"
              onClick={onGoToMessages}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold py-3.5 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2 text-sm"
            >
              Ir a mensajes
            </button>
          </div>
        </div>
      </div>
    </Background>
  );
}
