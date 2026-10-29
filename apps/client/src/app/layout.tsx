import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Script from 'next/script';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import { CountryProvider } from '@/contexts/CountryContext';
import { SessionProvider } from '@/contexts/SessionContext';
import { RealtimeProvider } from '@/contexts/RealtimeContext';
import { ConfigProvider } from '@/contexts/ConfigContext';
import { AlertProvider } from '@/contexts/AlertContext';
import { fontVariables } from '@/lib/fonts';
import { DataConsentGate } from '@/components/legal/DataConsentGate';
import { StorageNotice } from '@/components/legal/StorageNotice';
import { PageLoaderOverlay } from '@/components/ui/PageLoaderOverlay';
import { BrandHead } from '@/components/layout/BrandHead';

/** El título y el icono dependen de la sede y los pone `BrandHead`. */
export const metadata: Metadata = {
  description: 'Plataforma de capacitación y certificación en seguridad vial.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
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
          {/* Cada proveedor depende de los de fuera: la sede elige la configuración, la sesión confirma la
              sede y el tiempo real usa su token. */}
          <CountryProvider>
            <SessionProvider>
              <RealtimeProvider>
                <ConfigProvider>
                  <BrandHead />
                  <AlertProvider>
                    <DataConsentGate>{children}</DataConsentGate>
                    <StorageNotice />
                  </AlertProvider>
                </ConfigProvider>
              </RealtimeProvider>
            </SessionProvider>
          </CountryProvider>
          {/* Fuera de los proveedores: sigue montado aunque la sesión o la sede sustituyan lo de dentro. */}
          <PageLoaderOverlay />
        </ThemeProvider>
      </body>
    </html>
  );
}
