import { TVDevice } from '../entities/TVDevice';

export interface DiscoveryOptions {
  timeoutMs?: number;
  /** Abort to cancel an in-progress scan. */
  signal?: AbortSignal;
  /** Called as devices are found, before the scan completes. */
  onDeviceFound?: (device: TVDevice) => void;
}

export interface ITVDiscoveryService {
  /** Resolves with devices found when the scan ends (timeout, cancel, or completion). */
  discover(options?: DiscoveryOptions): Promise<TVDevice[]>;
}
