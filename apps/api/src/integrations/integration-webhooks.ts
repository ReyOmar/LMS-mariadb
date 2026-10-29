import { createHmac } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { Country } from '../common/domain/country';
import { refreshIntegrationPanels, REQUEST_FIELDS } from './external-request';
import { ExternalEnrollmentView, IntegrationViews } from './integration-views';

/** Lo que se espera a que conteste el otro sistema. */
const TIMEOUT_MS = 10_000;
/** Cada cuánto se reintenta un aviso que no se pudo entregar. */
const RETRY_MS = 15 * 60 * 1000;
/** Avisos que se envían, como mucho, en cada pasada. */
const BATCH_SIZE = 100;

/** Lo que se le envía al otro sistema, en JSON. */
type Notice =
  | { event: 'enrollment-request.updated'; sentAt: string; request: ExternalEnrollmentView }
  | { event: 'ping'; sentAt: string };

/** Cómo le fue a un sistema en una pasada: su error de antes y el de ahora, `null` si recibió el aviso. */
interface Outcome {
  country: Country;
  before: string | null;
  error: string | null;
}

/** Lo que se lee de una solicitud con aviso pendiente: lo que se le contesta y a dónde avisar. */
const NOTICE_FIELDS = {
  ...REQUEST_FIELDS,
  client: { select: { id: true, country: true, callbackUrl: true, keyHash: true, noticeError: true } },
} satisfies Prisma.ExternalEnrollmentSelect;

/**
 * Avisos a los sistemas conectados de cada cambio en sus solicitudes: quedó matriculada, terminó el
 * curso, la dieron de baja o se rechazó. Cada aviso lleva la solicitud tal como la devuelve su
 * consulta, y va a la dirección que el administrador configuró para el sistema: así el PESV
 * desbloquea al conductor en cuanto termina, sin tener que preguntar.
 *
 * Lo pendiente se deduce de la base, no de quién cambió qué: una solicitud cuyo estado ya no es el
 * último que se le contó al sistema (`estado_avisado`) tiene un aviso por entregar. Así no se pierde
 * ninguno aunque el proceso se reinicie, el sistema no conteste o no tenga dirección todavía: se
 * reintenta cada 15 minutos y sale en cuanto la tenga.
 */
