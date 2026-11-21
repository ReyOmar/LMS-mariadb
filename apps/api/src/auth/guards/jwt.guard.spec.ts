import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtGuard } from './jwt.guard';
import { IS_PUBLIC } from '../../common/decorators/public.decorator';
import { BEFORE_CONSENT } from '../../common/decorators/before-consent.decorator';

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
  /** La versión de la política de datos que aceptó; nula si ninguna. */
  dataConsentVersion: string | null;
} = {
  guid: 'ana',
  email: 'ana@pesv.test',
  role: 'STUDENT',
  country: 'COLOMBIA',
  currentSessionJti: 'sesion-actual',
  dataConsentVersion: 'politica-vigente',
};

const TOKEN = { sub: 'ana', jti: 'sesion-actual', iat: 1_700_000_000 };

/** Lo que lanza Prisma cuando no consigue una conexión con la base. */
const DATABASE_DOWN = new Error('pool failed to retrieve a connection from pool');

interface Scenario {
  account?: Partial<typeof ACCOUNT> | null;
  token?: Partial<typeof TOKEN>;
  /** Cómo está marcada la ruta: `@Public()` o `@BeforeConsent()`. */
  route?: Record<string, boolean>;
  /** La firma del token no es la del campus, o ya caducó. */
  forgedToken?: boolean;
  /** La base no responde al buscar la cuenta. */
  databaseDown?: boolean;
}

function createGuard({ account = {}, token = {}, route = {}, forgedToken = false, databaseDown = false }: Scenario) {
  const payload = { ...TOKEN, ...token };
  const prisma = {
    user: {
      findUnique: async () => {
        if (databaseDown) throw DATABASE_DOWN;
        return account === null ? null : { ...ACCOUNT, ...account };
      },
      // El guard anota `lastAccessAt` de quien pasa; aquí sólo hace falta que exista.
      update: async () => ({}),
    },
  };

  const reflector = { getAllAndOverride: (key: string) => route[key] };
  const settings = { legalVersion: async () => 'politica-vigente' };

  const verifyAsync = async () => {
    if (forgedToken) throw new Error('invalid signature');
    return payload;
  };

  return new JwtGuard({ verifyAsync } as never, reflector as never, prisma as never, settings as never);
}

/** Una petición con token a una ruta marcada como indique el escenario. */
function admits(scenario: Scenario): Promise<boolean> {
  const request = { headers: { authorization: 'Bearer token' } };
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return createGuard(scenario).canActivate(context as unknown as ExecutionContext);
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

  it('iniciar sesión en otra pestaña o dispositivo se explica como tal, no como una revocación', async () => {
    const reason = await rejectionReason({ token: { jti: 'sesion-vieja' } });

    // El cliente reconoce el motivo por «otro dispositivo».
    expect(reason).toContain('otra pestaña');
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

/**
 * Un 401 le dice al navegador que la sesión murió, y la borra. Sólo puede salir cuando de verdad
 * murió: si lo que falla es la base, la sesión sigue siendo buena y el fallo se dice como tal.
 */
describe('JwtGuard · un fallo de la base no es una sesión caducada', () => {
  it('un token con la firma mal o caducado sí responde 401', async () => {
    await expect(admits({ forgedToken: true })).rejects.toThrow(
      new UnauthorizedException('Token inválido o expirado.'),
    );
  });

  it('con la base caída el error sale tal cual, no como un 401', async () => {
    const rejection = await admits({ databaseDown: true }).catch((error: unknown) => error);

    expect(rejection).toBe(DATABASE_DOWN);
    expect(rejection).not.toBeInstanceOf(UnauthorizedException);
  });

  it('una ruta pública se atiende como anónima en los dos casos', async () => {
    await expect(admits({ forgedToken: true, route: { [IS_PUBLIC]: true } })).resolves.toBe(true);
    await expect(admits({ databaseDown: true, route: { [IS_PUBLIC]: true } })).resolves.toBe(true);
  });
});

/**
 * Sin aceptar la política de tratamiento de datos vigente en su sede no se usa el campus. La
 * pantalla lo pide antes que nada; la API no deja saltárselo llamándola directamente.
 */
describe('JwtGuard · política de tratamiento de datos', () => {
  it('con la política vigente aceptada, pasa', async () => {
    await expect(admits({})).resolves.toBe(true);
  });

  it('sin aceptarla, o si aceptó una que ya cambió, la API no deja usar el campus', async () => {
    for (const dataConsentVersion of [null, 'politica-anterior']) {
      await expect(admits({ account: { dataConsentVersion } })).rejects.toThrow(
        new ForbiddenException('Para usar el campus tienes que aceptar la política de tratamiento de datos.'),
      );
    }
  });

  it('lo necesario para aceptarla o salir sí se puede antes, como las rutas públicas', async () => {
    await expect(admits({ account: { dataConsentVersion: null }, route: { [BEFORE_CONSENT]: true } })).resolves.toBe(
      true,
    );
    await expect(admits({ account: { dataConsentVersion: null }, route: { [IS_PUBLIC]: true } })).resolves.toBe(true);
  });
});
