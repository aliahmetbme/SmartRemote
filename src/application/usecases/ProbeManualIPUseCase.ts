import { TVDevice } from '../../domain/entities/TVDevice';
import { ManualIPDiscoveryStrategy } from '../../infrastructure/discovery/discovery-strategies/ManualIPDiscoveryStrategy';

/**
 * Use case to validate and probe a manual IP address.
 * Resolves with a candidate TVDevice ready for connection.
 */
export class ProbeManualIPUseCase {
  constructor(private readonly manualStrategy: ManualIPDiscoveryStrategy) {}

  execute(ipAddress: string, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<TVDevice> {
    return this.manualStrategy.probe(ipAddress, options);
  }
}
