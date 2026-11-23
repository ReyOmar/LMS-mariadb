import type { ReactNode } from 'react';

/**
 * Encabezado grande de las pantallas con el diseño de agenda: una línea de contexto, el título y
 * una frase que explica la pantalla. Los tableros «Hoy» llevan el suyo, con el saludo.
 */
export function PageHeading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: ReactNode }) {
  return (
    <header className="max-w-3xl animate-fade-slide-in">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-primary">{eyebrow}</p>
      <h1 className="mt-2 text-[2rem] font-extrabold leading-[1.05] tracking-[-0.035em] text-foreground sm:text-[2.75rem]">
        {title}
      </h1>
      {lead && (
        <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg [&_b]:font-semibold [&_b]:text-foreground">
          {lead}
        </p>
      )}
    </header>
  );
}
