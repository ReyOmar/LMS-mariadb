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

  it('rechaza lo que no cabe en la columna de la base', async () => {
    const longDomain = ['a', 'b', 'c', 'd'].map((letter) => letter.repeat(60)).join('.');
    const email = `ana@${longDomain}.com`;
    expect(email.length).toBeGreaterThan(191);
    expect(await validated(email)).toBeNull();
  });
});
