import { applyDecorators } from '@nestjs/common';
import { IsEmail, Matches, MaxLength } from 'class-validator';
import { NormalizeEmail } from './transforms';

const INVALID_EMAIL = 'El correo electrónico no es válido.';

/** Lo que cabe en las columnas de correo de la base. */
const EMAIL_MAX_LENGTH = 191;

/** Caracteres ASCII visibles: ni espacios, ni tildes, ni letras de otros alfabetos. */
const ASCII_ONLY = /^[\x21-\x7e]+$/;

/**
 * Correo de una cuenta: normalizado, de longitud que cabe en la base y sólo con caracteres
 * ASCII.
 *
 * La base compara los correos sin distinguir tildes (`utf8mb4_unicode_ci`): admitir
 * `juan@empresá.com` encontraría la cuenta de `juan@empresa.com`, y lo que se pidiera con él
 * —un enlace de recuperación, una tanda más de intentos de contraseña— se contaría o se
 * enviaría como si fuera otro correo. Los dominios internacionales se admiten en su forma
 * ASCII (`xn--…`).
 */
export const AccountEmail = () =>
  applyDecorators(
    IsEmail({ allow_utf8_local_part: false }, { message: INVALID_EMAIL }),
    Matches(ASCII_ONLY, { message: INVALID_EMAIL }),
    MaxLength(EMAIL_MAX_LENGTH, { message: `El correo no puede superar los ${EMAIL_MAX_LENGTH} caracteres.` }),
    NormalizeEmail(),
  );
