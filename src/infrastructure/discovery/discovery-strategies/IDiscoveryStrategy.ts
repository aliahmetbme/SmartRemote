import { TVDevice } from '../../../domain/entities/TVDevice';
import { DiscoveryOptions } from '../../../domain/interfaces/ITVDiscoveryService';

export interface IDiscoveryStrategy {
  /**
   * Unique identifier for the strategy (e.g. 'ssdp', 'manual').
   */
  readonly id: string;

  /**
   * Returns whether this strategy is runnable in the current runtime environment.
   */
  isAvailable(): boolean;

  /**
   * Performs discovery and resolves with all unique devices found by this strategy.
   */
  discover(options?: DiscoveryOptions): Promise<TVDevice[]>;
}
