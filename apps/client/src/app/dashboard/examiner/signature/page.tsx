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
import { useSignatureSettings } from './useSignatureSettings';
import { SignatureSection } from './components/SignatureSection';
import { SignatureImage } from './components/SignatureImage';
import { SignatureFields } from './components/SignatureFields';
import { SignaturePreview } from './components/SignaturePreview';

/** Firma, nombre y cargo con los que el examinador firma los certificados de sus cursos. */
export default function ExaminerSignature() {
  const { showAlert } = useAlerts();
  const signature = useSignatureSettings();
  const image = usePendingFile();
  const { draft, edit, save, hasChanges, saving } = useDraft(signature.saved, {
    persist: signature.persist,
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

  const uploadPendingImage = async () => {
    if (!image.file) return {};
    const signatureUrl = await uploadImage(image.file, 'firmas');
    // Con la clave en el borrador, reintentar tras un fallo al guardar no vuelve a subirla.
    edit({ signatureUrl });
    image.clear();
    return { signatureUrl };
  };

  return (
    <div className="space-y-8 pb-28 animate-in fade-in duration-300">
      <PageHeading
        icon={FileSignature}
        title="Mi firma"
        description="Configura tu firma escaneada, nombre y cargo para los certificados de tus cursos asignados."
      />

      <SignatureSection icon={Upload} title="Imagen de firma escaneada">
        <SignatureImage imageUrl={imageUrl} onPick={pickImage} onRemove={removeImage} />
      </SignatureSection>

      <SignatureSection icon={FileSignature} title="Datos de la firma">
        <SignatureFields draft={draft} fullName={signature.fullName} onChange={edit} />
      </SignatureSection>

      <SignatureSection icon={Eye} title="Vista previa de tu firma">
        <SignaturePreview
          imageUrl={imageUrl}
          name={draft.signatureName || signature.fullName}
          title={draft.signatureTitle}
        />
      </SignatureSection>

      {hasChanges && <UnsavedChangesBar saving={saving} onSave={() => void save(uploadPendingImage)} />}
    </div>
  );
}
