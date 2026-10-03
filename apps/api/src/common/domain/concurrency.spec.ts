import { countRejected, settleWithConcurrency } from './concurrency';

/** Tarea que tarda un poco y anota cuántas hay en curso a la vez. */
function trackingTask() {
  let running = 0;
  let peak = 0;
  const task = async (n: number) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running--;
    return n * 2;
  };
  return { task, peak: () => peak };
}

describe('settleWithConcurrency', () => {
  it('nunca tiene más tareas en curso que el tope', async () => {
    const { task, peak } = trackingTask();

    await settleWithConcurrency(
      Array.from({ length: 23 }, (_, i) => i),
      5,
      task,
    );

    expect(peak()).toBe(5);
  });

  it('atiende todos los elementos y respeta su orden en el resultado', async () => {
    const { task } = trackingTask();

    const results = await settleWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, task);

    expect(results.map((result) => (result.status === 'fulfilled' ? result.value : null))).toEqual([
      2, 4, 6, 8, 10, 12, 14,
    ]);
  });

  it('un fallo no detiene a los demás', async () => {
    const sent: number[] = [];

    const results = await settleWithConcurrency([1, 2, 3, 4], 2, async (n) => {
      if (n === 2) throw new Error('el proveedor no responde');
      sent.push(n);
      return n;
    });

    expect(sent.sort()).toEqual([1, 3, 4]);
    expect(results[1]).toMatchObject({ status: 'rejected' });
    expect(countRejected(results)).toBe(1);
  });

  it('también recoge el fallo de una tarea que lanza sin llegar a devolver promesa', async () => {
    const results = await settleWithConcurrency([1], 1, () => {
      throw new Error('síncrono');
    });

    expect(results[0]).toMatchObject({ status: 'rejected' });
  });

  it('sin elementos no hace nada', async () => {
    const task = jest.fn();

    expect(await settleWithConcurrency([], 5, task)).toEqual([]);
    expect(task).not.toHaveBeenCalled();
  });

  it('un tope inválido se trata como uno', async () => {
    const { task, peak } = trackingTask();

    await settleWithConcurrency([1, 2, 3], 0, task);

    expect(peak()).toBe(1);
  });
});
