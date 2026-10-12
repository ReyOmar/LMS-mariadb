import { BookOpen, Info, Palette } from 'lucide-react';
import type { CertificateSettings } from '../certificate';
import { useCertificateSample } from '../useCertificateSample';
import { CertificatePreview, type Brand } from './CertificatePreview';
import { INPUT_CLASS, SettingsCard } from './SettingsCard';
import { SignerDetails } from './SignerDetails';

export function PreviewSettings({ settings, brand }: { settings: CertificateSettings; brand: Brand }) {
  const sample = useCertificateSample();

  return (
    <SettingsCard icon={Palette} title="Vista previa">
      <div className="space-y-4">
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-blue-700 dark:text-blue-400">Datos del examinador</p>
            <p className="text-xs text-blue-700/80 dark:text-blue-400/80 mt-0.5">
              La firma, nombre y cargo del firmante se obtienen automáticamente de la configuración del examinador
              asignado a cada curso. Selecciona un curso para previsualizar cómo quedaría el certificado con sus datos.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="cert-preview-course" className="block text-sm font-bold text-foreground mb-1.5">
            <BookOpen className="h-4 w-4 inline mr-1.5 relative -top-[1px]" />
            Seleccionar curso para vista previa
          </label>
          <select
            id="cert-preview-course"
            value={sample.courseGuid}
            onChange={(event) => sample.setCourseGuid(event.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">— Selecciona un curso —</option>
            {sample.courses.map((course) => (
              <option key={course.guid} value={course.guid}>
                {course.title}
              </option>
            ))}
          </select>
        </div>

        {sample.signer && <SignerDetails teacher={sample.signer.teacher} />}

        <CertificatePreview settings={settings} brand={brand} signer={sample.signer} />
        <p className="text-xs text-muted-foreground text-center">
          Vista previa con datos de ejemplo. Los cambios se aplican a los certificados que se emitan a partir de ahora.
        </p>
      </div>
    </SettingsCard>
  );
}
