import { lookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { request } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Redes a las que nunca se envía un aviso: la propia máquina, las privadas, las de enlace local
 * —entre ellas la de metadatos de los proveedores de nube— y las reservadas o de difusión.
 */
const INTERNAL_NETWORKS = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  INTERNAL_NETWORKS.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  INTERNAL_NETWORKS.addSubnet(network, prefix, 'ipv6');
}

/** Si la IP es de una red interna. Una IPv4 escrita como IPv6 (`::ffff:10.0.0.1`) se mira como IPv4. */
export function isInternalAddress(address: string): boolean {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped) return INTERNAL_NETWORKS.check(mapped[1], 'ipv4');
  return INTERNAL_NETWORKS.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');
}

/** La dirección del otro sistema lleva a una red interna. */
export class InternalAddressError extends Error {
  constructor(readonly address: string) {
    super(`La dirección apunta a una red interna (${address}).`);
  }
}

/** El otro sistema no contestó a tiempo. */
export class NoAnswerError extends Error {}

/**
 * Resolución de nombres que no entrega una IP interna, salvo para los nombres que el servidor
 * permite de forma expresa. Se valida la IP con la que de verdad se conecta, al conectar: el nombre
 * no puede cambiar de IP entre la comprobación y la conexión.
 */
function guardedLookup(allowedHosts: ReadonlySet<string>): LookupFunction {
  return (hostname, options: LookupOptions, callback) => {
    lookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
      const internal = error ? undefined : addresses.find(({ address }) => isInternalAddress(address));
      const refusal =
        internal && !allowedHosts.has(hostname.toLowerCase()) ? new InternalAddressError(internal.address) : null;
      const failure = error ?? (refusal as NodeJS.ErrnoException | null);
      if (options.all) callback(failure, failure ? [] : addresses);
      else callback(failure, failure ? '' : addresses[0].address, failure ? undefined : addresses[0].family);
    });
  };
}

/**
 * Cómo salen los avisos hacia los otros sistemas: un POST por HTTPS a la dirección que configuró el
 * administrador, sin seguir redirecciones y nunca hacia una red interna, para que esa dirección no
 * sirva para alcanzar servicios del propio servidor o de su red.
 *
 * `WEBHOOK_PRIVATE_HOSTS` (nombres o IP separados por comas) permite, a quien administra el servidor,
 * un sistema que de verdad está en la red interna: el panel del campus no puede hacerlo por sí solo.
 */
@Injectable()
export class WebhookTransport {
  private readonly allowed: ReadonlySet<string>;
  private readonly lookup: LookupFunction;

  constructor(config: ConfigService) {
    this.allowed = new Set(
      (config.get<string>('WEBHOOK_PRIVATE_HOSTS') ?? '')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    );
    this.lookup = guardedLookup(this.allowed);
  }

  /** Envía el cuerpo, en JSON, y devuelve el código con que contestó. Corta a los `timeoutMs`. */
  post(url: string, headers: Record<string, string>, body: string, timeoutMs: number): Promise<number> {
    const signal = AbortSignal.timeout(timeoutMs);
    return new Promise((resolve, reject) => {
      // Una IP escrita tal cual se conecta sin pasar por la resolución de nombres: se mira aquí.
      const host = new URL(url).hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase();
      if (isIP(host) && isInternalAddress(host) && !this.allowed.has(host)) {
        reject(new InternalAddressError(host));
        return;
      }
      const outgoing = request(
        url,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          lookup: this.lookup,
          signal,
        },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      outgoing.on('error', (error) => reject(signal.aborted ? new NoAnswerError() : error));
      outgoing.end(body);
    });
  }
}
