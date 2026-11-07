import { connectionClock, connectionTiming, timeConnectionStage } from '../../diagnostics/connectionTiming';
import { TVDevice } from '../../domain/entities/TVDevice';
import { ITVDeviceRepository } from '../../domain/interfaces/ITVDeviceRepository';
import { HydrateDevicesUseCase, HydrationResult } from './HydrateDevicesUseCase';
import { RestoreLastTVUseCase } from './RestoreLastTVUseCase';

export interface StartupOptions {
  /**
   * Optional callback fired as soon as repository hydration completes,
   * enabling the UI to render saved devices immediately without blocking on network connection.
   */
  onHydrated?: (result: HydrationResult) => void;
}

export interface StartupResult {
  savedDevices: TVDevice[];
  restoredDevice: TVDevice | null;
  lastSelectedId: string | null;
  error?: Error;
}

/**
 * Handles application startup: single authoritative coordinator for initial device hydration
 * and subsequent non-blocking network restoration of the last active TV session.
 */
export class StartupRestorationUseCase {
  private readonly hydrateDevices: HydrateDevicesUseCase;

  constructor(
    repositoryOrHydrate: ITVDeviceRepository | HydrateDevicesUseCase,
    private readonly restoreLastTV: RestoreLastTVUseCase,
  ) {
    if ('execute' in repositoryOrHydrate && typeof repositoryOrHydrate.execute === 'function') {
      this.hydrateDevices = repositoryOrHydrate as HydrateDevicesUseCase;
    } else {
      this.hydrateDevices = new HydrateDevicesUseCase(repositoryOrHydrate as ITVDeviceRepository);
    }
  }

  async execute(options?: StartupOptions): Promise<StartupResult> {
    const started = connectionClock();
    const revision = this.hydrateDevices.getRevision();
    const hydration = await timeConnectionStage('startup-hydration', () => this.hydrateDevices.execute());
    if (hydration.superseded) {
      return {
        savedDevices: [],
        restoredDevice: null,
        lastSelectedId: null,
      };
    }
    options?.onHydrated?.(hydration);

    let restoredDevice: TVDevice | null = null;
    let error: Error | undefined;

    if (hydration.selectedDeviceId) {
      try {
        restoredDevice = await this.restoreLastTV.execute(() => this.hydrateDevices.getRevision() === revision);
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));
      }
    }

    connectionTiming('startup-restoration', started, restoredDevice ? 'ready' : error ? 'failed' : 'no-restoration');
    return {
      savedDevices: hydration.savedDevices,
      restoredDevice,
      lastSelectedId: hydration.selectedDeviceId,
      error,
    };
  }
}