@Injectable()
export class IntegrationWebhooks {
  constructor(
    private readonly prisma: PrismaService,
    private readonly views: IntegrationViews,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Entrega los avisos pendientes, de la solicitud más antigua a la más reciente. Un sistema que no
   * contesta no se vuelve a intentar en la misma pasada. Lo llama la tarea de cada minuto.
   *
   * @returns Cuántos se entregaron.
   */
  async deliverPending(): Promise<number> {
    // El estado que se le contaría hoy, como lo calcula `statusReport`: el guardado, salvo una
    // matrícula que ya no sigue en pie, que se cuenta como cancelada.
    const pending = await this.prisma.$queryRaw<{ guid: string }[]>`
      SELECT m.guid
      FROM lms_matriculas_externas m
      JOIN lms_clientes_integracion c ON c.id = m.cliente_id
      LEFT JOIN lms_matriculas e ON e.usuario_guid = m.usuario_guid AND e.curso_guid = m.curso_guid
      WHERE c.url_avisos IS NOT NULL AND c.clave_hash IS NOT NULL
        AND m.estado <> 'EN_ESPERA'
        AND (m.aviso_reintento IS NULL OR m.aviso_reintento <= ${new Date()})
        AND NOT (m.estado_avisado <=> IF(m.estado = 'MATRICULADA' AND NOT (e.activa <=> 1), 'CANCELADA', m.estado))
      ORDER BY m.created_at
      LIMIT ${BATCH_SIZE}`;

    const outcomes = new Map<number, Outcome>();
    let delivered = 0;
    for (const { guid } of pending) {
      const { client, ...request } = await this.prisma.externalEnrollment.findUniqueOrThrow({
        where: { guid },
        select: NOTICE_FIELDS,
      });
      if (outcomes.get(client.id)?.error || !client.callbackUrl || !client.keyHash) continue;

      const view = await this.views.request(request);
      const error = await send(client.callbackUrl, client.keyHash, {
        event: 'enrollment-request.updated',
        sentAt: new Date().toISOString(),
        request: view,
      });
      outcomes.set(client.id, { country: client.country, before: client.noticeError, error });
      await this.prisma.externalEnrollment.update({
        where: { guid },
        data: error
          ? { noticeRetryAt: new Date(Date.now() + RETRY_MS) }
          : { notifiedStatus: view.status, noticeRetryAt: null },
      });
      if (!error) delivered++;
    }

    await this.record(outcomes);
    return delivered;
  }

  /** Envía un aviso de prueba a la dirección del sistema, para comprobarla desde el panel. */
  async ping(id: number, country: Country): Promise<{ delivered: boolean; message: string }> {
    const client = await this.prisma.integrationClient.findFirst({
      where: { id, country },
      select: { callbackUrl: true, keyHash: true, noticeError: true },
    });
    if (!client) throw new NotFoundException('Sistema conectado no encontrado.');
    if (!client.callbackUrl) throw new ConflictException('Escribe primero la dirección a la que avisar al sistema.');
    if (!client.keyHash)
      throw new ConflictException('El sistema está desconectado: genera su clave para poder avisarle.');

    const error = await send(client.callbackUrl, client.keyHash, { event: 'ping', sentAt: new Date().toISOString() });
    await this.record(new Map([[id, { country, before: client.noticeError, error }]]));
    if (error) return { delivered: false, message: `El aviso de prueba no llegó. ${error}` };

    await this.resume(id);
    return { delivered: true, message: 'El sistema recibió el aviso de prueba.' };
  }

  /** Los avisos del sistema que esperaban un reintento salen en la pasada siguiente. */
  async resume(clientId: number): Promise<void> {
    await this.prisma.externalEnrollment.updateMany({
      where: { clientId, noticeRetryAt: { not: null } },
      data: { noticeRetryAt: null },
    });
  }

  /** Apunta en cada sistema cómo fue su último aviso; si empezó o dejó de fallar, lo ven los paneles de su sede. */
  private async record(outcomes: Map<number, Outcome>): Promise<void> {
    for (const [id, { country, before, error }] of outcomes) {
      await this.prisma.integrationClient.update({
        where: { id },
        data: { lastNoticeAt: new Date(), noticeError: error },
      });
      if (error !== before) refreshIntegrationPanels(this.realtime, country);
    }
  }
}

/**
 * Envía un aviso firmado a la dirección del sistema.
 *
 * La firma, en `X-Lms-Signature`, es `t=<segundos>,v1=<HMAC-SHA256 en hexadecimal de "<t>.<cuerpo>">`.
 * Su secreto es el resumen SHA-256 de la clave del sistema, que el campus guarda y el sistema puede
 * calcular: no hay otro secreto que entregar, y renovar la clave lo renueva. No sigue redirecciones:
 * el aviso va sólo a la dirección configurada.
 *
 * @returns Por qué no lo recibió, o `null` si contestó con un 2xx.
 */
async function send(url: string, keyHash: string, notice: Notice): Promise<string | null> {
  const body = JSON.stringify(notice);
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', keyHash).update(`${timestamp}.${body}`).digest('hex');
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Lms-Signature': `t=${timestamp},v1=${digest}` },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await response.body?.cancel();
    if (response.ok) return null;
    if (response.status >= 300 && response.status < 400) return 'La dirección redirige a otra: escribe la definitiva.';
    return `Respondió con el código ${response.status}.`;
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') return `No respondió en ${TIMEOUT_MS / 1000} s.`;
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    return `No se pudo conectar: ${cause instanceof Error ? cause.message : String(cause)}`.slice(0, 255);
  }
}
