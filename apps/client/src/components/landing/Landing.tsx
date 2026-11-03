'use client';

import { useRef } from 'react';
import { fileUrlFor } from '@/lib/api';
import { platformNameOf } from '@/lib/platform';
import { useConfig } from '@/contexts/ConfigContext';
import { useCountry } from '@/contexts/CountryContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { landingText, publishedContacts, SITE_STORIES } from './landing-content';
import { WIDE_SCREEN } from './screens';
import { useLandingScreens } from './useLandingScreens';
import { useRouteSteps } from './useRouteSteps';
import { LandingHeader } from './LandingHeader';
import { ScreenLane } from './ScreenLane';
import { Hero } from './Hero';
import { Roles } from './Roles';
import { HowItWorks } from './HowItWorks';
import { PlatformSection, usePieceFocus } from './PlatformSection';
import { Showcase } from './showcase/Showcase';
import { VerifySection } from './VerifySection';
import { ContactSection } from './ContactSection';
import { LandingFooter } from './LandingFooter';
import { useLandingDialog } from './dialogs/useLandingDialog';
import { AccessDialog } from './dialogs/AccessDialog';
import { LegalDialog } from './dialogs/LegalDialog';

/**
 * La portada pública: seis pantallas que se recorren de una en una, con la interfaz del campus
 * a la derecha (la vitrina). El acceso y los textos legales se abren como ventanas sobre ella.
 * Los textos, los contactos y la marca son los que configura cada sede.
 */
export function Landing() {
  const { config } = useConfig();
  const { country } = useCountry();
  const rootRef = useRef<HTMLDivElement>(null);
  const { active, progress } = useLandingScreens(rootRef);
  const wide = useMediaQuery(WIDE_SCREEN);
  const reached = useRouteSteps(active === 'ruta');
  const pieceFocus = usePieceFocus();
  const { dialog, open, close } = useLandingDialog();

  const platformName = platformNameOf(config);
  const logoUrl = fileUrlFor(config?.logoUrl);
  const text = landingText(config);
  const story = SITE_STORIES[country];
  const openAccess = () => open({ kind: 'access' });

  return (
    <div ref={rootRef} className="landing" data-screen={active} data-dialog-open={dialog ? '' : undefined}>
      <a href="#main-content" className="skip-to-content">
        Saltar al contenido
      </a>
      <LandingHeader logoUrl={logoUrl} platformName={platformName} active={active} onSignIn={openAccess} />
      <ScreenLane active={active} progress={progress} />

      <main id="main-content">
        <Hero country={country} text={text} onSignIn={openAccess} />
        <Roles />
        <HowItWorks reached={reached} enrollment={story.enrollment} />
        <PlatformSection wide={wide} quizRunning={active === 'plataforma'} pieceFocus={pieceFocus} />
        {/* Tras «Plataforma»: es fija, así que no cambia de sitio en pantalla, pero el foco llega al
            celular del cuestionario justo después de las funciones que lo explican. */}
        <Showcase
          progress={progress}
          active={active}
          wide={wide}
          platformName={platformName}
          country={country}
          reached={reached}
          focusedPiece={pieceFocus.focused}
        />
        <VerifySection />
        <ContactSection
          contacts={publishedContacts(config, country)}
          country={country}
          dataLaw={story.dataLaw}
          footer={
            <LandingFooter
              logoUrl={logoUrl}
              platformName={platformName}
              description={text.footer}
              country={country}
              onSignIn={openAccess}
              onLegal={(section) => open({ kind: 'legal', section })}
            />
          }
        />
      </main>

      {dialog?.kind === 'access' && <AccessDialog onClose={close} />}
      {dialog?.kind === 'legal' && <LegalDialog section={dialog.section} onClose={close} />}
    </div>
  );
}
