'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api, { errorMessage, uploadFile } from '@/lib/api';
import { fileSizeWarning, type UploadLimit } from '@/lib/upload-limits';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import type { Submission } from '@/types/models';
import { fileTypeWarning } from './allowed-files';

export type UploadStatus = 'idle' | 'uploading' | 'done';

interface Options {
  resourceGuid: string;
  /** El mismo límite que aplicará el servidor. */
  limit: UploadLimit | null;
  onFinish: () => void;
  onAccessError?: (error: unknown, title: string) => boolean;
}

/** La entrega del alumno en una tarea: la que ya hizo, la subida de una nueva y su calificación. */
export function useAssignmentSubmission({ resourceGuid, limit, onFinish, onAccessError }: Options) {
  const [loading, setLoading] = useState(true);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);

  // La pantalla del curso pasa una función nueva en cada render. Si la carga dependiera de
  // ella, una tarea calificada avisaría al curso, el curso se volvería a pintar y la carga
  // se repetiría sin fin.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const onAccessErrorRef = useRef(onAccessError);
  onAccessErrorRef.current = onAccessError;

  const loadState = useCallback(async () => {
    try {
      const { data } = await api.get<Submission>(`/assessments/assignments/${resourceGuid}/submissions/mine`);
      if (data?.status && data.status !== 'PENDING') {
        setSubmission(data);
        setUploadStatus('done');
        if (data.status === 'GRADED') onFinishRef.current();
      }
    } catch (error) {
      // Un rechazo de acceso lo atiende el curso; con cualquier otro queda la zona de subida.
      onAccessErrorRef.current?.(error, 'No se pudo cargar tu entrega');
    } finally {
      setLoading(false);
    }
  }, [resourceGuid]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  // El examinador puede calificar mientras el alumno tiene la página abierta.
  useRealtimeEvent('submission:graded', (data) => {
    if ((data as { assignmentGuid?: string })?.assignmentGuid === resourceGuid) void loadState();
  });

  const submit = async (file: File) => {
    // Con una entrega subiendo no se empieza otra: soltar un archivo encima no la sustituye.
    if (uploadStatus === 'uploading') return;
    setUploadError(null);

    const warning = fileTypeWarning(file.name) ?? fileSizeWarning(file, limit);
    if (warning) {
      setUploadError(warning);
      return;
    }

    try {
      setUploadStatus('uploading');
      setUploadProgress(0);
      const data = await uploadFile<Submission>(`/assessments/assignments/${resourceGuid}/submissions`, file, {
        limit,
        onProgress: setUploadProgress,
      });
      setSubmission(data);
      setUploadStatus('done');
      onFinish();
    } catch (error) {
      // Si ya había una entrega, sigue siendo la válida: se vuelve a mostrar con el aviso.
      setUploadStatus(submission ? 'done' : 'idle');
      if (onAccessErrorRef.current?.(error, 'No se pudo subir la entrega')) return;
      setUploadError(errorMessage(error, 'No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo.'));
    }
  };

  return { loading, uploadStatus, uploadProgress, uploadError, submission, submit };
}
