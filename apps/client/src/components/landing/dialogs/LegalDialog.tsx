'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useDialog } from '@/hooks/useDialog';
import { REDUCED_MOTION, useMediaQuery } from '@/hooks/useMediaQuery';
import { LegalNotes, LegalSections, useLegalDocument, type LegalSectionId } from '@/components/legal/LegalDocument';
import { CloseButton, Modal, useWheelInto } from './dialog-parts';

/** Margen sobre el título de una sección al llevarla arriba. */
const SECTION_GAP_PX = 16;

/** Dónde queda el texto desplazado con la sección `id` arriba. */
function sectionTop(scroller: HTMLElement, id: LegalSectionId): number {
  const target = scroller.querySelector<HTMLElement>(`#${id}`);
  return target ? target.offsetTop - SECTION_GAP_PX : 0;
}

/**
 * Los textos legales de la sede sobre la portada: los mismos de `/legal`, con un índice que sigue
 * la sección que se lee y una barra con lo que se lleva leído. Se abre en la sección pedida.
 */
export function LegalDialog({ section, onClose }: { section?: LegalSectionId; onClose: () => void }) {
  const { dialogProps, titleId } = useDialog({ onClose });
  const legal = useLegalDocument();
  const reducedMotion = useMediaQuery(REDUCED_MOTION);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const readRef = useRef<HTMLElement>(null);
  const tocRef = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState<LegalSectionId>(section ?? 'terms');
  useWheelInto(scrollerRef);

  // Se abre en la sección pedida, con el foco en el texto: las flechas ya lo desplazan.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (section) scroller.scrollTop = sectionTop(scroller, section);
    scroller.focus({ preventScroll: true });
  }, [section]);

  // Lo leído, como una barra bajo la cabecera.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => {
      const room = scroller.scrollHeight - scroller.clientHeight;
      readRef.current?.style.setProperty('--read', room > 0 ? (scroller.scrollTop / room).toFixed(3) : '1');
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    return () => scroller.removeEventListener('scroll', update);
  }, []);

  // La sección que se lee es la que cruza la parte alta del texto.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setCurrent(entry.target.id as LegalSectionId);
      },
      { root: scroller, rootMargin: '0px 0px -70% 0px' },
    );
    for (const element of scroller.querySelectorAll('section[id]')) spy.observe(element);
    return () => spy.disconnect();
  }, []);

  // En el móvil el índice son fichas en una fila: la actual se mantiene a la vista.
  useEffect(() => {
    const toc = tocRef.current;
    const chip = toc?.querySelector<HTMLElement>('[aria-current]');
    if (!toc || !chip || toc.scrollWidth <= toc.clientWidth) return;
    toc.scrollTo({ left: chip.offsetLeft - SECTION_GAP_PX, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [current, reducedMotion]);

  const goTo = (id: LegalSectionId) => (event: MouseEvent) => {
    event.preventDefault();
    const scroller = scrollerRef.current;
    scroller?.scrollTo({ top: sectionTop(scroller, id), behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <Modal onClose={onClose}>
      <div {...dialogProps} className="legal-sheet">
        <header className="sheet-bar">
          <div className="sheet-bar-text">
            <h2 id={titleId}>Información legal y privacidad</h2>
            <p>
              Versión vigente desde el {legal.effectiveDate} · Sede {legal.countryName}
            </p>
          </div>
          <CloseButton onClick={onClose} />
          <span className="read-progress" aria-hidden="true">
            <i ref={readRef} />
          </span>
        </header>
        <div className="legal-body">
          <nav className="toc" aria-label="En esta página" ref={tocRef}>
            <p className="eyebrow">En esta página</p>
            {legal.sections.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={current === item.id ? 'true' : undefined}
                onClick={goTo(item.id)}
              >
                {item.title}
              </a>
            ))}
          </nav>
          <div className="legal-scroll" ref={scrollerRef} role="region" tabIndex={0} aria-labelledby={titleId}>
            <LegalNotes countryName={legal.countryName} missing={legal.missing} />
            <LegalSections sections={legal.sections} level={3} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
