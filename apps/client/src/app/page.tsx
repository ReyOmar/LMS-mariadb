'use client';

import { useConfig } from '@/contexts/ConfigContext';
import { useCountry } from '@/contexts/CountryContext';
import { fileUrlFor } from '@/lib/api';
import { platformNameOf } from '@/lib/platform';
import { FullScreenLoader } from '@/components/ui/PageLoader';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { Hero } from '@/components/landing/Hero';
import { Services } from '@/components/landing/Services';
import { Reasons } from '@/components/landing/Reasons';
import { Features } from '@/components/landing/Features';
import { Contact } from '@/components/landing/Contact';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { landingText, publishedContacts } from '@/components/landing/landing-content';

export default function LandingPage() {
  const { config } = useConfig();
  const { country, ready } = useCountry();

  // Enseñar una sede y cambiarla al instante siguiente sería peor que esperar a leer la guardada.
  if (!ready) {
    return <FullScreenLoader message="Cargando campus…" />;
  }

  const platformName = platformNameOf(config);
  const logoUrl = fileUrlFor(config?.logoUrl);
  const text = landingText(config);
  const contacts = publishedContacts(config, country);

  return (
    <div className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-primary/8 blur-[80px] animate-[floatBg_12s_ease-in-out_infinite] motion-reduce:animate-none will-change-transform" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[400px] h-[400px] rounded-full bg-primary/8 blur-[80px] animate-[floatBg_15s_ease-in-out_infinite_reverse] motion-reduce:animate-none will-change-transform" />
      </div>

      <LandingHeader logoUrl={logoUrl} platformName={platformName} hasContact={contacts.length > 0} />

      <main className="flex-1">
        <Hero country={country} text={text} />
        <Services />
        <Reasons />
        <Features />
        {contacts.length > 0 && <Contact contacts={contacts} country={country} />}
      </main>

      <LandingFooter logoUrl={logoUrl} platformName={platformName} description={text.footer} country={country} />
    </div>
  );
}
