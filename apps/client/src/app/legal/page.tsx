'use client';

import { ArrowLeft, Shield } from 'lucide-react';
import Link from 'next/link';
import { LegalNotes, LegalSections, useLegalDocument } from '@/components/legal/LegalDocument';

export default function LegalPage() {
  const { platformName, countryName, effectiveDate, missing, sections } = useLegalDocument();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 shrink-0 text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Volver al inicio</span>
          </Link>
          <div className="flex items-center gap-2 min-w-0 font-bold text-primary">
            <Shield className="h-5 w-5 shrink-0" />
            <span className="truncate">{platformName}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 py-12 sm:py-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl md:text-5xl font-black mb-8">Información legal y privacidad</h1>
          <p className="text-muted-foreground text-lg mb-4">Versión vigente desde el {effectiveDate}</p>
          <LegalNotes countryName={countryName} missing={missing} />

          <nav aria-label="Contenido" className="mb-12 rounded-xl border border-border px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">En esta página</p>
            <ul className="space-y-1">
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="text-sm text-primary hover:underline">
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <LegalSections sections={sections} level={2} />
        </div>
      </main>

      <footer className="border-t border-border/50 py-8 text-center text-sm text-muted-foreground bg-card/20">
        <p>
          © {new Date().getFullYear()} {platformName}. Todos los derechos reservados.
        </p>
      </footer>
    </div>
  );
}
