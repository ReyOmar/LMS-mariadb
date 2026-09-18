'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle,
  Globe,
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
import { useSede } from '@/contexts/SedeContext';
import { urlDeArchivo } from '@/lib/api';
import { PAISES, SEDES } from '@/lib/pais';
import { FadeIn } from '@/components/ui/FadeIn';
import { SelectorDeSede } from '@/components/features/SelectorDeSede';
import { IndicadorDeSede } from '@/components/features/IndicadorDeSede';
import { PageLoader } from '@/components/ui/PageLoader';

const SERVICIOS = [
  {
    icon: Truck,
    titulo: 'Gestión de Flotas',
    texto: 'Control de vehículos, conductores y rutas con seguimiento y reportes automatizados.',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: ShieldCheck,
    titulo: 'Seguridad Vial PESV',
    texto: 'Implementación completa del Plan Estratégico de Seguridad Vial según la normativa vigente.',
    color: 'from-emerald-500 to-green-500',
  },
  {
    icon: BookOpen,
    titulo: 'Capacitación Continua',
    texto: 'Cursos certificados en seguridad vial, manejo defensivo y normatividad para todo el equipo.',
    color: 'from-purple-500 to-indigo-500',
  },
  {
    icon: Award,
    titulo: 'Certificaciones',
    texto: 'Emisión automática de certificados verificables al completar cada programa de formación.',
    color: 'from-amber-500 to-orange-500',
  },
  {
    icon: Target,
    titulo: 'Auditorías y Cumplimiento',
    texto: 'Verificación del cumplimiento normativo con trazabilidad completa de cada capacitación.',
    color: 'from-rose-500 to-pink-500',
  },
  {
    icon: TrendingUp,
    titulo: 'Análisis y Reportes',
    texto: 'Métricas de desempeño, avance formativo y resultados de evaluación en tiempo real.',
    color: 'from-teal-500 to-cyan-500',
  },
] as const;

const RAZONES = [
  {
    icon: Route,
    titulo: 'Experiencia en Ruta',
    texto: 'Más de 10 años formando conductores profesionales con programas probados en campo.',
  },
  {
    icon: Shield,
    titulo: 'Normativa al Día',
    texto: 'Contenido actualizado según las últimas resoluciones de seguridad vial de cada país.',
  },
  {
    icon: Zap,
    titulo: 'Plataforma en Línea',
    texto: 'Capacitación digital, accesible desde cualquier dispositivo y en cualquier momento.',
  },
  {
    icon: Heart,
    titulo: 'Compromiso Real',
    texto: 'Cada conductor capacitado es una familia más segura. Esa es la razón de todo lo demás.',
  },
] as const;

const CARACTERISTICAS = [
  {
    icon: Truck,
    titulo: 'Constructor de Cursos',
    texto: 'Módulos, recursos y evaluaciones organizados de forma visual, sin conocimientos técnicos.',
  },
  {
    icon: BookOpen,
    titulo: 'Cuestionarios Evaluados',
    texto: 'Corrección automática en el servidor, control de intentos y límite de tiempo por examen.',
  },
  {
    icon: Award,
    titulo: 'Certificados Verificables',
    texto: 'Cada certificado lleva un código con el que cualquier tercero puede comprobar su validez.',
  },
] as const;

