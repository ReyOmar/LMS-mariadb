import type { ReactNode } from 'react';

/**
 * Marco del panel: menú lateral y área principal.
 *
 * Las esperas previas al panel (entrar al campus, comprobar la sesión) lo pintan ya, con el
 * menú todavía vacío: así su indicador de carga ocupa el mismo sitio que el de la pantalla
 * que viene después y el usuario ve una sola espera, sin saltos.
 */
export function DashboardShell({ sidebar, children }: { sidebar?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-muted/20">
      <a href="#main-content" className="skip-to-content">
        Saltar al contenido
      </a>
      {sidebar ?? <div aria-hidden className="sidebar-nav hidden lg:block w-80 border-r fixed h-full" />}
      <main
        id="main-content"
        className="flex-1 lg:ml-80 p-4 pt-16 lg:p-8 lg:pt-8 relative min-h-screen overflow-hidden"
      >
        {children}
      </main>
    </div>
  );
}
