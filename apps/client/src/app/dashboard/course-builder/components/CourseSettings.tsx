'use client';

import { useState, type ReactNode } from 'react';
import { Award, BookOpen, Clock, ListOrdered, Users, type LucideIcon } from 'lucide-react';
import { fileUrlFor } from '@/lib/api';
import { MAX_SCORE, MIN_SCORE } from '@/lib/grading';
import type { Course } from '@/types/models';
import type { CoverEditor } from '../useCoverEditor';
import { CoverField } from './CoverField';
import { isFieldError, parseCapacity, parseDurationHours, parsePassingScore, type FieldInput } from './course-fields';
import { saveNameOnBlur } from './names';

const INPUT =
  'bg-muted border border-border rounded-xl px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg transition-colors text-foreground read-only:opacity-60 read-only:cursor-not-allowed';

interface Props {
  course: Course;
  readOnly: boolean;
  cover: CoverEditor;
  onSave: (changes: Partial<Course>) => void;
  onRemoveCover: () => void;
}

/** Ajustes que no dependen de ningún módulo; cada campo se guarda al salir de él. */
export function CourseSettings({ course, readOnly, cover, onSave, onRemoveCover }: Props) {
  return (
    <div className="max-w-3xl mx-auto w-full flex flex-col items-center justify-center pt-10">
      <h2 className="text-2xl font-bold mb-8 text-foreground">Configuración general del curso</h2>

      <div className="w-full bg-card rounded-2xl shadow-sm border border-border p-4 sm:p-8 mb-8 flex flex-col items-start gap-6">
        <Setting
          icon={BookOpen}
          title="Nombre del curso"
          hint="Este nombre será visible para todos los usuarios matriculados."
        >
          <input
            type="text"
            defaultValue={course.title}
            readOnly={readOnly}
            aria-label="Nombre del curso"
            onBlur={saveNameOnBlur(course.title, (title) => onSave({ title }))}
            className={`w-full ${INPUT}`}
            placeholder="Ingresa el nombre del curso"
          />
        </Setting>

        <NumberSetting
          icon={Clock}
          title="Duración del programa"
          hint="Son las horas que acredita el certificado, no lo que tarde cada estudiante en completarlo. Si se deja vacío, el certificado acreditará una hora."
          unit="horas"
          placeholder="Ej: 8"
          min={1}
          max={1000}
          defaultValue={course.durationHours}
          readOnly={readOnly}
          parse={parseDurationHours}
          onSave={onSave}
        />

        <NumberSetting
          icon={Users}
          title="Cupo máximo de estudiantes"
          hint="Cuántos estudiantes puede haber matriculados a la vez. Déjalo vacío para no poner límite."
          unit="estudiantes"
          placeholder="Sin límite"
          min={1}
          defaultValue={course.maxStudents}
          readOnly={readOnly}
          parse={parseCapacity}
          onSave={onSave}
        />

        <NumberSetting
          icon={Award}
          title="Nota mínima para aprobar"
          hint="La que tiene que alcanzar cada tarea y cada cuestionario para darlos por superados."
          unit={`de ${MAX_SCORE}`}
          min={MIN_SCORE}
          max={MAX_SCORE}
          defaultValue={course.passingScore}
          readOnly={readOnly}
          parse={parsePassingScore}
          onSave={onSave}
        />

        <Setting
          icon={ListOrdered}
          title="Orden de los recursos"
          hint="Con el orden obligatorio, cada recurso se desbloquea al completar el anterior."
        >
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={course.strictOrder ?? true}
              disabled={readOnly}
              onChange={(e) => onSave({ strictOrder: e.target.checked })}
              className="h-5 w-5 accent-primary"
            />
            Obligar a seguir el orden del temario
          </label>
        </Setting>
      </div>

      <CoverField
        courseTitle={course.title}
        savedUrl={fileUrlFor(course.coverImage)}
        cover={cover}
        readOnly={readOnly}
        onRemove={onRemoveCover}
      />
    </div>
  );
}

interface SettingProps {
  icon: LucideIcon;
  title: string;
  hint: string;
  error?: string;
  children: ReactNode;
}

function Setting({ icon: Icon, title, hint, error, children }: SettingProps) {
  return (
    <div className="w-full">
      <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" /> {title}
      </h3>
      {children}
      {error ? (
        <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-400 mt-2">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground mt-2">{hint}</p>
      )}
    </div>
  );
}

interface NumberSettingProps extends Omit<SettingProps, 'error' | 'children'> {
  unit: string;
  placeholder?: string;
  min: number;
  max?: number;
  defaultValue: number | null | undefined;
  readOnly: boolean;
  parse: (typed: string) => FieldInput<Partial<Course>>;
  onSave: (changes: Partial<Course>) => void;
}

/** Campo numérico que se guarda al salir de él; lo que no vale se explica en lugar de guardarse. */
function NumberSetting({
  unit,
  placeholder,
  min,
  max,
  defaultValue,
  readOnly,
  parse,
  onSave,
  ...setting
}: NumberSettingProps) {
  const [error, setError] = useState('');

  return (
    <Setting {...setting} error={error}>
      <div className="flex items-center gap-3">
        <input
          type="number"
          min={min}
          max={max}
          step={1}
          defaultValue={defaultValue ?? ''}
          readOnly={readOnly}
          aria-label={setting.title}
          aria-invalid={error !== ''}
          placeholder={placeholder}
          onBlur={(e) => {
            const parsed = parse(e.target.value);
            if (isFieldError(parsed)) {
              setError(parsed.error);
              return;
            }
            setError('');
            onSave(parsed);
          }}
          className={`w-32 ${INPUT}`}
        />
        <span className="text-sm font-medium text-muted-foreground">{unit}</span>
      </div>
    </Setting>
  );
}
