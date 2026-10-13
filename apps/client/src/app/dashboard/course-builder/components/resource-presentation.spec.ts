import { ExternalLink, Image as ImageIcon, PlayCircle } from 'lucide-react';
import type { Resource } from '@/types/models';
import { KIND_PRESENTATION, resourcePresentation } from './resource-presentation';

const link = (contentHtml: string) => ({ type: 'LINK', title: 'Enlace', contentHtml }) as Resource;

describe('resourcePresentation', () => {
  it('un enlace se presenta según adónde lleva, igual en el temario, la vista previa y el editor', () => {
    expect(resourcePresentation(link('https://campus.test/señal.png'))).toMatchObject({
      label: 'Imagen',
      Icon: ImageIcon,
    });
    expect(resourcePresentation(link('https://youtu.be/abc'))).toMatchObject({ label: 'Video', Icon: PlayCircle });
    expect(resourcePresentation(link('https://www.mintransporte.gov.co'))).toMatchObject({
      label: 'Enlace',
      Icon: ExternalLink,
    });
  });

  it('un cuestionario se reconoce por su marca y no se presenta como tarea', () => {
    expect(resourcePresentation({ type: 'ASSIGNMENT', title: '[QUIZ] Normativa' } as Resource)).toBe(
      KIND_PRESENTATION.QUIZ,
    );
  });
});
