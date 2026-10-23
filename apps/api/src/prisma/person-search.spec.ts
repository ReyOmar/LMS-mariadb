import { Prisma } from '@prisma/client';
import { personSearch, personSearchSql } from './person-search';

/**
 * Búsqueda de personas palabra a palabra. Se comprueba sobre personas de ejemplo comparando
 * como la base (`utf8mb4_unicode_ci`): sin distinguir tildes, mayúsculas ni ñ de n.
 */

interface Person {
  firstName: string;
  lastName: string;
  email: string;
}

const PEOPLE: Person[] = [
  { firstName: 'Álvaro', lastName: 'Peña Núñez', email: 'alvaro@pesv.test' },
  { firstName: 'Ana', lastName: 'Ruiz', email: 'ana.ruiz@pesv.test' },
  { firstName: 'QA USR', lastName: 'Alumno Uno', email: 'wf.usr.alumno1@pesv.test' },
];

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Condition = { AND?: Condition[]; OR?: Condition[] } & Partial<Record<keyof Person, { contains: string }>>;

function matches(person: Person, condition: Condition | undefined): boolean {
  if (!condition) return true;
  if (condition.AND) return condition.AND.every((part) => matches(person, part));
  if (condition.OR) return condition.OR.some((part) => matches(person, part));
  const [field, { contains }] = Object.entries(condition)[0] as [keyof Person, { contains: string }];
  return fold(person[field]).includes(fold(contains));
}

const found = (search: string) =>
  PEOPLE.filter((person) => matches(person, personSearch(search) as Condition)).map((person) => person.email);

describe('personSearch', () => {
  it('encuentra a una persona por su nombre completo, tal como se ve en la lista', () => {
    expect(found('Álvaro Peña')).toEqual(['alvaro@pesv.test']);
    expect(found('QA USR Alumno Uno')).toEqual(['wf.usr.alumno1@pesv.test']);
  });

  it('las palabras valen en cualquier orden y sin tildes ni mayúsculas', () => {
    expect(found('nunez ALVARO')).toEqual(['alvaro@pesv.test']);
  });

  it('cada palabra tiene que aparecer: no basta con una', () => {
    expect(found('Ana Peña')).toEqual([]);
  });

  it('busca también en el correo', () => {
    expect(found('ana.ruiz@')).toEqual(['ana.ruiz@pesv.test']);
  });

  it('sin palabras no filtra', () => {
    expect(personSearch('   ')).toBeUndefined();
    expect(personSearchSql('   ')).toBe(Prisma.empty);
  });

  it('en SQL a mano, cada palabra es una condición con sus comodines escapados', () => {
    const sql = personSearchSql('Ana 100%');

    expect(sql.values).toEqual(['%Ana%', '%Ana%', '%Ana%', '%100\\%%', '%100\\%%', '%100\\%%']);
    expect(sql.sql.match(/AND \(/g)).toHaveLength(2);
  });
});