export default function Portada() {
  const { config } = useConfig();
  const { sede, listo } = useSede();
  const [conSombra, setConSombra] = useState(false);

  useEffect(() => {
    const alDesplazar = () => setConSombra(window.scrollY > 50);
    window.addEventListener('scroll', alDesplazar, { passive: true });
    return () => window.removeEventListener('scroll', alDesplazar);
  }, []);

  // Mientras se lee la sede guardada no se pinta nada: mostrar una sede y cambiarla al
  // instante siguiente sería peor que esperar un momento.
  if (!listo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <PageLoader message="Cargando campus…" />
      </div>
    );
  }

  // Primera visita: hay que saber a qué operación viene antes de enseñarle nada.
  if (!sede) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 py-16 bg-background">
        <SelectorDeSede />
      </main>
    );
  }

  const nombrePlataforma = config?.nombre_plataforma ?? 'PESV Education';
  const logo = urlDeArchivo(config?.logo_url);

  return (
    <div className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-primary/8 blur-[80px] animate-[floatBg_12s_ease-in-out_infinite] will-change-transform" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[400px] h-[400px] rounded-full bg-primary/8 blur-[80px] animate-[floatBg_15s_ease-in-out_infinite_reverse] will-change-transform" />
      </div>

      <header
        className={`fixed top-0 w-full z-50 transition-all duration-500 ${
          conSombra ? 'bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-sm' : 'bg-transparent'
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
            <span className="hidden sm:inline truncate">{nombrePlataforma}</span>
          </div>

          <nav className="flex items-center gap-4 md:gap-8 text-sm font-medium text-muted-foreground">
            <a href="#servicios" className="hidden md:inline hover:text-primary transition-colors">
              Servicios
            </a>
            <a href="#sedes" className="hidden md:inline hover:text-primary transition-colors">
              Sedes
            </a>
            <a href="#caracteristicas" className="hidden md:inline hover:text-primary transition-colors">
              Plataforma
            </a>
            <a href="#contacto" className="hidden md:inline hover:text-primary transition-colors">
              Contacto
            </a>

            <IndicadorDeSede />

            <a
              href="/login"
              className="bg-primary text-primary-foreground px-5 md:px-6 py-2.5 rounded-xl font-bold hover:bg-primary/90 transition-all hover:scale-105 shadow-lg shadow-primary/25 whitespace-nowrap"
            >
              Ingresar <ArrowRight className="inline h-4 w-4 ml-1" />
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Portada */}
        <section className="relative min-h-screen flex items-center justify-center px-6 pt-20">
          <div className="absolute bottom-0 left-0 w-full h-32 overflow-hidden opacity-10" aria-hidden="true">
            <div className="flex gap-8 animate-[slideRoad_3s_linear_infinite]">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="w-20 h-2 bg-primary rounded-full shrink-0" />
              ))}
            </div>
          </div>

          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-primary mb-8">
              <span aria-hidden="true">{SEDES[sede].bandera}</span>
              Sede {SEDES[sede].nombre}
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.1] mb-8">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-foreground via-foreground to-foreground/70">
                {config?.landing_hero_titulo1 ?? 'Transporte Seguro,'}
              </span>
              <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-primary to-emerald-500">
                {config?.landing_hero_titulo2 ?? 'Personal Capacitado'}
              </span>
            </h1>

            <p className="max-w-2xl mx-auto text-lg md:text-xl text-muted-foreground leading-relaxed mb-12">
              {config?.landing_hero_subtitulo ??
                'Plataforma integral para la gestión del Plan Estratégico de Seguridad Vial.'}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/login"
                className="group inline-flex h-14 items-center justify-center rounded-2xl bg-primary px-10 text-base font-bold text-primary-foreground shadow-xl shadow-primary/30 hover:shadow-2xl hover:shadow-primary/40 transition-all hover:scale-105"
              >
                Comenzar ahora
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </a>
              <a
                href="#servicios"
                className="inline-flex h-14 items-center justify-center rounded-2xl border-2 border-border bg-card/50 backdrop-blur-sm px-10 text-base font-bold text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all"
              >
                Conocer más
              </a>
            </div>

            <div className="mt-16 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              {[
                { icon: CheckCircle, texto: 'Certificación verificable' },
                { icon: Shield, texto: 'Cumplimiento PESV' },
                { icon: Users, texto: 'Capacitación en línea' },
              ].map((insignia) => (
                <div
                  key={insignia.texto}
                  className="flex items-center gap-2 bg-card/50 backdrop-blur-sm border border-border/50 px-4 py-2 rounded-full"
                >
                  <insignia.icon className="h-4 w-4 text-primary" />
                  <span className="font-medium">{insignia.texto}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Servicios */}
        <section id="servicios" className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <FadeIn className="text-center mb-16">
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
            </FadeIn>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {SERVICIOS.map((servicio, i) => (
                <FadeIn key={servicio.titulo} retraso={i * 0.08}>
                  <div className="group relative bg-card/50 backdrop-blur-md border border-border/50 rounded-3xl p-8 hover:border-primary/50 hover:shadow-[0_0_30px_-5px_rgba(59,130,246,0.3)] transition-all duration-500 hover:-translate-y-2 overflow-hidden h-full">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative z-10">
                      <div
                        className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${servicio.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 shadow-lg`}
                      >
                        <servicio.icon className="h-7 w-7 text-white" />
                      </div>
                      <h3 className="text-xl font-bold mb-3">{servicio.titulo}</h3>
                      <p className="text-muted-foreground leading-relaxed">{servicio.texto}</p>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* Sedes */}
        <section id="sedes" className="py-24 px-6 bg-gradient-to-b from-primary/5 to-transparent">
          <div className="max-w-5xl mx-auto">
            <FadeIn className="text-center mb-14">
              <div className="inline-flex items-center gap-2 bg-primary/5 border border-primary/20 text-primary text-sm font-bold px-4 py-1.5 rounded-full mb-4">
                <Globe className="h-4 w-4" /> Dos operaciones, una plataforma
              </div>
              <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                Elige tu <span className="text-primary">sede</span>
              </h2>
              <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg leading-relaxed">
                Colombia y México operan de forma independiente: cada una con su catálogo de cursos, su equipo
                de examinadores, su normativa y sus certificados. La información de una sede nunca aparece en la
                otra.
              </p>
            </FadeIn>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {PAISES.map((pais, i) => {
                const esActual = pais === sede;
                return (
                  <FadeIn key={pais} retraso={i * 0.1}>
                    <div
                      className={`h-full rounded-3xl border-2 p-8 transition-all duration-300 ${
                        esActual
                          ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                          : 'border-border bg-card/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-5">
                        <span className="text-5xl" aria-hidden="true">
                          {SEDES[pais].bandera}
                        </span>
                        {esActual && (
                          <span className="text-xs font-bold uppercase tracking-wide text-primary bg-primary/10 px-3 py-1.5 rounded-full">
                            Estás aquí
                          </span>
                        )}
                      </div>
                      <h3 className="text-2xl font-bold mb-2">{SEDES[pais].nombre}</h3>
                      <p className="text-muted-foreground leading-relaxed">
                        Programas y certificación adaptados a la regulación {SEDES[pais].gentilicio} de seguridad
                        vial.
                      </p>
                    </div>
                  </FadeIn>
                );
              })}
            </div>

            <FadeIn className="mt-10">
              <div className="flex flex-col sm:flex-row items-start gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
                <ShieldCheck className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0" />
                <div className="text-sm leading-relaxed">
                  <p className="font-bold mb-1">Tu cuenta pertenece a una sola sede</p>
                  <p className="text-muted-foreground">
                    Al solicitar acceso eliges la sede a la que perteneces y no se puede cambiar después. Si
                    intentas entrar desde la otra, el acceso será rechazado. Usa el selector de la parte superior
                    para cambiar antes de iniciar sesión.
                  </p>
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* Por qué nosotros */}
        <section id="nosotros" className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <FadeIn className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                ¿Por qué <span className="text-primary">elegirnos</span>?
              </h2>
            </FadeIn>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {RAZONES.map((razon, i) => (
                <FadeIn key={razon.titulo} retraso={i * 0.1}>
                  <div className="group flex gap-5 p-6 rounded-2xl bg-card/50 backdrop-blur-md border border-border/50 hover:border-primary/50 transition-all duration-500 hover:-translate-y-1 h-full">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary transition-all duration-500">
                      <razon.icon className="h-6 w-6 text-primary group-hover:text-white transition-colors duration-500" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors">
                        {razon.titulo}
                      </h3>
                      <p className="text-muted-foreground leading-relaxed">{razon.texto}</p>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* Características */}
        <section id="caracteristicas" className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <FadeIn className="text-center mb-16">
              <div className="inline-flex items-center gap-2 bg-primary/5 border border-primary/20 text-primary text-sm font-bold px-4 py-1.5 rounded-full mb-4">
                <Star className="h-4 w-4" /> La plataforma
              </div>
              <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                Diseñada para <span className="text-primary">capacitar</span>
              </h2>
            </FadeIn>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {CARACTERISTICAS.map((caracteristica, i) => (
                <FadeIn key={caracteristica.titulo} retraso={i * 0.12}>
                  <div className="group bg-card/50 backdrop-blur-md border border-border/50 rounded-3xl p-8 hover:border-primary/50 transition-all duration-500 hover:-translate-y-2 h-full">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary transition-all duration-500">
                      <caracteristica.icon className="h-8 w-8 text-primary group-hover:text-white transition-colors duration-500" />
                    </div>
                    <h3 className="text-xl font-bold mb-3 group-hover:text-primary transition-colors">
                      {caracteristica.titulo}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">{caracteristica.texto}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* Contacto */}
        <section id="contacto" className="py-24 px-6 bg-gradient-to-b from-transparent to-muted/30">
          <div className="max-w-6xl mx-auto">
            <FadeIn className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-black tracking-tight">Contáctanos</h2>
              <p className="mt-4 text-muted-foreground text-lg">
                Datos de la sede de {SEDES[sede].nombre}.
              </p>
            </FadeIn>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  icon: Phone,
                  titulo: 'Teléfono',
                  dato: config?.landing_telefono,
                  detalle: config?.landing_telefono_sub,
                },
                { icon: Mail, titulo: 'Correo', dato: config?.landing_email, detalle: config?.landing_email_sub },
                {
                  icon: MapPin,
                  titulo: 'Oficina',
                  dato: config?.landing_oficina,
                  detalle: config?.landing_oficina_sub,
                },
              ].map((contacto, i) => (
                <FadeIn key={contacto.titulo} retraso={i * 0.1}>
                  <div className="group text-center bg-card/50 backdrop-blur-md border border-border/50 rounded-3xl p-8 hover:border-primary/50 transition-all duration-500 hover:-translate-y-2 h-full flex flex-col items-center justify-center">
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary transition-all duration-500">
                      <contacto.icon className="h-6 w-6 text-primary group-hover:text-white transition-colors duration-500" />
                    </div>
                    <h3 className="font-bold text-lg group-hover:text-primary transition-colors">
                      {contacto.titulo}
                    </h3>
                    <p className="text-primary font-bold mt-2 text-lg break-all">{contacto.dato ?? '—'}</p>
                    <p className="text-sm text-muted-foreground mt-1">{contacto.detalle}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>
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
                {nombrePlataforma}
              </div>
              <p className="text-muted-foreground max-w-sm leading-relaxed">
                {config?.landing_footer_texto ??
                  'Plataforma de capacitación y certificación en seguridad vial para empresas de transporte.'}
              </p>
              <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
                <span aria-hidden="true">{SEDES[sede].bandera}</span> Sede {SEDES[sede].nombre}
              </p>
            </div>

            <div>
              <h4 className="font-bold mb-4">Plataforma</h4>
              <div className="space-y-3 text-sm text-muted-foreground">
                <a href="#servicios" className="block hover:text-primary transition-colors">
                  Servicios
                </a>
                <a href="#sedes" className="block hover:text-primary transition-colors">
                  Sedes
                </a>
                <a href="#caracteristicas" className="block hover:text-primary transition-colors">
                  Características
                </a>
                <a href="/login" className="block hover:text-primary transition-colors">
                  Iniciar sesión
                </a>
              </div>
            </div>

            <div>
              <h4 className="font-bold mb-4">Legal</h4>
              <div className="space-y-3 text-sm text-muted-foreground">
                <a href="/legal#privacidad" className="block hover:text-primary transition-colors">
                  Política de privacidad
                </a>
                <a href="/legal#terminos" className="block hover:text-primary transition-colors">
                  Términos de uso
                </a>
                <a href="/legal#datos" className="block hover:text-primary transition-colors">
                  Protección de datos
                </a>
                <a href="/verificar" className="block hover:text-primary transition-colors">
                  Verificar certificado
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-border/40 pt-8 flex flex-col md:flex-row justify-between items-center text-sm text-muted-foreground gap-3">
            <p>
              © {new Date().getFullYear()} {nombrePlataforma}. Todos los derechos reservados.
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
