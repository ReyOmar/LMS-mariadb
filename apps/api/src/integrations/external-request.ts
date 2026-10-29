import { Prisma } from '@prisma/client';
import { Country } from '../common/domain/country';
import { RealtimeService } from '../realtime/realtime.service';

/** Lo que se lee de una solicitud para atenderla y para contestar por ella. */
export const REQUEST_FIELDS = {
  guid: true,
  externalId: true,
  country: true,
  infractionId: true,
  infraction: { select: { code: true, description: true, courseGuid: true } },
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  rejectionReason: true,
  userGuid: true,
  courseGuid: true,
  roundStartedAt: true,
  createdAt: true,
  course: { select: { title: true } },
  certificate: { select: { verificationCode: true, completedAt: true, validUntil: true } },
} satisfies Prisma.ExternalEnrollmentSelect;

/** Una matrícula pedida por otro sistema, tal como la manejan la recepción, la espera y la respuesta. */
export type ExternalRequest = Prisma.ExternalEnrollmentGetPayload<{ select: typeof REQUEST_FIELDS }>;

/** Los paneles de integración abiertos en la sede vuelven a pedir sus datos: algo cambió en ellos. */
export function refreshIntegrationPanels(realtime: RealtimeService, country: Country): void {
  realtime.emitToRole('integration:changed', {}, country, 'ADMIN');
}
