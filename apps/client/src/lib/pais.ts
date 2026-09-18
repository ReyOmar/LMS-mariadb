/**
 * Sedes del LMS en el cliente.
 *
 * El campus opera dos sedes independientes y los datos no se mezclan nunca. El navegador
 * sólo decide **qué sede mostrar antes de iniciar sesión** (portada, marca y formulario de
 * acceso); en cuanto hay sesión, la sede la manda el servidor a través del token y lo que
 * haya aquí deja de importar.
 *
 * Es decir: esto es una preferencia de presentación, no un control de acceso. Cambiar el
 * valor guardado no da acceso a nada de la otra sede.
 */

export const PAISES = ['COLOMBIA', 'MEXICO'] as const;

export type Pais = (typeof PAISES)[number];

export const PAIS_POR_DEFECTO: Pais = 'COLOMBIA';

interface DatosSede {
  readonly nombre: string;
  readonly gentilicio: string;
  /** Bandera como emoji, para no depender de un paquete de iconos. */
  readonly bandera: string;
  readonly iso: string;
}

export const SEDES: Readonly<Record<Pais, DatosSede>> = {
  COLOMBIA: { nombre: 'Colombia', gentilicio: 'colombiana', bandera: '🇨🇴', iso: 'CO' },
  MEXICO: { nombre: 'México', gentilicio: 'mexicana', bandera: '🇲🇽', iso: 'MX' },
};

const CLAVE_ALMACENAMIENTO = 'lms_pais';

export function esPais(valor: unknown): valor is Pais {
  return typeof valor === 'string' && (PAISES as readonly string[]).includes(valor);
}

export function nombreSede(pais: Pais): string {
  return SEDES[pais].nombre;
}

/**
 * Sede elegida, o `null` si todavía no se ha elegido ninguna.
 *
 * Devuelve `null` en lugar de suponer una sede: la portada necesita distinguir «no ha
 * elegido» de «eligió Colombia» para poder mostrar el selector la primera vez.
 */
export function leerSedeGuardada(): Pais | null {
  if (typeof window === 'undefined') return null;
  try {
    const guardada = window.localStorage.getItem(CLAVE_ALMACENAMIENTO);
    return esPais(guardada) ? guardada : null;
  } catch {
    // Modo privado o almacenamiento bloqueado: se trata como «sin elegir».
    return null;
  }
}

export function guardarSede(pais: Pais): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLAVE_ALMACENAMIENTO, pais);
  } catch {
    // Si no se puede guardar, la elección vale para esta pestaña y se volverá a pedir.
  }
}

export function olvidarSede(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CLAVE_ALMACENAMIENTO);
  } catch {
    /* nada que hacer */
  }
}
