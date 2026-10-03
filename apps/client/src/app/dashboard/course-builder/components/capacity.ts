/** Lo que se guarda al salir del campo «Cupo máximo de estudiantes», o por qué no se puede. */
export type CapacityInput = { maxStudents: number | null } | { error: string };

/** Vacío es «sin límite»; si no, un número entero de al menos un estudiante. */
export function parseCapacity(typed: string): CapacityInput {
  const text = typed.trim();
  if (!text) return { maxStudents: null };

  const capacity = Number(text);
  if (!Number.isInteger(capacity) || capacity < 1) {
    return { error: 'El cupo debe ser un número entero de al menos 1 estudiante.' };
  }
  return { maxStudents: capacity };
}
