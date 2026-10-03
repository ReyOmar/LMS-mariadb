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

/**
 * Metadatos base.
 *
 * El nombre y el icono definitivos dependen de la sede que elija el visitante, y eso sólo
 * se sabe en el navegador, así que aquí se pone un valor genérico y `applyTheme` lo
 * sustituye en cuanto se conoce la sede.
 */
export const metadata: Metadata = {
  title: 'Campus Virtual PESV',
  description: 'Plataforma de capacitación y certificación en seguridad vial.',
  icons: {
    icon:
      "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>" +
      "<circle cx='50' cy='50' r='50' fill='%231e3a8a'/>" +
      "<text x='50' y='68' font-family='Arial' font-size='42' font-weight='bold' fill='white' text-anchor='middle'>P</text></svg>",
  },
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
    <html lang="es" className={fontVariables} suppressHydrationWarning>
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
