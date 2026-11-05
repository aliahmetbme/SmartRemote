import { TVDevice } from '../../domain/entities/TVDevice';
import { TVDiscoveryError, TVDiscoveryErrorCode } from '../../domain/errors/TVDiscoveryError';
import { DiscoverTVsUseCase } from '../usecases/DiscoverTVsUseCase';

export interface StartDiscoveryOptions {
  timeoutMs?: number;
}

export interface DiscoveryErrorInfo {
  code: TVDiscoveryErrorCode | 'unknown';
  message: string;
}

export interface IDiscoveryEventListener {
  onDiscoveryStarted?(): void;
  onDeviceDiscovered?(device: TVDevice): void;
  onDiscoveryCompleted?(): void;
  onDiscoveryFailed?(error: DiscoveryErrorInfo): void;
}

/**
 * Orchestrates device discovery workflows and emits framework-agnostic lifecycle events.
 * The presentation / store integration boundary binds these events to state management.
 */
export class DiscoveryManager {
  private abortController: AbortController | null = null;
  private isScanning = false;
  private readonly listeners: Set<IDiscoveryEventListener> = new Set();

  constructor(
    private readonly discoverTVs: DiscoverTVsUseCase,
    listener?: IDiscoveryEventListener,
  ) {
    if (listener) {
      this.listeners.add(listener);
    }
  }

  addListener(listener: IDiscoveryEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getIsScanning(): boolean {
    return this.isScanning;
  }

  async startDiscovery(options: StartDiscoveryOptions = {}): Promise<TVDevice[]> {
    this.cancelDiscovery();

    const controller = new AbortController();
    this.abortController = controller;
    this.isScanning = true;
    this.emitStarted();

    try {
      const devices = await this.discoverTVs.execute({
        timeoutMs: options.timeoutMs,
        signal: controller.signal,
        onDeviceFound: device => {
          if (this.abortController === controller) this.emitDeviceDiscovered(device);
        },
      });

      if (this.abortController !== controller) return devices;
      for (const device of devices) {
        this.emitDeviceDiscovered(device);
      }

      this.isScanning = false;
      this.emitCompleted();
      return devices;
    } catch (error) {
      if (this.abortController !== controller) return [];
      this.isScanning = false;
      const code: TVDiscoveryErrorCode | 'unknown' =
        error instanceof TVDiscoveryError ? error.code : 'unknown';
      const message =
        error instanceof Error ? error.message : 'Device discovery failed';
      this.emitFailed({ code, message });
      throw error;
    } finally {
      if (this.abortController === controller) this.abortController = null;
    }
  }

  cancelDiscovery(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.isScanning) {
      this.isScanning = false;
      this.emitCompleted();
    }
  }

  private emitStarted(): void {
    for (const listener of this.listeners) {
      listener.onDiscoveryStarted?.();
    }
  }

  private emitDeviceDiscovered(device: TVDevice): void {
    for (const listener of this.listeners) {
      listener.onDeviceDiscovered?.(device);
    }
  }

  private emitCompleted(): void {
    for (const listener of this.listeners) {
      listener.onDiscoveryCompleted?.();
    }
  }

  private emitFailed(error: DiscoveryErrorInfo): void {
    for (const listener of this.listeners) {
      listener.onDiscoveryFailed?.(error);
    }
  }
}
