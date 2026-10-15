import Link from 'next/link';
import { ArrowRight, CheckCircle, Shield, Users } from 'lucide-react';
import { COUNTRY_INFO, type Country } from '@/lib/country';
import { CountryFlag } from '@/components/ui/CountryFlag';
import type { LandingText } from './landing-content';

const HIGHLIGHTS = [
  { icon: CheckCircle, text: 'Certificación verificable' },
  { icon: Shield, text: 'Cumplimiento PESV' },
  { icon: Users, text: 'Capacitación en línea' },
] as const;

/** Rayas de la carretera animada: las justas para cubrir la pantalla más ancha mientras se desplazan. */
const ROAD_STRIPES = 20;

function Road() {
  return (
    <div className="absolute bottom-0 left-0 w-full h-32 overflow-hidden opacity-10" aria-hidden="true">
      <div className="flex gap-8 animate-[slideRoad_3s_linear_infinite] motion-reduce:animate-none">
        {Array.from({ length: ROAD_STRIPES }, (_, i) => (
          <div key={i} className="w-20 h-2 bg-primary rounded-full shrink-0" />
        ))}
      </div>
    </div>
  );
}

export function Hero({ country, text }: { country: Country; text: LandingText }) {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-4 sm:px-6 pt-20">
      <Road />

      <div className="max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-primary mb-8">
          <CountryFlag country={country} size="sm" />
          Sede {COUNTRY_INFO[country].name}
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.1] mb-8 break-words">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-foreground via-foreground to-foreground/70">
            {text.heroTitle}
          </span>
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-primary to-primary/70">
            {text.heroHighlight}
          </span>
        </h1>

        <p className="max-w-2xl mx-auto text-lg md:text-xl text-muted-foreground leading-relaxed mb-12">
          {text.heroSubtitle}
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

        <ul className="mt-16 flex flex-wrap justify-center gap-3 sm:gap-6 text-sm text-muted-foreground">
          {HIGHLIGHTS.map((highlight) => (
            <li
              key={highlight.text}
              className="flex items-center gap-2 bg-card/50 backdrop-blur-sm border border-border/50 px-4 py-2 rounded-full"
            >
              <highlight.icon className="h-4 w-4 text-primary" />
              <span className="font-medium">{highlight.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
