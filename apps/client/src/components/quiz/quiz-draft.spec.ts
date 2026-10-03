import { clearQuizDraft, readQuizDraft, saveQuizDraft } from './quiz-draft';

/** `localStorage` mínimo en memoria: las pruebas corren en Node, sin navegador. */
function installStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  Object.defineProperty(globalThis, 'window', { value: { localStorage }, configurable: true });
  return store;
}

describe('borrador de un cuestionario', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installStorage();
  });

  afterAll(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('guarda y recupera las respuestas del intento', () => {
    saveQuizDraft('q1', { p1: 'a' });
    expect(readQuizDraft('q1')).toEqual({ p1: 'a' });
    expect(readQuizDraft('q2')).toBeNull();
  });

  it('al borrarlo no queda nada en el navegador', () => {
    saveQuizDraft('q1', { p1: 'a' });
    clearQuizDraft('q1');
    expect(store.size).toBe(0);
  });

  it('recupera un borrador guardado con el prefijo anterior y lo limpia al volver a guardar', () => {
    store.set('quiz_respuestas_q1', JSON.stringify({ p1: 'b' }));
    expect(readQuizDraft('q1')).toEqual({ p1: 'b' });

    saveQuizDraft('q1', { p1: 'c' });
    expect([...store.keys()]).toEqual(['quiz_answers_q1']);
  });

  it('borrar también elimina el que quedó con el prefijo anterior', () => {
    store.set('quiz_respuestas_q1', '{}');
    clearQuizDraft('q1');
    expect(store.size).toBe(0);
  });
});
