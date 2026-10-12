import { pendingChanges } from '@/lib/draft';
import { savedBaseline } from './settings-baseline';

describe('savedBaseline', () => {
  const saved = { primaryColor: '#111111', logoUrl: 'logos/marca.png' as string | null };

  it('sin edición en curso, lo guardado es la configuración cargada', () => {
    expect(savedBaseline(null, saved)).toBe(saved);
  });

  it('mientras se edita, conserva la copia tomada antes del primer cambio', () => {
    const reloaded = { ...saved, primaryColor: '#333333' };
    expect(savedBaseline(saved, reloaded)).toBe(saved);
  });

  it('la vista previa en vivo no cuenta como guardado', () => {
    const changes = { primaryColor: '#222222', logoUrl: null };
    const previewed = { ...saved, ...changes };

    expect(pendingChanges(savedBaseline(saved, previewed)!, changes)).toEqual(changes);
  });

  it('quitar una imagen guardada queda pendiente aunque la vista previa ya no la muestre', () => {
    const previewed = { ...saved, logoUrl: null };

    expect(pendingChanges(savedBaseline(saved, previewed)!, { logoUrl: null })).toEqual({ logoUrl: null });
  });
});
