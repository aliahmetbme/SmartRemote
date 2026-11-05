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

export type XmlFetcher = (url: string, timeoutMs: number, sourceAddress: string) => Promise<string>;

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
  private readonly xmlFetcher?: XmlFetcher;
  private readonly defaultTimeoutMs: number;
  private scanCompletion: Promise<void> | null = null;

  constructor(
    private readonly transport: IUdpSocketTransport,
    options: LGWebOSSSDPStrategyOptions = {},
  ) {
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.xmlFetcher = options.xmlFetcher;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 4000;
  }

  isAvailable(): boolean {
    return this.transport.isAvailable();
  }

  async discover(options: DiscoveryOptions = {}): Promise<TVDevice[]> {
    const previous = this.scanCompletion;
    let release!: () => void;
    const completion = new Promise<void>(resolve => { release = resolve; });
    this.scanCompletion = completion;
    if (previous) await previous;
    try {
      if (options.signal?.aborted) return [];
      return await this.runDiscovery(options);
    } finally {
      release();
      if (this.scanCompletion === completion) this.scanCompletion = null;
    }
  }

  private async runDiscovery(options: DiscoveryOptions): Promise<TVDevice[]> {
    if (!this.isAvailable()) {
      throw new TVDiscoveryError(
        'SSDP UDP multicast is not available in the current environment',
        'unsupported_transport',
      );
    }

    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const discovered = new Map<string, TVDevice>();
    const emitted = new Set<string>();
    const xmlFetcher = this.xmlFetcher;
    const counters = { sent: 0, received: 0, parsed: 0, recognized: 0, emitted: 0,
      malformed: 0, unrelated: 0, invalidOrigin: 0, unsafeLocation: 0, duplicate: 0,
      uuidIdentity: 0, addressIdentity: 0, xmlStarted: 0, xmlCompleted: 0, xmlFailed: 0 };
    const start = Date.now();
    let outcome = 'bind-failed';
    let boundPort: number | undefined;
    let active = true;
    let cleanup: (() => void) | undefined;
    let timer: unknown;

    const emit = (device: TVDevice) => {
      if (options.signal?.aborted || emitted.has(device.id)) return;
      emitted.add(device.id);
      counters.emitted++;
      try { options.onDeviceFound?.(device); } catch { /* A listener cannot prevent scan cleanup. */ }
    };

    try {
      boundPort = await this.transport.bind(0);
      if (options.signal?.aborted) {
        outcome = 'cancelled';
        return [];
      }
      return await new Promise<TVDevice[]>((resolve, reject) => {
        const finish = (reason: string, error?: Error) => {
          if (!active) return;
          active = false;
          outcome = reason;
          if (error) {
            reject(error);
            return;
          }
          if (reason !== 'cancelled') discovered.forEach(emit);
          resolve([...discovered.values()].filter(device => emitted.has(device.id)));
        };
        const abort = () => finish('cancelled');
        options.signal?.addEventListener('abort', abort, { once: true });
        timer = this.scheduler.setTimeout(() => finish('completed'), timeoutMs);
        const removeError = this.transport.onError?.(error => finish('receive-failed', error));
        const removeMessage = this.transport.onMessage((msg, rinfo) => {
          if (!active) return;
          counters.received++;
          const packet = parseSSDPResponse(msg);
          if (!packet) { counters.malformed++; return; }
          counters.parsed++;
          if (packet.headers.st?.toLowerCase() !== LG_WEBOS_SSDP_ST) {
            counters.unrelated++;
            return;
          }

          const ipAddress = rinfo.address;
          if (!isLocalIPv4Address(ipAddress) || ipAddress.startsWith('127.')) {
            counters.invalidOrigin++;
            return;
          }

          const uuid = extractUUIDFromUSN(packet.headers.usn);
          const deviceId = uuid ? `lg-${uuid}` : `lg-webos-${ipAddress}`;
          if (discovered.has(deviceId)) { counters.duplicate++; return; }

          counters.recognized++;
          if (uuid) counters.uuidIdentity++; else counters.addressIdentity++;
          const device: TVDevice = {
            id: deviceId,
            name: `LG webOS TV (${ipAddress})`,
            ipAddress,
            brand: TVBrand.LG,
            platform: TVPlatform.WebOS,
            protocol: TVProtocol.LGWebOSSSAP,
            capabilities: UNKNOWN_CAPABILITIES,
            pairingStatus: PairingStatus.Unpaired,
          };
          // Recognition is synchronous. Optional metadata cannot remove a recognized TV.
          discovered.set(deviceId, device);
          const location = packet.headers.location;
          if (!location || extractHostFromLocation(location)?.host !== ipAddress) {
            if (location) counters.unsafeLocation++;
            emit(device);
            return;
          }
          if (!xmlFetcher || counters.xmlStarted >= 4) { emit(device); return; }
          counters.xmlStarted++;
          (async () => {
            let result = device;
            try {
              const xml = await xmlFetcher(location, Math.min(1500, timeoutMs), ipAddress);
              if (!active) return;
              const info = parseUPnPDeviceXml(xml);
              result = { ...device, name: info.friendlyName ?? device.name,
                model: info.modelName ?? info.modelNumber };
              counters.xmlCompleted++;
            } catch {
              if (!active) return;
              counters.xmlFailed++;
            }
            discovered.set(deviceId, result);
            emit(result);
          })().catch(() => undefined);
        });
        cleanup = () => {
          options.signal?.removeEventListener('abort', abort);
          removeError?.();
          removeMessage();
        };

        this.transport.send(createMSearchPacket(), SSDP_MULTICAST_PORT, SSDP_MULTICAST_ADDRESS)
          .then(() => { if (active) counters.sent++; })
          .catch(error => finish('send-failed', new TVDiscoveryError(
            'Failed to broadcast SSDP discovery query',
            error instanceof TVDiscoveryError ? error.code : 'network_unavailable', error,
          )));
      });
    } finally {
      active = false;
      cleanup?.();
      this.scheduler.clearTimeout(timer);
      await this.transport.close().catch(() => undefined);
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.debug('[SmartRemote][SSDP]', {
          outcome, boundPort, destination: `${SSDP_MULTICAST_ADDRESS}:${SSDP_MULTICAST_PORT}`,
          durationMs: Date.now() - start, cleanup: 'finished', ...counters,
        });
      }
    }
  }
}
