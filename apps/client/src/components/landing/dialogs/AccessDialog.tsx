'use client';

import { useRef } from 'react';
import { useDialog } from '@/hooks/useDialog';
import { AccessPanel } from '@/components/access/AccessPanel';
import { CloseButton, Modal, useScrollHints, useWheelInto } from './dialog-parts';

/** El acceso al campus sobre la portada: el mismo panel de la página `/login`, en una hoja. */
export function AccessDialog({ onClose }: { onClose: () => void }) {
  const { dialogProps, titleId } = useDialog({ onClose });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hints = useScrollHints(scrollerRef, contentRef);
  useWheelInto(scrollerRef);

  return (
    <Modal onClose={onClose}>
      <div {...dialogProps} className={`sheet ${hints.more ? 'has-more' : ''} ${hints.scrolled ? 'is-scrolled' : ''}`}>
        <CloseButton onClick={onClose} />
        <div className="sheet-scroll" ref={scrollerRef}>
          <div ref={contentRef}>
            <AccessPanel
              destination="/dashboard"
              dialog={{ titleId, onClose, onViewChange: () => scrollerRef.current?.scrollTo({ top: 0 }) }}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
