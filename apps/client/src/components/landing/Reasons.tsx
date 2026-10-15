import { Heart, Route, Shield, Zap } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';
import { CARD_CLASS, IconTile, REVEAL_STAGGER_S, SectionHeading } from './SectionParts';

const REASONS = [
  {
    icon: Route,
    title: 'Experiencia en ruta',
    text: 'Más de 10 años formando conductores profesionales con programas probados en campo.',
  },
  {
    icon: Shield,
    title: 'Normativa al día',
    text: 'Contenido actualizado según las últimas resoluciones de seguridad vial de cada país.',
  },
  {
    icon: Zap,
    title: 'Plataforma en línea',
    text: 'Capacitación digital, accesible desde cualquier dispositivo y en cualquier momento.',
  },
  {
    icon: Heart,
    title: 'Compromiso real',
    text: 'Cada conductor capacitado es una familia más segura. Esa es la razón de todo lo demás.',
  },
] as const;

export function Reasons() {
  return (
    <section id="about" className="py-24 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <SectionHeading
          title={
            <>
              ¿Por qué <span className="text-primary">elegirnos</span>?
            </>
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {REASONS.map((reason, i) => (
            <Reveal key={reason.title} delay={i * REVEAL_STAGGER_S}>
              <div className={`${CARD_CLASS} flex gap-5 p-6 rounded-2xl hover:-translate-y-1`}>
                <IconTile icon={reason.icon} size="sm" />
                <div>
                  <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors">{reason.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{reason.text}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
