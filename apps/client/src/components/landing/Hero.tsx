import { CircleCheck, MapPin, Plug } from 'lucide-react';
import { COUNTRIES, COUNTRY_INFO, type Country } from '@/lib/country';
import { CountryFlag } from '@/components/ui/CountryFlag';
import type { LandingText } from './landing-content';
import { enterDelay } from './screens';
import { StudentPhone } from './showcase/StudentPhone';
import { WindowLink } from './WindowLink';

const SITES_IN_WORDS = new Intl.ListFormat('es', { type: 'conjunction' }).format(
  COUNTRIES.map((country) => COUNTRY_INFO[country].name),
);

/**
 * La primera pantalla. Desde 1100 px la vitrina muestra el campus a su lado; por debajo no hay
 * vitrina y el celular de quien se capacita va dentro de la pantalla, después del texto.
 */
export function Hero({
  country,
  text,
  wide,
  onSignIn,
}: {
  country: Country;
  text: LandingText;
  wide: boolean;
  onSignIn: () => void;
}) {
  return (
    <section className="screen" id="inicio" aria-labelledby="t-inicio">
      <div className="wrap">
        <div className="column hero-copy">
          <p className="badge" data-enter style={enterDelay(0)}>
            <CountryFlag country={country} size="sm" />
            <span>Sede {COUNTRY_INFO[country].name}</span>
          </p>
          <h1 className="display" id="t-inicio" data-enter style={enterDelay(1)}>
            <span className="fade-fg">{text.heroTitle}</span>
            <span className="fade-primary">{text.heroHighlight}</span>
          </h1>
          <p className="lead" data-enter style={enterDelay(2)}>
            {text.heroSubtitle}
          </p>
          <div className="cta-row" data-enter style={enterDelay(3)}>
            <WindowLink href="/login" onOpen={onSignIn} className="btn btn-primary btn-lg">
              Ingresar al campus
            </WindowLink>
            <a className="btn btn-outline btn-lg" href="#verificar">
              Verificar un certificado
            </a>
          </div>
          <ul className="chips" data-enter style={enterDelay(4)}>
            <li className="chip">
              <CircleCheck className="i" />
              Certificados verificables
            </li>
            <li className="chip">
              <Plug className="i" />
              Integración con tu sistema PESV
            </li>
            <li className="chip">
              <MapPin className="i" />
              Sedes en {SITES_IN_WORDS}
            </li>
          </ul>
          {!wide && (
            <div className="mobile-piece" aria-hidden="true" data-enter style={enterDelay(5)}>
              <StudentPhone />
            </div>
          )}
        </div>
      </div>
      <p className="scroll-hint" aria-hidden="true">
        <span className="wheel" />
        Desliza
      </p>
    </section>
  );
}
