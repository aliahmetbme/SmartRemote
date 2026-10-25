import { Scheduler } from '../../../domain/interfaces/IScheduler';
import { UNKNOWN_CAPABILITIES } from '../../../domain/entities/TVCapabilities';
import { TVDevice } from '../../../domain/entities/TVDevice';
import { PairingStatus } from '../../../domain/enums/PairingStatus';
import { TVBrand } from '../../../domain/enums/TVBrand';
import { TVPlatform } from '../../../domain/enums/TVPlatform';
import { TVProtocol } from '../../../domain/enums/TVProtocol';
import { TVDiscoveryError } from '../../../domain/errors/TVDiscoveryError';
import { DiscoveryOptions } from '../../../domain/interfaces/ITVDiscoveryService';
import {
  createMSearchPacket,
  extractHostFromLocation,
  extractUUIDFromUSN,
  isLocalIPv4Address,
  LG_WEBOS_SSDP_ST,
  parseSSDPResponse,
  SSDP_MULTICAST_ADDRESS,
  SSDP_MULTICAST_PORT,
} from '../ssdp/SSDPParser';
import { parseUPnPDeviceXml } from '../ssdp/UPnPDeviceDescriptionParser';
import { IUdpSocketTransport } from '../transport/IUdpSocketTransport';
import { IDiscoveryStrategy } from './IDiscoveryStrategy';

export type XmlFetcher = (url: string, timeoutMs: number) => Promise<string>;

const defaultXmlFetcher: XmlFetcher = async (url: string, timeoutMs: number): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/xml, application/xml' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
};

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface LGWebOSSSDPStrategyOptions {
  scheduler?: Scheduler;
  xmlFetcher?: XmlFetcher;
  defaultTimeoutMs?: number;
}

/**
 * Discovers LG webOS Smart TVs using the standard SSDP protocol over UDP multicast.
 * Targets urn:lge-com:service:webos-second-screen:1.
 */
export class LGWebOSSSDPDiscoveryStrategy implements IDiscoveryStrategy {
  readonly id = 'lg-webos-ssdp';
  private readonly scheduler: Scheduler;
  private readonly xmlFetcher: XmlFetcher;
  private readonly defaultTimeoutMs: number;

  constructor(
    private readonly transport: IUdpSocketTransport,
    options: LGWebOSSSDPStrategyOptions = {},
  ) {
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.xmlFetcher = options.xmlFetcher ?? defaultXmlFetcher;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 4000;
  }

  isAvailable(): boolean {
    return this.transport.isAvailable();
  }

  async discover(options: DiscoveryOptions = {}): Promise<TVDevice[]> {
    if (!this.isAvailable()) {
      throw new TVDiscoveryError(
        'SSDP UDP multicast is not available in the current environment',
        'unsupported_transport',
      );
    }

    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const discovered = new Map<string, TVDevice>();
    const pendingIds = new Set<string>();

    let cleanupListener: (() => void) | null = null;
    let timer: unknown = null;

    try {
      await this.transport.bind(0);

      const discoveryPromise = new Promise<TVDevice[]>((resolve, reject) => {
        if (options.signal?.aborted) {
          return resolve([]);
        }

        const onAbort = () => {
          this.scheduler.clearTimeout(timer);
          resolve(Array.from(discovered.values()));
        };

        options.signal?.addEventListener('abort', onAbort, { once: true });

        timer = this.scheduler.setTimeout(() => {
          options.signal?.removeEventListener('abort', onAbort);
          resolve(Array.from(discovered.values()));
        }, timeoutMs);

        cleanupListener = this.transport.onMessage((msg, rinfo) => {
          this.handleIncomingDatagram(
            msg,
            rinfo.address,
            discovered,
            pendingIds,
            options.onDeviceFound,
          ).catch(() => {
            // Ignore individual packet handling errors
          });
        });

        const packet = createMSearchPacket(LG_WEBOS_SSDP_ST, 3);
        this.transport.send(packet, SSDP_MULTICAST_PORT, SSDP_MULTICAST_ADDRESS).catch(err => {
          this.scheduler.clearTimeout(timer);
          options.signal?.removeEventListener('abort', onAbort);
          reject(new TVDiscoveryError('Failed to broadcast SSDP discovery query', 'network_unavailable', err));
        });
      });

      return await discoveryPromise;
    } finally {
      if (typeof cleanupListener === 'function') {
        (cleanupListener as () => void)();
      }
      this.scheduler.clearTimeout(timer);
      await this.transport.close().catch(() => undefined);
    }
  }

  private async handleIncomingDatagram(
    msg: string,
    remoteAddress: string,
    discovered: Map<string, TVDevice>,
    pendingIds: Set<string>,
    onDeviceFound?: (device: TVDevice) => void,
  ): Promise<void> {
    const packet = parseSSDPResponse(msg);
    if (!packet) {
      return;
    }

    const st = packet.headers.st;
    if (!st || !st.toLowerCase().includes('webos-second-screen')) {
      return;
    }

    const location = packet.headers.location;
    const locationHost = extractHostFromLocation(location);
    const ipAddress = locationHost?.host ?? remoteAddress;

    if (!isLocalIPv4Address(ipAddress)) {
      return;
    }

    const uuid = extractUUIDFromUSN(packet.headers.usn);
    const deviceId = uuid ? `lg-${uuid}` : `lg-webos-${ipAddress}`;

    if (discovered.has(deviceId) || pendingIds.has(deviceId)) {
      return;
    }
    pendingIds.add(deviceId);

    let friendlyName = `LG webOS TV (${ipAddress})`;
    let modelName: string | undefined;

    if (location && isLocalIPv4Address(locationHost?.host ?? '')) {
      try {
        const xml = await this.xmlFetcher(location, 1500);
        const info = parseUPnPDeviceXml(xml);
        if (info.friendlyName) {
          friendlyName = info.friendlyName;
        }
        if (info.modelName || info.modelNumber) {
          modelName = info.modelName ?? info.modelNumber;
        }
      } catch {
        // Fall back to default name if UPnP description XML fails to load
      }
    }

    const device: TVDevice = {
      id: deviceId,
      name: friendlyName,
      brand: TVBrand.LG,
      model: modelName,
      ipAddress,
      platform: TVPlatform.WebOS,
      protocol: TVProtocol.LGWebOSSSAP,
      capabilities: UNKNOWN_CAPABILITIES,
      pairingStatus: PairingStatus.Unpaired,
    };

    discovered.set(deviceId, device);
    onDeviceFound?.(device);
  }
}
