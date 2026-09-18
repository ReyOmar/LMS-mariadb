/**
 * Separación por país (tenancy) — fuente única de verdad.
 *
 * El LMS opera dos sedes independientes, Colombia y México. La regla del sistema es que
 * **ningún dato cruza de una a otra**: usuarios, cursos, matrículas, entregas, certificados,
 * mensajes, notificaciones y configuración de marca pertenecen a un único país.
 *
 * El país se decide en dos momentos y en ninguno más:
 *  1. Al crear la cuenta (solicitud de acceso o alta por administrador).
 *  2. Al iniciar sesión, donde se comprueba que coincide con el de la cuenta.
 *
 * A partir de ahí viaja dentro del JWT y el `PaisGuard` lo inyecta en cada petición. Los
 * servicios lo reciben como argumento explícito: no se deduce de cabeceras, del dominio ni
 * de ningún dato que el cliente pueda manipular.
 */

/** Códigos de país admitidos. Coincide con el enum `lms_pais` de Prisma. */
export const PAISES = ['COLOMBIA', 'MEXICO'] as const;

export type Pais = (typeof PAISES)[number];

/** País asignado a los datos existentes antes de la separación. */
export const PAIS_POR_DEFECTO: Pais = 'COLOMBIA';

interface MetadatosPais {
  /** Nombre para mostrar en la interfaz. */
  readonly nombre: string;
  /** Código ISO 3166-1 alfa-2, usado en banderas e i18n. */
  readonly iso: string;
  /** Zona horaria por defecto de la sede. */
  readonly zonaHoraria: string;
  /** Prefijo telefónico internacional. */
  readonly prefijoTelefonico: string;
}

export const METADATOS_PAIS: Readonly<Record<Pais, MetadatosPais>> = {
  COLOMBIA: {
    nombre: 'Colombia',
    iso: 'CO',
    zonaHoraria: 'America/Bogota',
    prefijoTelefonico: '+57',
  },
  MEXICO: {
    nombre: 'México',
    iso: 'MX',
    zonaHoraria: 'America/Mexico_City',
    prefijoTelefonico: '+52',
  },
};

/** Comprueba si un valor arbitrario es un país válido. */
export function esPais(valor: unknown): valor is Pais {
  return typeof valor === 'string' && (PAISES as readonly string[]).includes(valor);
}

/**
 * Convierte una entrada externa en un país válido, o `null` si no lo es.
 * Acepta el código en cualquier capitalización para tolerar query params escritos a mano,
 * pero no adivina: una entrada desconocida devuelve `null` y quien llama decide qué hacer.
 */
export function normalizarPais(valor: unknown): Pais | null {
  if (typeof valor !== 'string') return null;
  const candidato = valor.trim().toUpperCase();
  return esPais(candidato) ? candidato : null;
}

/** Nombre legible del país, para mensajes de error y correos. */
export function nombrePais(pais: Pais): string {
  return METADATOS_PAIS[pais].nombre;
}
