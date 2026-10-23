import { Prisma } from '@prisma/client';

/**
 * JSON de las respuestas. Las notas y las horas se guardan como `Decimal`, que se serializa
 * como texto («80»), y el cliente las trata como números: salen como número. El sustituto mira
 * el valor original (`this[key]`), porque el que recibe ya pasó por `toJSON`.
 */
export function serializeJson(payload: unknown): string {
  return JSON.stringify(payload, function (this: Record<string, unknown>, key: string, value: unknown) {
    const original = this[key];
    return Prisma.Decimal.isDecimal(original) ? original.toNumber() : value;
  });
}
