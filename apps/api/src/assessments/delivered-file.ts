import { Submission } from '@prisma/client';
import { StorageService } from '../storage/storage.service';

/**
 * El archivo entregado, como URL firmada y caducable y nunca como clave suelta: la clave sola
 * permitiría a cualquiera descargarlo. Ninguna si se retiró al emitirse el certificado.
 */
export function deliveredFileUrl(
  storage: StorageService,
  submission: Pick<Submission, 'attachmentKey' | 'attachmentName' | 'filePurged'>,
): string | null {
  if (submission.filePurged || !submission.attachmentKey) return null;
  return storage.downloadUrl(submission.attachmentKey, submission.attachmentName);
}
