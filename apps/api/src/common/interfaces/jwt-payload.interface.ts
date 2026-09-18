import { Pais } from '../domain/pais';

/** Roles del sistema. Espejo de `lms_rol_usuario` en Prisma. */
export type RolUsuario = 'ADMINISTRADOR' | 'PROFESOR' | 'ESTUDIANTE';

/**
 * Identidad autenticada que `JwtAuthGuard` adjunta a `request.user`.
 *
 * `rol` y `pais` se refrescan desde la base de datos en cada petición, no se leen del
 * token: si un administrador cambia el rol de alguien o desactiva su cuenta, el efecto
 * es inmediato sin esperar a que caduque el JWT.
 *
 * Es el **único** origen admitido de identidad. Ningún controlador debe aceptar un
 * `usuario_guid` o un `pais` por query o por cuerpo para decidir a quién pertenecen
 * los datos.
 */
export interface JwtPayload {
  /** GUID del usuario (claim `sub`). */
  sub: string;
  /** Correo, para trazas y correos. */
  email: string;
  /** Rol vigente en base de datos. */
  role: RolUsuario;
  /** Sede a la que pertenece el usuario. Acota toda consulta de la petición. */
  pais: Pais;
  /** Identificador único de esta sesión (claim `jti`), para revocarla por separado. */
  jti: string;
  /** Emisión del token, en segundos (claim `iat`). */
  iat: number;
  /** Caducidad del token, en segundos (claim `exp`). */
  exp: number;
}

/** Claims que se firman al emitir un token. El resto los añade `jsonwebtoken`. */
export interface JwtClaims {
  sub: string;
  jti: string;
  email: string;
  role: RolUsuario;
  pais: Pais;
}
