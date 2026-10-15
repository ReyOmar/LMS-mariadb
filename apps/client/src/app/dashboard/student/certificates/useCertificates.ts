'use client';

import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useInFlight } from '@/hooks/useInFlight';
import { useLiveData } from '@/hooks/useLiveData';
import type { Certificate } from '@/types/models';
import { certificateFileName } from './certificate-text';

/** Curso terminado cuyo certificado espera a que el examinador califique alguna tarea. */
export interface CourseAwaitingGrading {
  courseGuid: string;
  courseTitle: string;
  pendingAssignments: { title: string }[];
}

const CERTIFICATE_EVENTS = ['certificate:new', 'submission:graded'] as const;

/** Safari todavía no ha leído el PDF al volver de `click()`: revocarlo al momento cancela la descarga. */
const DOWNLOAD_URL_LIFETIME_MS = 60_000;

async function fetchOverview() {
  const [earned, awaiting] = await Promise.all([
    api.get<Certificate[]>('/certificates'),
    api.get<CourseAwaitingGrading[]>('/certificates/awaiting-grading'),
  ]);
  return { certificates: earned.data, awaitingGrading: awaiting.data };
}

function saveFile(content: Blob, fileName: string): void {
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
}

/** Los certificados del alumno, los cursos que esperan nota para tenerlo y su descarga en PDF. */
export function useCertificates() {
  const { showAlert, notify } = useAlerts();
  const downloading = useInFlight<string>();
  const overview = useLiveData(fetchOverview, 'No se pudieron obtener tus certificados.', CERTIFICATE_EVENTS);

  const download = (certificate: Certificate) =>
    downloading.run(certificate.guid, async () => {
      try {
        const { data } = await api.get<Blob>(`/certificates/${certificate.guid}/pdf`, { responseType: 'blob' });
        saveFile(new Blob([data], { type: 'application/pdf' }), certificateFileName(certificate.courseTitle));
        notify.success('El archivo PDF se ha descargado correctamente.');
      } catch (failure) {
        showAlert.error('Error al descargar', errorMessage(failure, 'No se pudo descargar el certificado.'));
      }
    });

  return {
    certificates: overview.data?.certificates ?? [],
    awaitingGrading: overview.data?.awaitingGrading ?? [],
    loading: overview.loading,
    error: overview.error,
    retry: overview.retry,
    download,
    isDownloading: downloading.has,
  };
}
