import type { ReactNode } from 'react';

/** Marco del panel: menú lateral y área principal. */
export function DashboardShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-muted/20">
      <a href="#main-content" className="skip-to-content">
        Saltar al contenido
      </a>
      {sidebar}
      <main
        id="main-content"
        className="flex-1 lg:ml-80 p-4 pt-[calc(4.5rem+env(safe-area-inset-top))] lg:p-8 lg:pt-8 relative min-h-screen overflow-hidden"
      >
        {children}
      </main>
    </div>
  );
}
