import { Award, BookOpen, Star, Truck } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';
import { CARD_CLASS, IconTile, REVEAL_STAGGER_S, SectionHeading } from './SectionParts';

const FEATURES = [
  {
    icon: Truck,
    title: 'Constructor de cursos',
    text: 'Módulos, recursos y evaluaciones organizados de forma visual, sin conocimientos técnicos.',
  },
  {
    icon: BookOpen,
    title: 'Cuestionarios evaluados',
    text: 'Corrección automática en el servidor, control de intentos y límite de tiempo por examen.',
  },
  {
    icon: Award,
    title: 'Certificados verificables',
    text: 'Cada certificado lleva un código con el que cualquier tercero puede comprobar su validez.',
  },
] as const;

export function Features() {
  return (
    <section id="features" className="py-24 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <SectionHeading
          badge={{ icon: Star, label: 'La plataforma' }}
          title={
            <>
              Diseñada para <span className="text-primary">capacitar</span>
            </>
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={i * REVEAL_STAGGER_S}>
              <div className={`${CARD_CLASS} rounded-3xl p-8 hover:-translate-y-2`}>
                <IconTile icon={feature.icon} size="lg" className="mb-6" />
                <h3 className="text-xl font-bold mb-3 group-hover:text-primary transition-colors">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
