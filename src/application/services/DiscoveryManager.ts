import { TVDevice } from '../../domain/entities/TVDevice';
import { TVDiscoveryError, TVDiscoveryErrorCode } from '../../domain/errors/TVDiscoveryError';
import type { AppDispatch } from '../../store';
import { tvActions } from '../../store/slices/tvSlice';
import { DiscoverTVsUseCase } from '../usecases/DiscoverTVsUseCase';

export interface StartDiscoveryOptions {
  timeoutMs?: number;
}

/**
 * Orchestrates device discovery workflows and dispatches serializable updates to Redux.
 */
export class DiscoveryManager {
  private abortController: AbortController | null = null;
  private isScanning = false;

  constructor(
    private readonly discoverTVs: DiscoverTVsUseCase,
    private readonly dispatch: AppDispatch,
  ) {}

  getIsScanning(): boolean {
    return this.isScanning;
  }

  async startDiscovery(options: StartDiscoveryOptions = {}): Promise<TVDevice[]> {
    this.cancelDiscovery();

    this.abortController = new AbortController();
    this.isScanning = true;
    this.dispatch(tvActions.discoveryStarted());

    try {
      const devices = await this.discoverTVs.execute({
        timeoutMs: options.timeoutMs,
        signal: this.abortController.signal,
        onDeviceFound: device => {
          this.dispatch(tvActions.deviceDiscovered(device));
        },
      });

      for (const device of devices) {
        this.dispatch(tvActions.deviceDiscovered(device));
      }

      this.isScanning = false;
      this.dispatch(tvActions.discoveryCompleted());
      return devices;
    } catch (error) {
      this.isScanning = false;
      const code: TVDiscoveryErrorCode | 'unknown' =
        error instanceof TVDiscoveryError ? error.code : 'unknown';
      const message =
        error instanceof Error ? error.message : 'Device discovery failed';
      this.dispatch(tvActions.discoveryFailed({ code, message }));
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  cancelDiscovery(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.isScanning) {
      this.isScanning = false;
      this.dispatch(tvActions.discoveryCompleted());
    }
  }
}
