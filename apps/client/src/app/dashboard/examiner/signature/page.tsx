'use client';

import { Eye, FileSignature, Upload } from 'lucide-react';
import { useAlerts } from '@/contexts/AlertContext';
import { useDraft } from '@/hooks/useDraft';
import { usePendingFile } from '@/hooks/usePendingFile';
import { fileUrlFor } from '@/lib/api';
import { imageUploadWarning, uploadImage } from '@/lib/image-upload';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { UnsavedChangesBar } from '@/components/ui/UnsavedChangesBar';
import { PageHeading } from '../components/PageHeading';
import { useSignatureSettings, type SignatureDraft } from './useSignatureSettings';
import { SectionCard } from '@/components/ui/SectionCard';
import { SignatureImage } from './components/SignatureImage';
import { SignatureFields } from './components/SignatureFields';
import { SignaturePreview } from './components/SignaturePreview';

/** Firma, nombre y cargo con los que el examinador firma los certificados de sus cursos. */
export default function ExaminerSignature() {
  const { showAlert } = useAlerts();
  const signature = useSignatureSettings();
  const image = usePendingFile();

  const persist = (changes: Partial<SignatureDraft>) =>
    image.file
      ? image.commit(
          (file) => uploadImage(file, 'firmas'),
          (signatureUrl) => signature.persist({ ...changes, signatureUrl }),
        )
      : signature.persist(changes);

  const { draft, edit, save, hasChanges, saving } = useDraft(signature.saved, {
    persist,
    successMessage: 'Tu firma se actualizó correctamente.',
    hasPendingFiles: image.file !== null,
  });

  if (!draft) {
    return signature.error ? (
      <LoadFailed message={signature.error} onRetry={() => void signature.retry()} />
    ) : (
      <PageLoader message="Cargando tu firma…" />
    );
  }

  const imageUrl = image.previewUrl ?? fileUrlFor(draft.signatureUrl);

  const pickImage = (file: File) => {
    const warning = imageUploadWarning(file, 'firmas');
    if (warning) showAlert.error('No se pudo usar la imagen', warning);
    else image.pick(file);
  };

  const removeImage = () => {
    image.clear();
    edit({ signatureUrl: null });
  };

  return (
    <div className="space-y-8 pb-28 animate-in fade-in duration-300">
      <PageHeading
        icon={FileSignature}
        title="Mi firma"
        description="Configura tu firma escaneada, nombre y cargo para los certificados de tus cursos asignados."
      />

      <SectionCard icon={Upload} title="Imagen de firma escaneada" padded={false}>
        <SignatureImage imageUrl={imageUrl} disabled={saving} onPick={pickImage} onRemove={removeImage} />
      </SectionCard>

      <SectionCard icon={FileSignature} title="Datos de la firma" padded={false}>
        <SignatureFields draft={draft} fullName={signature.fullName} onChange={edit} />
      </SectionCard>

      <SectionCard icon={Eye} title="Vista previa de tu firma" padded={false}>
        <SignaturePreview
          imageUrl={imageUrl}
          name={draft.signatureName || signature.fullName}
          title={draft.signatureTitle}
        />
      </SectionCard>

      {hasChanges && <UnsavedChangesBar saving={saving} onSave={() => void save()} />}
    </div>
  );
}
