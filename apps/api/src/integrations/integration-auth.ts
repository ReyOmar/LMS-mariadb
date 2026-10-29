import {
  applyDecorators,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { Country } from '../common/domain/country';
import { IntegrationClientsService } from './integration-clients.service';

/** Cabecera con la que otro sistema presenta su clave. Fastify entrega las cabeceras en minúsculas. */
const API_KEY_HEADER = 'x-api-key';

/** El sistema que hace la petición: su sede es la de todo lo que pida. */
export interface IntegrationCaller {
  id: number;
  name: string;
  country: Country;
}

type IntegrationRequest = FastifyRequest & { integrationCaller?: IntegrationCaller };

/** Exige una clave de integración vigente y deja a mano quién llama (ver `Caller`). */
@Injectable()
export class IntegrationKeyGuard implements CanActivate {
  constructor(private readonly clients: IntegrationClientsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IntegrationRequest>();
    const key = request.headers[API_KEY_HEADER];
    if (typeof key !== 'string' || !key.trim()) {
      throw new UnauthorizedException('Falta la clave de integración en la cabecera X-Api-Key.');
    }

    const caller = await this.clients.authenticate(key.trim());
    if (!caller) throw new UnauthorizedException('La clave de integración no es válida o fue revocada.');

    request.integrationCaller = caller;
    return true;
  }
}

/**
 * Ruta para otros sistemas. No llevan sesión de usuario —de ahí `Public`, que sólo exime del
 * token—: se identifican con su clave de integración.
 */
export const IntegrationAuth = () => applyDecorators(Public(), UseGuards(IntegrationKeyGuard));

/**
 * El sistema que llama, ya identificado por `IntegrationKeyGuard`. Como `CurrentUser`, falla en
 * lugar de devolver `undefined` si la ruta no lleva `IntegrationAuth`.
 */
export const Caller = createParamDecorator((_: unknown, context: ExecutionContext): IntegrationCaller => {
  const caller = context.switchToHttp().getRequest<IntegrationRequest>().integrationCaller;
  if (!caller) throw new UnauthorizedException('Falta la clave de integración en la cabecera X-Api-Key.');
  return caller;
});
