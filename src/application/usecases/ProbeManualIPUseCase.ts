import { TVDevice } from '../../domain/entities/TVDevice';
import { IManualIPProber, ProbeOptions } from '../../domain/interfaces/IManualIPProber';

/**
 * Use case to validate and probe a manual IP address.
 * Resolves with a candidate TVDevice ready for connection.
 */
export class ProbeManualIPUseCase {
  constructor(private readonly prober: IManualIPProber) {}

  execute(ipAddress: string, options?: ProbeOptions): Promise<TVDevice> {
    return this.prober.probe(ipAddress, options);
  }
}
