/** Conexiones simultáneas cuando `DATABASE_POOL_SIZE` no está definido. */
export const DEFAULT_POOL_SIZE = 10;

/** Máximo que admite `DATABASE_POOL_SIZE`: más no acelera nada y agota el servidor. */
export const MAX_POOL_SIZE = 50;

/**
 * Límites del pool de conexiones con MariaDB.
 *
 * Todos explícitos: los valores por defecto del driver (`mariadb`) suponen un servidor
 * propio —mantienen abiertas todas las conexiones y no limitan lo que dura una consulta—,
 * y en cPanel la base es compartida y el cupo de conexiones por usuario es pequeño.
 */
export interface PoolSettings {
  /** Conexiones simultáneas como máximo. */
  connectionLimit: number;
  /** Conexiones que se conservan abiertas sin uso; las demás se cierran al pasar `idleTimeout`. */
  minimumIdle: number;
  /** **Segundos** sin uso antes de cerrar una conexión sobrante. */
  idleTimeout: number;
  /** Milisegundos que una petición espera por una conexión libre antes de fallar. */
  acquireTimeout: number;
  /** Milisegundos que puede durar una consulta antes de que MariaDB la corte. */
  queryTimeout: number;
}

/**
 * Interpreta `DATABASE_POOL_SIZE`. Un valor que no sea un entero positivo se ignora con
 * aviso: mejor arrancar con el tamaño por defecto que no arrancar.
 */
export function readPoolSize(raw: string | undefined): { size: number; warning: string | null } {
  const text = raw?.trim();
  if (!text) return { size: DEFAULT_POOL_SIZE, warning: null };

  const value = Number(text);
  if (!Number.isInteger(value) || value < 1) {
    return {
      size: DEFAULT_POOL_SIZE,
      warning: `DATABASE_POOL_SIZE="${text}" no es un número entero de conexiones; se usa ${DEFAULT_POOL_SIZE}.`,
    };
  }
  if (value > MAX_POOL_SIZE) {
    return {
      size: MAX_POOL_SIZE,
      warning: `DATABASE_POOL_SIZE=${value} supera el máximo admitido; se usa ${MAX_POOL_SIZE}.`,
    };
  }
  return { size: value, warning: null };
}

export function poolSettings(connectionLimit: number): PoolSettings {
  return {
    // cPanel suele limitar las conexiones de cada usuario de base (`max_user_connections`) y
    // phpMyAdmin, las copias de seguridad y los despliegues usan ese mismo cupo.
    connectionLimit,
    // Las justas para atender sin esperar la primera petición tras un rato sin tráfico.
    minimumIdle: Math.min(2, connectionLimit),
    // Por debajo del `wait_timeout` que ponen algunos alojamientos compartidos (60 s): así
    // cierra la conexión el pool y no el servidor a mitad de uso.
    idleTimeout: 50,
    acquireTimeout: 10_000,
    // Un informe desbocado no puede retener una conexión indefinidamente: MariaDB lo corta
    // (`max_statement_time`, error 1969) y la conexión vuelve al pool. Sólo MariaDB lo
    // admite; con MySQL el driver no llegaría a conectar.
    queryTimeout: 15_000,
  };
}
