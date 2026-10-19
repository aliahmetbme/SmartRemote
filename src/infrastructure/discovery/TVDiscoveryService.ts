import { TVDevice } from '../../domain/entities/TVDevice';
import { TVDiscoveryError } from '../../domain/errors/TVDiscoveryError';
import { DiscoveryOptions, ITVDiscoveryService } from '../../domain/interfaces/ITVDiscoveryService';
import { IDiscoveryStrategy } from './discovery-strategies/IDiscoveryStrategy';
import { ManualIPDiscoveryStrategy } from './discovery-strategies/ManualIPDiscoveryStrategy';

export interface TVDiscoveryServiceOptions {
  strategies?: IDiscoveryStrategy[];
  manualStrategy?: ManualIPDiscoveryStrategy;
}

/**
 * Composite discovery service orchestrating multiple pluggable discovery strategies.
 * Implements ITVDiscoveryService and deduplicates devices across strategies.
 */
export class TVDiscoveryService implements ITVDiscoveryService {
  private readonly strategies: IDiscoveryStrategy[];
  private readonly manualStrategy: ManualIPDiscoveryStrategy;

  constructor(options: TVDiscoveryServiceOptions = {}) {
    this.strategies = options.strategies ?? [];
    this.manualStrategy = options.manualStrategy ?? new ManualIPDiscoveryStrategy();
  }

  async discover(options: DiscoveryOptions = {}): Promise<TVDevice[]> {
    const availableStrategies = this.strategies.filter(s => s.isAvailable());

    if (this.strategies.length > 0 && availableStrategies.length === 0) {
      throw new TVDiscoveryError(
        'Automatic SSDP discovery is unavailable on this device because UDP multicast transport is not supported without Apple multicast entitlements. Please connect using your TV IP address below.',
        'unsupported_transport',
      );
    }

    if (availableStrategies.length === 0) {
      return [];
    }

    const byId = new Map<string, TVDevice>();
    const strategyErrors: Error[] = [];

    const wrappedOnDeviceFound = (device: TVDevice) => {
      if (!byId.has(device.id)) {
        byId.set(device.id, device);
        options.onDeviceFound?.(device);
      }
    };

    const strategyPromises = availableStrategies.map(async strategy => {
      try {
        const found = await strategy.discover({
          ...options,
          onDeviceFound: wrappedOnDeviceFound,
        });
        found.forEach(device => {
          if (!byId.has(device.id)) {
            byId.set(device.id, device);
          }
        });
      } catch (err) {
        strategyErrors.push(err instanceof Error ? err : new Error(String(err)));
      }
    });

    await Promise.all(strategyPromises);

    if (byId.size === 0 && strategyErrors.length === availableStrategies.length && strategyErrors.length > 0) {
      throw strategyErrors[0];
    }

    return Array.from(byId.values());
  }

  /**
   * Directly probes a manual IP address.
   */
  async probeManualIP(ipAddress: string, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<TVDevice> {
    return this.manualStrategy.probe(ipAddress, options);
  }
}
