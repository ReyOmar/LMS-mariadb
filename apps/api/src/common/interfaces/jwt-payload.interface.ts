import { Country } from '../domain/country';

/** Roles del sistema. Espejo del enum `Role` de Prisma. */
export const ROLES = ['ADMIN', 'TEACHER', 'STUDENT'] as const;

export type UserRole = (typeof ROLES)[number];

/**
 * Identidad autenticada que `JwtGuard` adjunta a `request.user`.
 *
 * `role` y `country` se refrescan desde la base de datos en cada petición, no se leen del
 * token: si un administrador cambia el rol de alguien o borra su cuenta, el efecto es
 * inmediato sin esperar a que caduque el JWT.
 *
 * Es el **único** origen admitido de identidad. Ningún controlador debe aceptar un
 * `userGuid` o un `country` por query o por cuerpo para decidir a quién pertenecen
 * los datos.
 */
export interface JwtPayload {
  /** GUID del usuario (claim `sub`). */
  sub: string;
  /** Correo, para trazas y correos. */
  email: string;
  /** Rol vigente en base de datos. */
  role: UserRole;
  /** Sede a la que pertenece el usuario. Acota toda consulta de la petición. */
  country: Country;
  /** Identificador único de esta sesión (claim `jti`), para revocarla por separado. */
  jti: string;
  /** Emisión del token, en segundos (claim `iat`). */
  iat: number;
  /** Caducidad del token, en segundos (claim `exp`). */
  exp: number;
}

/**
 * Lo que se firma en el token: quién es y qué sesión. Rol, sede y correo se leen de la base en
 * cada petición (`JwtGuard`), así que no viajan en él. `iat` y `exp` los añade `jsonwebtoken`.
 */
export interface JwtClaims {
  sub: string;
  jti: string;
}
