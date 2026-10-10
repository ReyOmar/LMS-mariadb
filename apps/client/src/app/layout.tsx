import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import { CountryProvider } from '@/contexts/CountryContext';
import { SessionProvider } from '@/contexts/SessionContext';
import { RealtimeProvider } from '@/contexts/RealtimeContext';
import { ConfigProvider } from '@/contexts/ConfigContext';
import { AlertProvider } from '@/contexts/AlertContext';
import { fontVariables } from '@/lib/fonts';
import { DataConsentDialog } from '@/components/legal/DataConsentDialog';
import { StorageNotice } from '@/components/legal/StorageNotice';
import { PageLoaderOverlay } from '@/components/ui/PageLoaderOverlay';
import { BrandHead } from '@/components/layout/BrandHead';

/** El título y el icono dependen de la sede y los pone `BrandHead`. */
export const metadata: Metadata = {
  description: 'Plataforma de capacitación y certificación en seguridad vial.',
};

/**
 * Orden de los proveedores, de fuera hacia dentro:
 *  1. Tema claro/oscuro, que no depende de nada.
 *  2. Sede, que decide qué configuración pedir.
 *  3. Sesión, que confirma la sede real del usuario.
 *  4. Tiempo real, que necesita el token de la sesión.
 *  5. Configuración, que depende de la sede y escucha cambios en tiempo real.
 *  6. Avisos, que cualquier pantalla usa.
 *
 * El cierre de las pantallas de carga queda fuera de todos ellos: tiene que seguir montado
 * aunque la sesión o la sede sustituyan todo lo que hay dentro.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `data-scroll-behavior` le dice a Next.js que el desplazamiento suave de `globals.css`
    // es deliberado, para que lo suspenda al cambiar de pantalla.
    <html lang="es" className={fontVariables} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Aplica el tema de la sede (el de la caché o, sin ella, su marca) antes del primer pintado. */}
        <Script src="/theme-preload.js" strategy="beforeInteractive" />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-background font-sans antialiased text-foreground transition-colors duration-300"
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <CountryProvider>
            <SessionProvider>
              <RealtimeProvider>
                <ConfigProvider>
                  <BrandHead />
                  <AlertProvider>
                    {children}
                    <DataConsentDialog />
                    <StorageNotice />
                  </AlertProvider>
                </ConfigProvider>
              </RealtimeProvider>
            </SessionProvider>
          </CountryProvider>
          <PageLoaderOverlay />
        </ThemeProvider>
      </body>
    </html>
  );
}
