import { BadRequestException } from '@nestjs/common';
import { createValidationPipe } from './validation.pipe';
import { AccountEmail } from './account-email';

class Account {
  @AccountEmail()
  email: string;
}

async function validated(email: string): Promise<string | null> {
  try {
    const result = (await createValidationPipe().transform({ email }, { type: 'body', metatype: Account })) as Account;
    return result.email;
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return null;
  }
}

/** Los mensajes con que la API rechaza el correo, tal como los recibe el usuario. */
async function rejectionOf(email: string): Promise<string[]> {
  try {
    await createValidationPipe().transform({ email }, { type: 'body', metatype: Account });
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { message: string[] }).message;
  }
  throw new Error(`Se admitió ${email}`);
}

const INVALID = 'El correo electrónico no es válido.';
const NON_ASCII = 'El correo electrónico no puede llevar espacios, tildes, eñes ni letras de otros alfabetos.';

/**
 * La base compara los correos sin distinguir tildes, así que un correo con ellas encontraría
 * otra cuenta. Sólo se admiten en ASCII, y siempre normalizados.
 */
describe('AccountEmail', () => {
  it('admite un correo corriente y lo deja sin espacios y en minúsculas', async () => {
    expect(await validated('  Ana.Ruiz@Empresa.com ')).toBe('ana.ruiz@empresa.com');
  });

  it('admite un dominio internacional en su forma ASCII', async () => {
    expect(await validated('ana@xn--empres-dva.com')).toBe('ana@xn--empres-dva.com');
  });

  it.each(['ána@empresa.com', 'ana@empresá.com', 'ana@ｅmpresa.com'])('rechaza %s', async (email) => {
    expect(await validated(email)).toBeNull();
  });

  it.each(['juan@empresá.com', 'juán@empresa.com', '"ana ruiz"@empresa.com'])(
    '%s recibe un único mensaje, el que dice qué sobra',
    async (email) => {
      expect(await rejectionOf(email)).toEqual([NON_ASCII]);
    },
  );

  it('con un espacio en medio salen el genérico y el que dice qué sobra, sin repetirse', async () => {
    expect(await rejectionOf('ana ruiz@empresa.com')).toEqual([INVALID, NON_ASCII]);
  });

  it.each(['no-es-correo', '', '   '])('a %p, que no es un correo, le basta el mensaje genérico', async (email) => {
    expect(await rejectionOf(email)).toEqual([INVALID]);
  });

  it('rechaza lo que no cabe en la columna de la base', async () => {
    const longDomain = ['a', 'b', 'c', 'd'].map((letter) => letter.repeat(60)).join('.');
    const email = `ana@${longDomain}.com`;
    expect(email.length).toBeGreaterThan(191);
    expect(await validated(email)).toBeNull();
  });
});
