import { TVDevice } from '../../domain/entities/TVDevice';
import { DiscoveryOptions, ITVDiscoveryService } from '../../domain/interfaces/ITVDiscoveryService';

/** Runs a scan and returns devices deduplicated by id (later sightings win). */
export class DiscoverTVsUseCase {
  constructor(private readonly discovery: ITVDiscoveryService) {}

  async execute(options?: DiscoveryOptions): Promise<TVDevice[]> {
    const found = await this.discovery.discover(options);
    const byId = new Map<string, TVDevice>();
    found.forEach(device => byId.set(device.id, device));
    return Array.from(byId.values());
  }
}
