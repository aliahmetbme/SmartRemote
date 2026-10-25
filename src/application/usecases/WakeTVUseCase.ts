import { TVDevice } from '../../domain/entities/TVDevice';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { TVConnectionError, TVTimeoutError } from '../../domain/errors/TVConnectionError';
import { ITVWakeService, WakeOptions } from '../../domain/interfaces/ITVWakeService';
import { Scheduler } from '../../domain/interfaces/IScheduler';
import { isValidMacAddress } from '../../domain/utils/macValidator';
import { TVConnectionManager } from '../services/TVConnectionManager';

export type WakeStage = 'sending' | 'waiting' | 'connecting' | 'connected' | 'failed';

export interface WakeTVExecutionOptions extends WakeOptions {
  /** Maximum time to wait for the TV to boot and respond to SSAP. Defaults to 22,000ms. */
  wakeTimeoutMs?: number;
  /** Interval between connection probe attempts while TV boots. Defaults to 1,500ms. */
  probeIntervalMs?: number;
  /** Initial delay after sending packet before first probe to let TV power hardware cycle. Defaults to 1,500ms. */
  initialBootDelayMs?: number;
  /** Progress callback for UI status updates. */
  onProgress?: (stage: WakeStage) => void;
  /** Optional cancellation signal. */
  abortSignal?: { aborted: boolean };
}

export interface WakeTVResult {
  success: boolean;
  restored: boolean;
  packetsSent: number;
  destinations: string[];
  error?: Error;
}

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class WakeTVUseCase {
  private inFlight: Map<string, Promise<WakeTVResult>> = new Map();

  constructor(
    private readonly wakeService: ITVWakeService,
    private readonly connectionManager: TVConnectionManager,
    private readonly scheduler: Scheduler = defaultScheduler,
  ) {}

  execute(
    device: TVDevice,
    options: WakeTVExecutionOptions = {},
  ): Promise<WakeTVResult> {
    if (!device.macAddress || !isValidMacAddress(device.macAddress)) {
      return Promise.reject(
        new TVConnectionError(
          'A valid TV MAC address is required to power on using Wake-on-LAN',
          'missing_mac',
        ),
      );
    }

    // Coalesce duplicate in-flight wake workflows for the same device
    const existing = this.inFlight.get(device.id);
    if (existing) {
      return existing;
    }

    const workflowPromise = (async () => {
      try {
        return await this.runWakeWorkflow(device, options);
      } finally {
        this.inFlight.delete(device.id);
      }
    })();

    this.inFlight.set(device.id, workflowPromise);
    return workflowPromise;
  }

  private async runWakeWorkflow(
    device: TVDevice,
    options: WakeTVExecutionOptions,
  ): Promise<WakeTVResult> {
    const {
      wakeTimeoutMs = 22000,
      probeIntervalMs = 1500,
      initialBootDelayMs = 1500,
      onProgress,
      abortSignal,
    } = options;

    const delay = (ms: number): Promise<void> =>
      new Promise(resolve => this.scheduler.setTimeout(resolve, ms));

    // 1. Send Wake-on-LAN Magic Packet
    onProgress?.('sending');
    let wakeResult;
    try {
      wakeResult = await this.wakeService.wake(device.macAddress!, {
        port: options.port ?? 9,
        broadcastAddress: options.broadcastAddress,
        repeatCount: options.repeatCount ?? 3,
        delayMs: options.delayMs ?? 50,
      });
    } catch (err) {
      onProgress?.('failed');
      throw err;
    }

    // 2. Initial hardware boot wait
    onProgress?.('waiting');
    if (initialBootDelayMs > 0) {
      await delay(initialBootDelayMs);
    }

    // 3. Bounded restoration polling loop
    const startTime = Date.now();
    let lastError: Error | undefined;

    while (Date.now() - startTime < wakeTimeoutMs) {
      if (abortSignal?.aborted) {
        throw new TVConnectionError('Wake-on-LAN cancelled', 'cancelled');
      }

      // If already connected by foreground or user, resolve successfully
      if (
        this.connectionManager.getState() === TVConnectionState.Connected &&
        this.connectionManager.getDevice()?.id === device.id
      ) {
        onProgress?.('connected');
        return {
          success: true,
          restored: true,
          packetsSent: wakeResult.packetsSent,
          destinations: wakeResult.destinations,
        };
      }

      onProgress?.('connecting');
      try {
        await this.connectionManager.connect(device);
        if (this.connectionManager.getState() === TVConnectionState.Connected) {
          onProgress?.('connected');
          return {
            success: true,
            restored: true,
            packetsSent: wakeResult.packetsSent,
            destinations: wakeResult.destinations,
          };
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // TV is still booting / network interface not yet answering SSAP; continue loop
      }

      if (abortSignal?.aborted) {
        throw new TVConnectionError('Wake-on-LAN cancelled', 'cancelled');
      }

      const elapsed = Date.now() - startTime;
      if (elapsed + probeIntervalMs < wakeTimeoutMs) {
        await delay(probeIntervalMs);
      } else {
        break;
      }
    }

    onProgress?.('failed');
    return {
      success: false,
      restored: false,
      packetsSent: wakeResult.packetsSent,
      destinations: wakeResult.destinations,
      error:
        lastError ??
        new TVTimeoutError(
          `TV at ${device.ipAddress} did not power on within ${wakeTimeoutMs / 1000}s. Ensure "TV On With Mobile" is enabled in TV settings.`,
        ),
    };
  }
}
