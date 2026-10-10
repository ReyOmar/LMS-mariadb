import { useCallback, useRef, useState } from 'react';

/**
 * Acciones en curso, por elemento: el botón de cada uno espera a la suya sin desbloquear ni
 * bloquear las de los demás, y un segundo clic sobre uno que ya está en curso no lanza otra.
 *
 *     const enrolling = useInFlight<string>();
 *     <button disabled={enrolling.has(student.guid)} onClick={() => enrolling.run(student.guid, enroll)} />
 */
export function useInFlight<Key>() {
  // El conjunto vivo decide al instante, aunque React aún no haya repintado tras el primer clic.
  const running = useRef(new Set<Key>());
  const [snapshot, setSnapshot] = useState<ReadonlySet<Key>>(() => new Set());

  const run = useCallback(async (key: Key, action: () => Promise<void>) => {
    if (running.current.has(key)) return;
    running.current.add(key);
    setSnapshot(new Set(running.current));
    try {
      await action();
    } finally {
      running.current.delete(key);
      setSnapshot(new Set(running.current));
    }
  }, []);

  return { has: (key: Key) => snapshot.has(key), run };
}
