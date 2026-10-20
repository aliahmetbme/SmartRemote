import { TVDevice } from '../../domain/entities/TVDevice';
import { ITVDeviceRepository } from '../../domain/interfaces/ITVDeviceRepository';
import { RestoreLastTVUseCase } from './RestoreLastTVUseCase';

export interface StartupResult {
  savedDevices: TVDevice[];
  restoredDevice: TVDevice | null;
  lastSelectedId: string | null;
  error?: Error;
}

/**
 * Handles application startup: loads saved devices and attempts bounded restoration
 * of the last connected TV.
 */
export class StartupRestorationUseCase {
  constructor(
    private readonly repository: ITVDeviceRepository,
    private readonly restoreLastTV: RestoreLastTVUseCase,
  ) {}

  async execute(): Promise<StartupResult> {
    const savedDevices = await this.repository.getAll();
    const lastSelectedId = await this.repository.getLastSelectedId();
    let restoredDevice: TVDevice | null = null;
    let error: Error | undefined;

    try {
      restoredDevice = await this.restoreLastTV.execute();
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
    }

    return {
      savedDevices,
      restoredDevice,
      lastSelectedId,
      error,
    };
  }
}
