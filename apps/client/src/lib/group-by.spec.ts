import { groupBy } from './group-by';

describe('groupBy', () => {
  const rows = [
    { id: 1, city: 'Bogotá' },
    { id: 2, city: 'Cali' },
    { id: 3, city: 'Bogotá' },
  ];

  it('junta las filas que comparten clave', () => {
    const groups = groupBy(rows, (row) => row.city);

    expect(groups.get('Bogotá')?.map((row) => row.id)).toEqual([1, 3]);
    expect(groups.get('Cali')?.map((row) => row.id)).toEqual([2]);
  });

  it('los grupos salen en el orden en que aparece su primera fila', () => {
    expect([...groupBy(rows, (row) => row.city).keys()]).toEqual(['Bogotá', 'Cali']);
  });

  it('sin filas no hay grupos', () => {
    expect(groupBy([], String).size).toBe(0);
  });
});
