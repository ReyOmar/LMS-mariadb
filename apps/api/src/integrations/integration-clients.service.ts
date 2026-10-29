import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { Country } from '../common/domain/country';
import { hashKey, issueKey } from './integration-key';
import type { IntegrationCaller } from './integration-auth';
import { refreshIntegrationPanels } from './external-request';
import { IntegrationWebhooks } from './integration-webhooks';

/** Cada cuánto, como mucho, se apunta el último uso de una clave: no hace falta una escritura por petición. */
const LAST_USE_INTERVAL_MS = 5 * 60 * 1000;

/** Lo que el panel enseña de cada sistema conectado. Nunca la clave ni su resumen. */
const CLIENT_VIEW = {
  id: true,
  name: true,
  keyPrefix: true,
  keyIssuedAt: true,
  lastUsedAt: true,
  callbackUrl: true,
  lastNoticeAt: true,
  noticeError: true,
  createdAt: true,
  _count: { select: { requests: true } },
} satisfies Prisma.IntegrationClientSelect;

/**
 * Sistemas externos autorizados en cada sede y sus claves.
 *
 * Cada sistema tiene como mucho una clave vigente. Se entrega una sola vez, al generarla; si
 * se pierde o se filtra, se genera otra y la anterior deja de valer en el acto. Uno que ya no se
 * usa se desconecta y, después, se puede eliminar.
 */
@Injectable()
export class IntegrationClientsService {
  private readonly logger = new Logger(IntegrationClientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly webhooks: IntegrationWebhooks,
  ) {}

  /** El sistema al que pertenece una clave vigente, o `null`. */
  async authenticate(key: string): Promise<IntegrationCaller | null> {
    const client = await this.prisma.integrationClient.findUnique({
      where: { keyHash: hashKey(key) },
      select: { id: true, name: true, country: true, lastUsedAt: true },
    });
    if (!client) return null;

    if (!client.lastUsedAt || Date.now() - client.lastUsedAt.getTime() > LAST_USE_INTERVAL_MS) {
      void this.prisma.integrationClient
        .update({ where: { id: client.id }, data: { lastUsedAt: new Date() } })
        .catch((error) => this.logger.warn(`No se pudo apuntar el uso de la clave de «${client.name}»: ${error}`));
    }
    return { id: client.id, name: client.name, country: client.country };
  }

  list(country: Country) {
    return this.prisma.integrationClient.findMany({
      where: { country },
      select: CLIENT_VIEW,
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Da de alta un sistema con su primera clave. */
  async create(name: string, country: Country) {
    const { key, hash, prefix } = issueKey();
    const client = await this.prisma.integrationClient.create({
      data: { country, name, keyHash: hash, keyPrefix: prefix, keyIssuedAt: new Date() },
      select: CLIENT_VIEW,
    });
    this.logger.log(`Sistema conectado en ${country}: «${name}» (${prefix}…)`);
    return { client, key };
  }

  /** Sustituye la clave de un sistema, revocado o no: la anterior deja de valer. */
  async renewKey(id: number, country: Country) {
    await this.ensureExists(id, country);
    const { key, hash, prefix } = issueKey();
    const client = await this.prisma.integrationClient.update({
      where: { id },
      data: { keyHash: hash, keyPrefix: prefix, keyIssuedAt: new Date() },
      select: CLIENT_VIEW,
    });
    this.logger.log(`Clave renovada de «${client.name}» (${country}): ${prefix}…`);
    return { client, key };
  }

  /** Desconecta un sistema sin borrarlo: sus solicitudes siguen en pie y se pueden consultar aquí. */
  async revokeKey(id: number, country: Country) {
    await this.ensureExists(id, country);
    const client = await this.prisma.integrationClient.update({
      where: { id },
      data: { keyHash: null, keyPrefix: null, keyIssuedAt: null },
      select: CLIENT_VIEW,
    });
    this.logger.log(`Clave revocada de «${client.name}» (${country})`);
    return client;
  }

  /**
   * Fija la dirección a la que se avisa al sistema de los cambios en sus solicitudes, o la quita.
   * Los avisos que esperaban un reintento salen en la pasada siguiente, ya a la dirección nueva.
   */
  async setCallback(id: number, url: string | null, country: Country) {
    await this.ensureExists(id, country);
    const client = await this.prisma.integrationClient.update({
      where: { id },
      data: { callbackUrl: url, lastNoticeAt: null, noticeError: null },
      select: CLIENT_VIEW,
    });
    await this.webhooks.resume(id);
    this.logger.log(`Avisos de «${client.name}» (${country}): ${url ?? 'sin dirección'}`);
    return client;
  }

  /**
   * Elimina un sistema desconectado y el registro de sus solicitudes. Quien ya matriculó conserva
   * su matrícula y sus certificados; las que aún esperaban un curso dejan de esperar. Tiene que
   * estar desconectado: así no se borra por un descuido una conexión que sigue en uso.
   */
  async remove(id: number, country: Country) {
    const client = await this.prisma.integrationClient.findFirst({
      where: { id, country },
      select: { name: true, keyHash: true },
    });
    if (!client) throw new NotFoundException('Sistema conectado no encontrado.');
    if (client.keyHash)
      throw new ConflictException('Desconecta el sistema antes de eliminarlo: su clave sigue vigente.');

    const [{ count }] = await this.prisma.$transaction([
      this.prisma.externalEnrollment.deleteMany({ where: { clientId: id } }),
      this.prisma.integrationClient.delete({ where: { id } }),
    ]);
    this.logger.log(`Sistema eliminado en ${country}: «${client.name}» y ${count} solicitud(es)`);
    // Las que esperaban desaparecen de los paneles abiertos.
    if (count > 0) refreshIntegrationPanels(this.realtime, country);
    return { message: `«${client.name}» eliminado.` };
  }

  private async ensureExists(id: number, country: Country): Promise<void> {
    const client = await this.prisma.integrationClient.findFirst({ where: { id, country }, select: { id: true } });
    if (!client) throw new NotFoundException('Sistema conectado no encontrado.');
  }
}
