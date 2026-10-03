'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle,
  Heart,
  Mail,
  MapPin,
  Phone,
  Route,
  Shield,
  ShieldCheck,
  Star,
  Target,
  TrendingUp,
  Truck,
  Users,
  Zap,
} from 'lucide-react';
import { useConfig } from '@/contexts/ConfigContext';
import { useCountry } from '@/contexts/CountryContext';
import { fileUrlFor } from '@/lib/api';
import { COUNTRY_INFO } from '@/lib/country';
import { publicContact } from '@/lib/landing';
import { Reveal } from '@/components/ui/Reveal';
import { CountryIndicator } from '@/components/features/CountryIndicator';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { PageLoader } from '@/components/ui/PageLoader';

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

/** Columnas de la rejilla de contacto según cuántas tarjetas hay, para que queden centradas. */
const CONTACT_COLUMNS: Record<number, string> = {
  1: 'max-w-sm mx-auto',
  2: 'md:grid-cols-2 max-w-3xl mx-auto',
  3: 'md:grid-cols-3',
};

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

export default function LandingPage() {
  const { config } = useConfig();
  const { country, ready } = useCountry();
  const [hasShadow, setHasShadow] = useState(false);

  useEffect(() => {
    const onScroll = () => setHasShadow(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Mientras se lee la sede guardada no se pinta nada: mostrar una sede y cambiarla al
  // instante siguiente sería peor que esperar un momento.
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <PageLoader message="Cargando campus…" />
      </div>
    );
  }

  const platformName = config?.platformName ?? 'PESV Education';
  const logo = fileUrlFor(config?.logoUrl);

  // Sólo se publican los datos de contacto que la sede ha rellenado de verdad.
  const contacts = [
    { icon: Phone, title: 'Teléfono', value: config?.landingPhone, detail: config?.landingPhoneSub },
    { icon: Mail, title: 'Correo', value: config?.landingEmail, detail: config?.landingEmailSub },
    { icon: MapPin, title: 'Oficina', value: config?.landingOffice, detail: config?.landingOfficeSub },
  ]
    .map((contact) => ({
      ...contact,
      value: publicContact(contact.value, country),
      detail: publicContact(contact.detail, country),
    }))
    .filter((contact) => contact.value !== null);

  return (
    <div className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-primary/8 blur-[80px] animate-[floatBg_12s_ease-in-out_infinite] motion-reduce:animate-none will-change-transform" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[400px] h-[400px] rounded-full bg-primary/8 blur-[80px] animate-[floatBg_15s_ease-in-out_infinite_reverse] motion-reduce:animate-none will-change-transform" />
      </div>

      <header
        className={`fixed top-0 w-full z-50 transition-all duration-500 ${
          hasShadow ? 'bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-sm' : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 font-bold text-xl text-primary min-w-0">
            {logo ? (
              <img src={logo} alt="" className="max-h-12 max-w-[40px] object-contain" />
            ) : (
              <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
                <Truck className="h-5 w-5 text-primary-foreground" />
              </div>
            )}
            <span className="hidden sm:inline truncate">{platformName}</span>
          </div>

          <nav className="flex items-center gap-4 md:gap-8 text-sm font-medium text-muted-foreground">
            <a href="#services" className="hidden md:inline hover:text-primary transition-colors">
              Servicios
            </a>
            <a href="#features" className="hidden md:inline hover:text-primary transition-colors">
              Plataforma
            </a>
            {contacts.length > 0 && (
              <a href="#contact" className="hidden md:inline hover:text-primary transition-colors">
                Contacto
              </a>
            )}

            <CountryIndicator />

            <Link
              href="/login"
              className="bg-primary text-primary-foreground px-5 md:px-6 py-2.5 rounded-xl font-bold hover:bg-primary/90 transition-all hover:scale-105 shadow-lg shadow-primary/25 whitespace-nowrap"
            >
              Ingresar <ArrowRight className="inline h-4 w-4 ml-1" />
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Portada */}
        <section className="relative min-h-screen flex items-center justify-center px-6 pt-20">
          <div className="absolute bottom-0 left-0 w-full h-32 overflow-hidden opacity-10" aria-hidden="true">
            <div className="flex gap-8 animate-[slideRoad_3s_linear_infinite] motion-reduce:animate-none">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="w-20 h-2 bg-primary rounded-full shrink-0" />
              ))}
            </div>
          </div>

          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-primary mb-8">
              <CountryFlag country={country} size="sm" />
              Sede {COUNTRY_INFO[country].name}
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.1] mb-8">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-foreground via-foreground to-foreground/70">
                {config?.landingHeroTitle1 ?? 'Transporte Seguro,'}
              </span>
              <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-primary to-primary/70">
                {config?.landingHeroTitle2 ?? 'Personal Capacitado'}
              </span>
            </h1>

            <p className="max-w-2xl mx-auto text-lg md:text-xl text-muted-foreground leading-relaxed mb-12">
              {config?.landingHeroSubtitle ??
                'Plataforma integral para la gestión del Plan Estratégico de Seguridad Vial.'}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/login"
                className="group inline-flex h-14 items-center justify-center rounded-2xl bg-primary px-10 text-base font-bold text-primary-foreground shadow-xl shadow-primary/30 hover:shadow-2xl hover:shadow-primary/40 transition-all hover:scale-105"
              >
                Comenzar ahora
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="#services"
                className="inline-flex h-14 items-center justify-center rounded-2xl border-2 border-border bg-card/50 backdrop-blur-sm px-10 text-base font-bold text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all"
              >
                Conocer más
              </a>
            </div>

            <div className="mt-16 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              {[
                { icon: CheckCircle, text: 'Certificación verificable' },
                { icon: Shield, text: 'Cumplimiento PESV' },
                { icon: Users, text: 'Capacitación en línea' },
              ].map((badge) => (
                <div
                  key={badge.text}
                  className="flex items-center gap-2 bg-card/50 backdrop-blur-sm border border-border/50 px-4 py-2 rounded-full"
                >
                  <badge.icon className="h-4 w-4 text-primary" />
                  <span className="font-medium">{badge.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Servicios */}
        <section id="services" className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <Reveal className="text-center mb-16">
              <div className="inline-flex items-center gap-2 bg-primary/5 border border-primary/20 text-primary text-sm font-bold px-4 py-1.5 rounded-full mb-4">
                <Zap className="h-4 w-4" /> Nuestros servicios
              </div>
              <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                Soluciones integrales en
                <br />
                <span className="text-primary">seguridad vial</span>
              </h2>
              <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">
                Todo lo necesario para cumplir con la normativa PESV y proteger a tu equipo en las vías.
              </p>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {SERVICES.map((service, i) => (
                <Reveal key={service.title} delay={i * 0.08}>
                  <div className="group relative bg-card/50 backdrop-blur-md border border-border/50 rounded-3xl p-8 hover:border-primary/50 hover:shadow-[0_0_30px_-5px_rgba(59,130,246,0.3)] transition-all duration-500 hover:-translate-y-2 overflow-hidden h-full">
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

        {/* Por qué nosotros */}
        <section id="about" className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <Reveal className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                ¿Por qué <span className="text-primary">elegirnos</span>?
              </h2>
            </Reveal>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {REASONS.map((reason, i) => (
                <Reveal key={reason.title} delay={i * 0.1}>
                  <div className="group flex gap-5 p-6 rounded-2xl bg-card/50 backdrop-blur-md border border-border/50 hover:border-primary/50 transition-all duration-500 hover:-translate-y-1 h-full">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary transition-all duration-500">
                      <reason.icon className="h-6 w-6 text-primary group-hover:text-primary-foreground transition-colors duration-500" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors">
                        {reason.title}
                      </h3>
                      <p className="text-muted-foreground leading-relaxed">{reason.text}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Características */}
        <section id="features" className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <Reveal className="text-center mb-16">
              <div className="inline-flex items-center gap-2 bg-primary/5 border border-primary/20 text-primary text-sm font-bold px-4 py-1.5 rounded-full mb-4">
                <Star className="h-4 w-4" /> La plataforma
              </div>
              <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                Diseñada para <span className="text-primary">capacitar</span>
              </h2>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {FEATURES.map((feature, i) => (
                <Reveal key={feature.title} delay={i * 0.12}>
                  <div className="group bg-card/50 backdrop-blur-md border border-border/50 rounded-3xl p-8 hover:border-primary/50 transition-all duration-500 hover:-translate-y-2 h-full">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary transition-all duration-500">
                      <feature.icon className="h-8 w-8 text-primary group-hover:text-primary-foreground transition-colors duration-500" />
                    </div>
                    <h3 className="text-xl font-bold mb-3 group-hover:text-primary transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">{feature.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Contacto: sólo si la sede tiene algún dato publicado */}
        {contacts.length > 0 && (
          <section id="contact" className="py-24 px-6 bg-gradient-to-b from-transparent to-muted/30">
            <div className="max-w-6xl mx-auto">
              <Reveal className="text-center mb-16">
                <h2 className="text-3xl md:text-5xl font-black tracking-tight">Contáctanos</h2>
                <p className="mt-4 text-muted-foreground text-lg">Datos de la sede de {COUNTRY_INFO[country].name}.</p>
              </Reveal>

              <div className={`grid grid-cols-1 gap-6 ${CONTACT_COLUMNS[contacts.length]}`}>
                {contacts.map((contact, i) => (
                  <Reveal key={contact.title} delay={i * 0.1}>
                    <div className="group text-center bg-card/50 backdrop-blur-md border border-border/50 rounded-3xl p-8 hover:border-primary/50 transition-all duration-500 hover:-translate-y-2 h-full flex flex-col items-center justify-center">
                      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary transition-all duration-500">
                        <contact.icon className="h-6 w-6 text-primary group-hover:text-primary-foreground transition-colors duration-500" />
                      </div>
                      <h3 className="font-bold text-lg group-hover:text-primary transition-colors">{contact.title}</h3>
                      <p className="text-primary font-bold mt-2 text-lg break-all">{contact.value}</p>
                      {contact.detail && <p className="text-sm text-muted-foreground mt-1">{contact.detail}</p>}
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 font-bold text-xl text-primary mb-4">
                {logo ? (
                  <img src={logo} alt="" className="max-h-10 max-w-[40px] object-contain" />
                ) : (
                  <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
                    <Truck className="h-5 w-5 text-primary-foreground" />
                  </div>
                )}
                {platformName}
              </div>
              <p className="text-muted-foreground max-w-sm leading-relaxed">
                {config?.landingFooterText ??
                  'Plataforma de capacitación y certificación en seguridad vial para empresas de transporte.'}
              </p>
              <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
                <CountryFlag country={country} size="sm" /> Sede {COUNTRY_INFO[country].name}
              </p>
            </div>

            <div>
              <h4 className="font-bold mb-4">Plataforma</h4>
              <div className="space-y-3 text-sm text-muted-foreground">
                <a href="#services" className="block hover:text-primary transition-colors">
                  Servicios
                </a>
                <a href="#features" className="block hover:text-primary transition-colors">
                  Características
                </a>
                <Link href="/login" className="block hover:text-primary transition-colors">
                  Iniciar sesión
                </Link>
              </div>
            </div>

            <div>
              <h4 className="font-bold mb-4">Legal</h4>
              <div className="space-y-3 text-sm text-muted-foreground">
                <Link href="/legal#privacy" className="block hover:text-primary transition-colors">
                  Política de privacidad
                </Link>
                <Link href="/legal#terms" className="block hover:text-primary transition-colors">
                  Términos de uso
                </Link>
                <Link href="/legal#data" className="block hover:text-primary transition-colors">
                  Protección de datos
                </Link>
                <Link href="/verify" className="block hover:text-primary transition-colors">
                  Verificar certificado
                </Link>
              </div>
            </div>
          </div>

          <div className="border-t border-border/40 pt-8 flex flex-col md:flex-row justify-between items-center text-sm text-muted-foreground gap-3">
            <p>
              © {new Date().getFullYear()} {platformName}. Todos los derechos reservados.
            </p>
            <p className="flex items-center gap-1">
              <Shield className="h-4 w-4 text-primary" /> Comprometidos con la seguridad vial
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
