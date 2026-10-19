import { ToggleLeft } from 'lucide-react';
import type { CertificateSettings, CertificateToggle } from '../certificate';
import { SectionCard } from '@/components/ui/SectionCard';
import { ToggleRow } from './ToggleRow';

const TOGGLES: { key: CertificateToggle; label: string; description: string }[] = [
  {
    key: 'certShowEnrollmentDate',
    label: 'Mostrar fecha de inscripción',
    description: 'Incluye la fecha en la que el estudiante fue matriculado o inició el curso.',
  },
  {
    key: 'certShowModules',
    label: 'Mostrar cantidad de módulos',
    description: 'Muestra la cantidad de módulos del curso en la fila de métricas.',
  },
  {
    key: 'certShowResources',
    label: 'Mostrar cantidad de recursos',
    description: 'Muestra el total de recursos formativos en la fila de métricas.',
  },
  {
    key: 'certShowScore',
    label: 'Mostrar calificación promedio',
    description: 'Incluye la calificación promedio obtenida por el estudiante.',
  },
  {
    key: 'certShowSignature',
    label: 'Mostrar área de firma',
    description: 'Incluye la firma del examinador asignado al curso.',
  },
];

interface Props {
  settings: CertificateSettings;
  onChange: (changes: Partial<CertificateSettings>) => void;
}

export function VisibleElements({ settings, onChange }: Props) {
  return (
    <SectionCard icon={ToggleLeft} title="Elementos visibles">
      <div className="space-y-3">
        {TOGGLES.map(({ key, label, description }) => (
          <ToggleRow
            key={key}
            label={label}
            description={description}
            checked={settings[key]}
            onChange={(checked) => onChange({ [key]: checked })}
          />
        ))}
      </div>
    </SectionCard>
  );
}
