import type { ReactNode } from 'react';
import type { SignatureDraft } from '../useSignatureSettings';

export const DEFAULT_SIGNATURE_TITLE = 'Instructor / examinador del curso';

interface Props {
  draft: SignatureDraft;
  /** Nombre registrado, que se usa si el de la firma se deja vacío. */
  fullName: string;
  onChange: (changes: Partial<SignatureDraft>) => void;
}

/** Nombre y cargo que se imprimen bajo la firma. */
export function SignatureFields({ draft, fullName, onChange }: Props) {
  return (
    <div className="p-6 space-y-4">
      <TextField
        id="signature-name"
        label="Nombre que aparecerá en la firma"
        value={draft.signatureName}
        onChange={(signatureName) => onChange({ signatureName })}
        placeholder={fullName}
        hint={
          <>
            Si lo dejas vacío, se usará tu nombre registrado: <strong>{fullName}</strong>
          </>
        }
      />
      <TextField
        id="signature-title"
        label="Cargo / título profesional"
        value={draft.signatureTitle}
        onChange={(signatureTitle) => onChange({ signatureTitle })}
        placeholder={DEFAULT_SIGNATURE_TITLE}
        hint="Ej.: Ing. de seguridad vial, capacitador PESV, etc."
      />
    </div>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hint: ReactNode;
}

function TextField({ id, label, value, onChange, placeholder, hint }: TextFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-foreground mb-1.5">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={191}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
      />
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}
