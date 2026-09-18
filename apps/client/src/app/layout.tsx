import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import { SedeProvider } from '@/contexts/SedeContext';
import { RoleProvider } from '@/contexts/RoleContext';
import { RealtimeProvider } from '@/contexts/RealtimeContext';
import { ConfigProvider } from '@/contexts/ConfigContext';
import { AlertProvider } from '@/contexts/AlertContext';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-inter',
});

/**
 * Metadatos base.
 *
 * El nombre y el icono definitivos dependen de la sede que elija el visitante, y eso sólo
 * se sabe en el navegador, así que aquí se pone un valor genérico y `aplicarTema` lo
 * sustituye en cuanto se conoce la sede. Antes esto hacía una petición a la API en cada
 * render del servidor, que retrasaba la primera carga y devolvía siempre la misma marca.
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
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={inter.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Aplica el tema cacheado antes del primer pintado para evitar el salto de color. */}
        <Script src="/theme-preload.js" strategy="beforeInteractive" />
      </head>
      <body
        suppressHydrationWarning
        className={`min-h-screen bg-background font-sans antialiased text-foreground transition-colors duration-300 ${inter.className}`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <SedeProvider>
            <RoleProvider>
              <RealtimeProvider>
                <ConfigProvider>
                  <AlertProvider>{children}</AlertProvider>
                </ConfigProvider>
              </RealtimeProvider>
            </RoleProvider>
          </SedeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
