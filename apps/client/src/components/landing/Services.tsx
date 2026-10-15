import { Award, BookOpen, ShieldCheck, Target, TrendingUp, Truck, Zap } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';
import { CARD_CLASS, REVEAL_STAGGER_S, SectionHeading } from './SectionParts';

const SERVICES = [
  {
    icon: Truck,
    title: 'Gestión de flotas',
    text: 'Control de vehículos, conductores y rutas con seguimiento y reportes automatizados.',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: ShieldCheck,
    title: 'Seguridad vial PESV',
    text: 'Implementación completa del Plan Estratégico de Seguridad Vial según la normativa vigente.',
    color: 'from-emerald-500 to-green-500',
  },
  {
    icon: BookOpen,
    title: 'Capacitación continua',
    text: 'Cursos certificados en seguridad vial, manejo defensivo y normatividad para todo el equipo.',
    color: 'from-purple-500 to-indigo-500',
  },
  {
    icon: Award,
    title: 'Certificaciones',
    text: 'Emisión automática de certificados verificables al completar cada programa de formación.',
    color: 'from-amber-500 to-orange-500',
  },
  {
    icon: Target,
    title: 'Auditorías y cumplimiento',
    text: 'Verificación del cumplimiento normativo con trazabilidad completa de cada capacitación.',
    color: 'from-rose-500 to-pink-500',
  },
  {
    icon: TrendingUp,
    title: 'Análisis y reportes',
    text: 'Métricas de desempeño, avance formativo y resultados de evaluación en tiempo real.',
    color: 'from-teal-500 to-cyan-500',
  },
] as const;

export function Services() {
  return (
    <section id="services" className="py-24 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <SectionHeading
          badge={{ icon: Zap, label: 'Nuestros servicios' }}
          title={
            <>
              Soluciones integrales en
              <br />
              <span className="text-primary">seguridad vial</span>
            </>
          }
          intro="Todo lo necesario para cumplir con la normativa PESV y proteger a tu equipo en las vías."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SERVICES.map((service, i) => (
            <Reveal key={service.title} delay={i * REVEAL_STAGGER_S}>
              <div
                className={`${CARD_CLASS} relative rounded-3xl p-8 overflow-hidden hover:shadow-xl hover:shadow-primary/15 hover:-translate-y-2`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10">
                  <div
                    className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${service.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 shadow-lg`}
                  >
                    <service.icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{service.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{service.text}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
