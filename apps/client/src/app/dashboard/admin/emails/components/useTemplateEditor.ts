'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sanitizeHTML } from '@/lib/sanitize';
import type { EmailTemplate } from '@/types/models';
import { subjectText, toEditable, toTemplate, variableLabelHtml } from './visual-editing';

export interface TemplateContent {
  subject: string;
  bodyHtml: string;
}

/** Se limpia como el resto del HTML del campus; los enlaces quedan intactos porque se vuelve a guardar. */
const editableHtml = (html: string) => toEditable(sanitizeHTML(html, { linksInNewTab: false }).__html);

const sameContent = (a: TemplateContent, b: TemplateContent) => a.subject === b.subject && a.bodyHtml === b.bodyHtml;

/** Asunto y cuerpo editables de una plantilla: lo escrito, si cambió y las órdenes en el punto del cursor. */
export function useTemplateEditor(template: EmailTemplate) {
  const subject = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  /** Al pulsar un botón el navegador pierde la selección: se recuerda para actuar donde estaba el cursor. */
  const savedCaret = useRef<Range | null>(null);
  const original = useRef<TemplateContent | null>(null);
  const [dirty, setDirty] = useState(false);

  // Una sola vez: recalcularlo reescribiría la zona editable y el cursor saltaría al principio.
  const initial = useMemo(
    () => ({ subject: editableHtml(template.subject), body: editableHtml(template.bodyHtml) }),
    [template.subject, template.bodyHtml],
  );

  const read = useCallback(
    (): TemplateContent => ({
      subject: subject.current ? subjectText(subject.current.innerHTML) : template.subject,
      bodyHtml: body.current ? toTemplate(body.current.innerHTML) : template.bodyHtml,
    }),
    [template.subject, template.bodyHtml],
  );

  // Lo de partida se lee ya pintado: el navegador normaliza el HTML y no coincide con el texto guardado.
  useEffect(() => {
    original.current = read();
  }, [read]);

  const checkDirty = () => setDirty(original.current !== null && !sameContent(read(), original.current));

  const editableAreas = () => [subject.current, body.current].filter((area): area is HTMLDivElement => area !== null);

  const rememberCaret = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editableAreas().some((area) => area.contains(range.commonAncestorContainer))) {
      savedCaret.current = range.cloneRange();
    }
  };

  const atCaret = (command: () => void) => {
    const range = savedCaret.current;
    const area = range && editableAreas().find((candidate) => candidate.contains(range.commonAncestorContainer));
    if (range && area) {
      area.focus();
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      command();
      rememberCaret();
    } else {
      body.current?.focus();
      command();
    }
    checkDirty();
  };

  return {
    subject,
    body,
    initial,
    dirty,
    read,
    checkDirty,
    rememberCaret,
    applyFormat: (command: string) => atCaret(() => document.execCommand(command, false)),
    insertVariable: (variable: string) =>
      atCaret(() => document.execCommand('insertHTML', false, `${variableLabelHtml(variable)}&nbsp;`)),
    insertEmoji: (emoji: string) => atCaret(() => document.execCommand('insertText', false, emoji)),
  };
}
