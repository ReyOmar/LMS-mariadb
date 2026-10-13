'use client';

import type { ReactNode } from 'react';
import { Eye, Lock } from 'lucide-react';
import type { CourseEditor } from '@/lib/realtime/events';
import { USER_ROLE_LABEL } from '@/lib/labels';
import { useDialog } from '@/hooks/useDialog';

// Los avisos del constructor comparten marco para que ninguno parezca un error del sistema.

interface FrameProps {
  icon: ReactNode;
  iconClass: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  /** El aviso de curso ocupado se superpone a los demás. */
  priority?: boolean;
  /** Lo que hace Escape; sin él, el aviso sólo se cierra con sus botones. */
  onClose?: () => void;
}

function Frame({ icon, iconClass, title, children, actions, priority, onClose }: FrameProps) {
  const { dialogProps, titleId } = useDialog({ onClose });

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 ${priority ? 'z-[210]' : 'z-[200]'}`}
    >
      <div
        {...dialogProps}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200"
      >
        <div className="p-6 flex flex-col items-center text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${iconClass}`}>{icon}</div>
          <h3 id={titleId} className="text-xl font-bold text-foreground mb-2">
            {title}
          </h3>
          <div className="text-muted-foreground text-sm leading-relaxed">{children}</div>
        </div>
        <div className="px-6 pb-6">{actions}</div>
      </div>
    </div>
  );
}

interface ExitProps {
  /** Hay una portada elegida sin guardar, que se descartará al salir. */
  unsavedCover: boolean;
  onPublishAndExit: () => void;
  onExitWithoutPublishing: () => void;
  onCancel: () => void;
}

/** Se sale de un curso en borrador: nadie lo verá mientras siga así. */
export function DraftExitAlert({ unsavedCover, onPublishAndExit, onExitWithoutPublishing, onCancel }: ExitProps) {
  return (
    <Frame
      onClose={onCancel}
      icon={<Eye className="h-8 w-8 text-blue-500" />}
      iconClass="bg-blue-500/15"
      title="Curso en borrador"
      actions={
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onPublishAndExit}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl transition-colors shadow-md"
          >
            Publicar y salir
          </button>
          <button
            type="button"
            onClick={onExitWithoutPublishing}
            className="w-full bg-muted hover:bg-border text-foreground font-bold py-3 rounded-xl transition-colors"
          >
            Salir sin publicar
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full text-muted-foreground hover:text-foreground font-medium py-2 text-sm transition-colors"
          >
            Cancelar
          </button>
        </div>
      }
    >
      Este curso está en estado <strong className="text-foreground">Borrador</strong> y no será visible para los
      estudiantes.
      <br />
      <br />
      ¿Deseas publicarlo ahora para que sea accesible?
      {unsavedCover && (
        <>
          <br />
          <br />
          <strong className="text-foreground">La portada elegida no se ha guardado y se descartará.</strong>
        </>
      )}
    </Frame>
  );
}

interface BusyProps {
  courseTitle: string;
  editor: CourseEditor;
  exitText: string;
  /** Qué debe hacer quien lo lee; cambia según esté en el curso o dentro de un recurso. */
  note?: string;
  onExit: () => void;
}

/** Otra persona tiene el curso abierto: se evita que dos ediciones se pisen. */
export function CourseInUseAlert({
  courseTitle,
  editor,
  exitText,
  note = 'En breve podrás acceder nuevamente cuando termine la edición.',
  onExit,
}: BusyProps) {
  return (
    <Frame
      priority
      icon={<Lock className="h-8 w-8 text-red-500" />}
      iconClass="bg-red-500/15"
      title="Curso en edición"
      actions={
        <button
          type="button"
          onClick={onExit}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl transition-colors shadow-md"
        >
          {exitText}
        </button>
      }
    >
      El{' '}
      <strong className="text-foreground">
        {USER_ROLE_LABEL[editor.role]} {editor.name}
      </strong>{' '}
      está editando el curso <strong className="text-foreground">{courseTitle}</strong>.
      <br />
      <br />
      {note}
    </Frame>
  );
}
