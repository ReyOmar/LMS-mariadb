'use client';

import { useState } from 'react';
import { BookOpen, Clock, Download, Image as ImageIcon, Loader2, Trash2, UploadCloud, Users } from 'lucide-react';
import { fileUrlFor } from '@/lib/api';
import type { Course } from '@/types/models';
import { parseCapacity } from './capacity';

interface Props {
  course: Course;
  readOnly: boolean;
  uploadingCover: boolean;
  onSave: (changes: Partial<Course>) => void;
  onUploadCover: (file: File) => void;
  onRemoveCover: () => void;
}

/** Ajustes que no dependen de ningún módulo: nombre, duración, cupo y portada. */
export function CourseSettings({ course, readOnly, uploadingCover, onSave, onUploadCover, onRemoveCover }: Props) {
  const cover = course.coverImage ? (fileUrlFor(course.coverImage) ?? '') : '';
  const [capacityError, setCapacityError] = useState('');

  return (
    <div className="max-w-3xl mx-auto w-full flex flex-col items-center justify-center pt-10">
      <h2 className="text-2xl font-bold mb-8 text-foreground">Configuración general del curso</h2>

      <div className="w-full bg-card rounded-2xl shadow-sm border border-border p-4 sm:p-8 mb-8 flex flex-col items-start gap-4">
        <div className="w-full">
          <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> Nombre del curso
          </h3>
          <input
            type="text"
            defaultValue={course.title}
            readOnly={readOnly}
            aria-label="Nombre del curso"
            onBlur={(e) => onSave({ title: e.target.value })}
            className={`w-full bg-muted border border-border rounded-xl px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg transition-colors text-foreground ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
            placeholder="Ingresa el nombre del curso"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Este nombre será visible para todos los usuarios matriculados.
          </p>
        </div>

        <div className="w-full">
          <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" /> Duración del programa
          </h3>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={999}
              defaultValue={course.durationHours ?? ''}
              readOnly={readOnly}
              aria-label="Duración del programa en horas"
              onBlur={(e) => {
                const hours = Number(e.target.value);
                onSave({ durationHours: Number.isFinite(hours) && hours > 0 ? Math.round(hours) : null });
              }}
              className={`w-32 bg-muted border border-border rounded-xl px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg transition-colors text-foreground ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
              placeholder="Ej: 8"
            />
            <span className="text-sm font-medium text-muted-foreground">horas</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Son las horas que <strong>acredita el certificado</strong>, no lo que tarde cada estudiante en completarlo.
            Si se deja vacío, el certificado acreditará una hora.
          </p>
        </div>

        <div className="w-full">
          <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Cupo máximo de estudiantes
          </h3>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              step={1}
              defaultValue={course.maxStudents ?? ''}
              readOnly={readOnly}
              aria-label="Cupo máximo de estudiantes"
              aria-invalid={capacityError !== ''}
              onBlur={(e) => {
                const capacity = parseCapacity(e.target.value);
                if ('error' in capacity) {
                  setCapacityError(capacity.error);
                  return;
                }
                setCapacityError('');
                onSave(capacity);
              }}
              className={`w-32 bg-muted border border-border rounded-xl px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg transition-colors text-foreground ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
              placeholder="Sin límite"
            />
            <span className="text-sm font-medium text-muted-foreground">estudiantes</span>
          </div>
          {capacityError ? (
            <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-400 mt-2">
              {capacityError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-2">
              Cuántos estudiantes puede haber matriculados a la vez. Déjalo vacío para no poner límite.
            </p>
          )}
        </div>
      </div>

      <div className="w-full bg-card rounded-2xl shadow-sm border border-border p-4 sm:p-8 mb-8 flex flex-col items-center">
        <h3 className="text-lg font-bold mb-4 w-full text-left">Portada del curso</h3>
        <div className="w-full max-w-md h-56 bg-muted rounded-xl border-2 border-dashed border-border flex items-center justify-center relative overflow-hidden group">
          {cover ? (
            <>
              <img src={cover} alt={`Portada de ${course.title}`} className="w-full h-full object-cover" />
              <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                <a
                  href={cover}
                  download
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg shadow-md transition-colors"
                  title="Descargar portada"
                >
                  <Download className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemoveCover();
                  }}
                  className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-md transition-colors"
                  title="Eliminar portada"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center text-muted-foreground opacity-60">
              <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
              <span className="text-sm font-medium">Sin portada</span>
            </div>
          )}

          {/* Mientras se sube la portada la capa queda a la vista: si sólo apareciera al pasar
              el ratón, la subida no daría ninguna señal. */}
          <label
            className={`absolute inset-0 bg-background/60 transition-opacity flex flex-col items-center justify-center cursor-pointer backdrop-blur-[2px] ${
              uploadingCover ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            {uploadingCover ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                <span className="font-bold text-foreground">Subiendo portada…</span>
              </>
            ) : (
              <>
                <UploadCloud className="h-8 w-8 text-primary mb-2" />
                <span className="font-bold text-foreground">Subir nueva portada</span>
                <span className="text-xs text-muted-foreground mt-1">PNG, JPG recomendado</span>
              </>
            )}
            <input
              type="file"
              className="hidden"
              accept="image/*"
              disabled={uploadingCover || readOnly}
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Se limpia el input para que subir dos veces el mismo archivo vuelva a disparar el cambio.
                e.target.value = '';
                if (file) onUploadCover(file);
              }}
            />
          </label>
        </div>
        <p className="text-center w-full mt-6 text-sm text-muted-foreground">
          Esta imagen se mostrará en los tableros de los estudiantes, examinadores y administradores.
        </p>
      </div>
    </div>
  );
}
