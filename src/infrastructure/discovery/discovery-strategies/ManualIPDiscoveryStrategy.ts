import { Scheduler } from '../../../application/services/TVConnectionManager';
import { UNKNOWN_CAPABILITIES } from '../../../domain/entities/TVCapabilities';
import { TVDevice } from '../../../domain/entities/TVDevice';
import { PairingStatus } from '../../../domain/enums/PairingStatus';
import { TVBrand } from '../../../domain/enums/TVBrand';
import { TVPlatform } from '../../../domain/enums/TVPlatform';
import { TVProtocol } from '../../../domain/enums/TVProtocol';
import { TVDiscoveryError } from '../../../domain/errors/TVDiscoveryError';
import { DiscoveryOptions } from '../../../domain/interfaces/ITVDiscoveryService';
import { isLocalIPv4Address } from '../ssdp/SSDPParser';
import { IDiscoveryStrategy } from './IDiscoveryStrategy';

export type EndpointProber = (ipAddress: string, timeoutMs: number) => Promise<boolean>;

const defaultEndpointProber: EndpointProber = (ipAddress: string, timeoutMs: number): Promise<boolean> => {
  return new Promise<boolean>(resolve => {
    let resolved = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let activeSocket: WebSocket | null = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (activeSocket) {
        activeSocket.onopen = null;
        activeSocket.onerror = null;
        activeSocket.onclose = null;
        try {
          activeSocket.close();
        } catch {
          // ignore
        }
        activeSocket = null;
      }
    };

    const finish = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(ok);
    };

    timer = setTimeout(() => finish(false), timeoutMs);

    let triedWss = false;
    const tryWss = () => {
      if (resolved || triedWss) return;
      triedWss = true;
      try {
        if (activeSocket) {
          activeSocket.onopen = null;
          activeSocket.onerror = null;
          activeSocket.onclose = null;
          try {
            activeSocket.close();
          } catch {
            // ignore
          }
          activeSocket = null;
        }

        const wss = new WebSocket(`wss://${ipAddress}:3001`);
        activeSocket = wss;
        wss.onopen = () => finish(true);
        wss.onerror = () => finish(false);
        wss.onclose = () => finish(false);
      } catch {
        finish(false);
      }
    };

    try {
      const ws = new WebSocket(`ws://${ipAddress}:3000`);
      activeSocket = ws;
      ws.onopen = () => finish(true);
      ws.onerror = () => tryWss();
      ws.onclose = () => {
        // If closed before open, attempt WSS on port 3001
        tryWss();
      };
    } catch {
      tryWss();
    }
  });
};

export interface ManualIPStrategyOptions {
  prober?: EndpointProber;
  scheduler?: Scheduler;
  probeTimeoutMs?: number;
}

/**
 * Strategy to validate and probe a specific manual IP address entered by the user.
 * Avoids indiscriminate subnet scanning.
 */
export class ManualIPDiscoveryStrategy implements IDiscoveryStrategy {
  readonly id = 'manual-ip';
  private readonly prober: EndpointProber;
  private readonly probeTimeoutMs: number;

  constructor(options: ManualIPStrategyOptions = {}) {
    this.prober = options.prober ?? defaultEndpointProber;
    this.probeTimeoutMs = options.probeTimeoutMs ?? 3000;
  }

  isAvailable(): boolean {
    return true;
  }

  /**
   * Discovers a TV via manual IP.
   */
  async discover(_options?: DiscoveryOptions): Promise<TVDevice[]> {
    return [];
  }

  /**
   * Validates and probes a specific manual IP address.
   * Throws TVDiscoveryError if the address is invalid or unreachable.
   */
  async probe(ipAddress: string, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<TVDevice> {
    const trimmed = ipAddress.trim();

    if (!isLocalIPv4Address(trimmed)) {
      throw new TVDiscoveryError(
        `"${ipAddress}" is not a valid local IPv4 address (e.g. 192.168.1.50)`,
        'invalid_response',
      );
    }

    if (options?.signal?.aborted) {
      throw new TVDiscoveryError('Manual IP probe was cancelled', 'cancelled');
    }

    const timeoutMs = options?.timeoutMs ?? this.probeTimeoutMs;
    const isReachable = await this.prober(trimmed, timeoutMs);

    if (!isReachable) {
      throw new TVDiscoveryError(
        `Could not reach an LG webOS TV at ${trimmed}. Ensure the TV is on and on the same Wi-Fi network.`,
        'unsupported_device',
      );
    }

    // Probing verifies basic transport reachability on SSAP ports (3000/3001).
    // An open port alone does not establish legitimate LG TV identity.
    // Full device authentication and capability verification occur during connection/pairing.
    return {
      id: `manual-lg-${trimmed}`,
      name: `LG webOS TV (${trimmed})`,
      brand: TVBrand.LG,
      ipAddress: trimmed,
      platform: TVPlatform.WebOS,
      protocol: TVProtocol.LGWebOSSSAP,
      capabilities: UNKNOWN_CAPABILITIES,
      pairingStatus: PairingStatus.Unpaired,
    };
  }
}
