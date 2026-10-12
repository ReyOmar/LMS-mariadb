import { CalendarClock } from 'lucide-react';
import type { CertificateSettings } from '../certificate';
import { INPUT_CLASS, SettingsCard } from './SettingsCard';

/** El tope que admite la API: cincuenta años. */
const MAX_VALIDITY_MONTHS = 600;

interface Props {
  months: CertificateSettings['certValidityMonths'];
  onChange: (months: number | null) => void;
}

export function ValiditySettings({ months, onChange }: Props) {
  return (
    <SettingsCard icon={CalendarClock} title="Vigencia del certificado">
      <label htmlFor="cert-validity" className="block text-sm font-bold text-foreground mb-1.5">
        Meses que acredita
      </label>
      <div className="flex items-center gap-3">
        <input
          id="cert-validity"
          type="number"
          min={0}
          max={MAX_VALIDITY_MONTHS}
          value={months ?? ''}
          onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
          placeholder="Sin caducidad"
          className={`${INPUT_CLASS} w-40`}
        />
        <span className="text-sm font-medium text-muted-foreground">meses</span>
      </div>
      <div className="mt-3 space-y-2 text-xs text-muted-foreground">
        <p>
          <strong className="text-foreground">Lo normal es dejarlo vacío.</strong> Un certificado acredita que esa
          persona completó la formación en una fecha, y ese hecho no caduca: si lo presenta seis meses después, debe
          seguir sirviendo.
        </p>
        <p>
          Ponle un plazo sólo si una norma exige renovar la capacitación cada cierto tiempo. Con un plazo corto, quien
          presente su certificado pasado ese tiempo lo verá marcado como vencido.
        </p>
        <p>
          En cualquier caso, volver a inscribir a alguien en el mismo curso no depende de esto: se puede hacer cuando
          haga falta, y al terminarlo recibirá un certificado nuevo. El anterior se conserva y su código sigue
          verificándose.
        </p>
      </div>
    </SettingsCard>
  );
}
