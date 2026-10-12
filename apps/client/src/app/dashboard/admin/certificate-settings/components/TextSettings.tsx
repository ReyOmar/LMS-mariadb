import { AlignLeft, Type } from 'lucide-react';
import { CERTIFICATE_TEXT, MAX_LEGAL_TEXT_LENGTH, type CertificateSettings } from '../certificate';
import { INPUT_CLASS, SettingsCard } from './SettingsCard';

/** El tope de la columna en la base de datos. */
const MAX_HEADING_LENGTH = 191;

interface Props {
  settings: CertificateSettings;
  onChange: (changes: Partial<CertificateSettings>) => void;
}

export function TitleSettings({ settings, onChange }: Props) {
  return (
    <SettingsCard icon={Type} title="Título del certificado">
      <div className="space-y-4">
        <div>
          <label htmlFor="cert-title" className="block text-sm font-bold text-foreground mb-1.5">
            Título principal
          </label>
          <input
            id="cert-title"
            type="text"
            value={settings.certCustomTitle ?? ''}
            onChange={(event) => onChange({ certCustomTitle: event.target.value })}
            placeholder={CERTIFICATE_TEXT.title}
            maxLength={MAX_HEADING_LENGTH}
            className={INPUT_CLASS}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Déjalo vacío para usar «{CERTIFICATE_TEXT.title}» por defecto.
          </p>
        </div>
        <div>
          <label htmlFor="cert-subtitle" className="block text-sm font-bold text-foreground mb-1.5">
            Subtítulo
          </label>
          <input
            id="cert-subtitle"
            type="text"
            value={settings.certSubtitle ?? ''}
            onChange={(event) => onChange({ certSubtitle: event.target.value })}
            placeholder={CERTIFICATE_TEXT.subtitle}
            maxLength={MAX_HEADING_LENGTH}
            className={INPUT_CLASS}
          />
        </div>
      </div>
    </SettingsCard>
  );
}

export function LegalTextSettings({ settings, onChange }: Props) {
  const length = settings.certLegalText?.length ?? 0;

  return (
    <SettingsCard icon={AlignLeft} title="Texto descriptivo / legal">
      <textarea
        aria-label="Texto descriptivo o legal del certificado"
        value={settings.certLegalText ?? ''}
        onChange={(event) => onChange({ certLegalText: event.target.value })}
        placeholder="El presente certificado acredita que el participante cumplió satisfactoriamente..."
        rows={4}
        maxLength={MAX_LEGAL_TEXT_LENGTH}
        className={`${INPUT_CLASS} resize-none text-sm`}
      />
      <div className="flex items-start justify-between gap-3 mt-1.5">
        <p className="text-xs text-muted-foreground">
          Si lo dejas vacío, se generará automáticamente con la cantidad de módulos y recursos del curso.
        </p>
        <span className="text-xs tabular-nums shrink-0 text-muted-foreground">
          {length} / {MAX_LEGAL_TEXT_LENGTH}
        </span>
      </div>
    </SettingsCard>
  );
}
