import { UnauthorizedException } from '@nestjs/common';
import { IntegrationKeyGuard, IntegrationCaller } from './integration-auth';

describe('IntegrationKeyGuard', () => {
  const PESV: IntegrationCaller = { id: 1, name: 'Software PESV', country: 'COLOMBIA' };

  function contextWith(headers: Record<string, string>) {
    const request: Record<string, unknown> = { headers };
    const context = { switchToHttp: () => ({ getRequest: () => request }) };
    return { context: context as never, request };
  }

  const guard = new IntegrationKeyGuard({
    authenticate: async (key: string) => (key === 'lms_valida' ? PESV : null),
  } as never);

  it('sin la cabecera X-Api-Key no deja pasar y dice qué falta', async () => {
    await expect(guard.canActivate(contextWith({}).context)).rejects.toThrow(/X-Api-Key/);
  });

  it('una clave inexistente o revocada no deja pasar', async () => {
    await expect(guard.canActivate(contextWith({ 'x-api-key': 'lms_otra' }).context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('con una clave vigente deja pasar y anota qué sistema llama, con su sede', async () => {
    const { context, request } = contextWith({ 'x-api-key': ' lms_valida ' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.integrationCaller).toEqual(PESV);
  });
});
