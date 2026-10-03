import { UnauthorizedException } from '@nestjs/common';
import { JwtGuard } from './jwt.guard';

/**
 * Por qué se queda alguien fuera.
 *
 * El mensaje de esta excepción es lo único que el usuario llega a leer, y el cliente lo
 * usa para decidir si enseña «tu sesión caducó» o «un administrador retiró tu acceso».
 * Confundirlos asusta sin motivo: iniciar sesión en el móvil no puede decirle a nadie que
 * le dieron de baja la cuenta.
 *
 * Lo que decide si un token vale es la base, no una lista en memoria de cada proceso: el
 * guardián no recibe ninguna lista, así que las pruebas lo demuestran solas.
 */

const ACCOUNT: {
  guid: string;
  email: string;
  role: string;
  country: string;
  /** Nulo cuando se cerró la sesión o se cambió o restableció la contraseña. */
  currentSessionJti: string | null;
} = {
  guid: 'ana',
  email: 'ana@pesv.test',
  role: 'STUDENT',
  country: 'COLOMBIA',
  currentSessionJti: 'sesion-actual',
};

const TOKEN = { sub: 'ana', jti: 'sesion-actual', iat: 1_700_000_000 };

interface Scenario {
  account?: Partial<typeof ACCOUNT> | null;
  token?: Partial<typeof TOKEN>;
}

function createGuard({ account = {}, token = {} }: Scenario) {
  const payload = { ...TOKEN, ...token };
  const prisma = {
    user: {
      findUnique: async () => (account === null ? null : { ...ACCOUNT, ...account }),
      // El guard anota `lastAccessAt` de quien pasa; aquí sólo hace falta que exista.
      update: async () => ({}),
    },
  };

  return new JwtGuard({ verifyAsync: async () => payload } as never, {} as never, prisma as never);
}

/** Ejecuta la resolución y devuelve el mensaje del rechazo, o `null` si pasó. */
async function rejectionReason(scenario: Scenario): Promise<string | null> {
  const guard = createGuard(scenario);
  try {
    await guard['resolveIdentity']('token');
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(UnauthorizedException);
    return (error as UnauthorizedException).message;
  }
}

describe('JwtGuard · por qué se corta una sesión', () => {
  it('deja pasar a una cuenta con su sesión vigente', async () => {
    expect(await rejectionReason({})).toBeNull();
  });

  it('una cuenta borrada se explica como tal, no como una sesión revocada', async () => {
    const reason = await rejectionReason({ account: null });

    expect(reason).toContain('ya no existe');
    expect(reason).not.toContain('revocada');
  });

  it('iniciar sesión en otro dispositivo se explica como tal, no como una revocación', async () => {
    const reason = await rejectionReason({ token: { jti: 'sesion-vieja' } });

    expect(reason).toContain('otro dispositivo');
    expect(reason).not.toContain('revocada');
  });

  it('una sesión cerrada deja de valer sin depender de ninguna lista en memoria', async () => {
    // Cerrar sesión y cambiar o restablecer la contraseña dejan la sesión vigente a nulo, y
    // eso basta para rechazar el token en cualquier proceso.
    const reason = await rejectionReason({ account: { currentSessionJti: null } });

    expect(reason).toContain('revocada');
  });

  it('un token sin identificador de sesión no vale para nada', async () => {
    // Un token emitido sin `jti` no corresponde a ninguna sesión registrada.
    expect(await rejectionReason({ token: { jti: undefined } })).not.toBeNull();
    expect(await rejectionReason({ token: { jti: undefined }, account: { currentSessionJti: null } })).not.toBeNull();
  });

  it('la cuenta borrada manda sobre cualquier otro motivo', async () => {
    expect(await rejectionReason({ account: null, token: { jti: 'sesion-vieja' } })).toContain('ya no existe');
  });
});
