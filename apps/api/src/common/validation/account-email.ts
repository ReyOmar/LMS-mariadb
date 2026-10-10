import { applyDecorators } from '@nestjs/common';
import { IsEmail, Matches, MaxLength } from 'class-validator';
import { NormalizeEmail } from './transforms';

const INVALID_EMAIL = 'El correo electrónico no es válido.';

const NON_ASCII_EMAIL = 'El correo electrónico no puede llevar espacios, tildes, eñes ni letras de otros alfabetos.';

/** Lo que cabe en las columnas de correo de la base. */
const EMAIL_MAX_LENGTH = 191;

/**
 * Caracteres ASCII visibles: ni espacios, ni tildes, ni letras de otros alfabetos. Admite el
 * texto vacío para que un correo en blanco reciba sólo el mensaje genérico de `IsEmail`.
 */
const ASCII_ONLY = /^[\x21-\x7e]*$/;

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
    // Las tildes las rechaza `Matches`, con un mensaje que dice qué sobra. `IsEmail` las deja
    // pasar (con sus opciones por defecto, también antes de la @) para no sumarle el genérico.
    IsEmail(undefined, { message: INVALID_EMAIL }),
    Matches(ASCII_ONLY, { message: NON_ASCII_EMAIL }),
    MaxLength(EMAIL_MAX_LENGTH, { message: `El correo no puede superar los ${EMAIL_MAX_LENGTH} caracteres.` }),
    NormalizeEmail(),
  );
