import { isRetryableConnectionFailure } from '../../domain/entities/ConnectionDiagnostic';
import { connectionClock, connectionTiming } from '../../diagnostics/connectionTiming';
import { TVCapabilities } from '../../domain/entities/TVCapabilities';
import { TVDevice } from '../../domain/entities/TVDevice';
import { canTransition, TVConnectionState } from '../../domain/enums/TVConnectionState';
import { TVConnectionError, TVTimeoutError } from '../../domain/errors/TVConnectionError';
import { ITVAdapterFactory } from '../../domain/interfaces/ITVAdapterFactory';
import { ITVRemoteAdapter } from '../../domain/interfaces/ITVRemoteAdapter';
import { IScheduler, Scheduler } from '../../domain/interfaces/IScheduler';

export type { IScheduler, Scheduler };

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface ReconnectPolicy {
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
}

export interface TVConnectionManagerOptions {
  /** Budget for reaching the TV and getting the pairing prompt / registration. */
  connectTimeoutMs?: number;
  /**
   * Budget once the TV is showing its on-screen authorization prompt. Must exceed the
   * adapter's own pairing timeout so the adapter reports the precise error first.
   */
  pairingTimeoutMs?: number;
  reconnect?: Partial<ReconnectPolicy>;
  scheduler?: Scheduler;
}

export interface ConnectionSnapshot {
  state: TVConnectionState;
  device: TVDevice | null;
  /** Capabilities reported by the adapter; only set while Connected. */
  capabilities: TVCapabilities | null;
  error: Error | null;
  retryAttempt?: number;
}

export type ConnectionListener = (snapshot: ConnectionSnapshot) => void;

const DEFAULT_RECONNECT: ReconnectPolicy = { baseDelayMs: 1000, maxDelayMs: 30000, maxAttempts: 5 };
const DEFAULT_CONNECT_TIMEOUT_MS = 15000;
/** LGWebOSPairingService waits 60 s for the user; this adds a 5 s backstop. */
const DEFAULT_PAIRING_TIMEOUT_MS = 65000;

/**
 * Owns exactly one TV session at a time.
 *
 * - Duplicate connect() for the same device returns the in-flight promise.
 * - connect() to another device cancels and tears down the current session first.
 * - disconnect() cancels in-flight attempts and stops any retry loop.
 * - Unexpected drops trigger bounded exponential-backoff reconnection.
 */
export class TVConnectionManager {
  private readonly scheduler: Scheduler;
  private readonly connectTimeoutMs: number;
  private readonly pairingTimeoutMs: number;
  private readonly policy: ReconnectPolicy;
  private readonly listeners = new Set<ConnectionListener>();

  private state = TVConnectionState.Disconnected;
  private device: TVDevice | null = null;
  private adapter: ITVRemoteAdapter | null = null;
  private capabilities: TVCapabilities | null = null;
  private error: Error | null = null;

  private generation = 0;
  private inFlight: Promise<void> | null = null;
  private cancelAttempt: ((error: Error) => void) | null = null;
  /** Re-arms the current attempt's timeout (used when the pairing prompt appears). */
  private extendTimeout: ((ms: number, message: string) => void) | null = null;
  private unsubscribeAdapter: (() => void) | null = null;
  private retryTimer: unknown = null;
  private retryCount = 0;
  /** True when a device is targeted until the user disconnects explicitly. */
  private shouldRestore = false;
  private isBackgrounded = false;
  private isForegroundHandling = false;
  private lossCleanup: Promise<void> | null = null;

  constructor(
    private readonly adapterFactory: ITVAdapterFactory,
    options: TVConnectionManagerOptions = {},
  ) {
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.pairingTimeoutMs = options.pairingTimeoutMs ?? DEFAULT_PAIRING_TIMEOUT_MS;
    this.policy = { ...DEFAULT_RECONNECT, ...options.reconnect };
  }

  getOperationRevision(): number {
    return this.generation;
  }

  isAppBackgrounded(): boolean {
    return this.isBackgrounded;
  }

  isTargeting(deviceId: string): boolean {
    return (this.targetDevice ?? this.device)?.id === deviceId;
  }

  getState(): TVConnectionState {
    return this.state;
  }

  getDevice(): TVDevice | null {
    return this.device;
  }

  getCapabilities(): TVCapabilities | null {
    return this.capabilities;
  }

  getSnapshot(): ConnectionSnapshot {
    return {
      state: this.state,
      device: this.device,
      capabilities: this.capabilities,
      error: this.error,
      retryAttempt: this.retryCount,
    };
  }

  subscribe(listener: ConnectionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Adapter for the active session; throws unless the TV is ready for commands. */
  getReadyAdapter(): ITVRemoteAdapter {
    if (this.state !== TVConnectionState.Connected || !this.adapter) {
      throw new TVConnectionError('TV is not connected', 'connection_failed');
    }
    return this.adapter;
  }

  private targetDevice: TVDevice | null = null;
  private wakeInProgressDeviceId: string | null = null;

  isWakeInProgress(deviceId?: string): boolean {
    if (deviceId) {
      return this.wakeInProgressDeviceId === deviceId;
    }
    return this.wakeInProgressDeviceId !== null;
  }

  /**
   * Prepares connection manager for Wake-on-LAN:
   * Cancels any pending pre-wake connection attempt so it does not block wake restoration,
   * sets wakeInProgress flag to prevent competing foreground reconnects, and resets state.
   */
  prepareForWake(device: TVDevice): void {
    this.wakeInProgressDeviceId = device.id;
    this.shouldRestore = true;
    this.targetDevice = device;
    this.device = device;
    this.beginOperation();
    this.teardown().catch(() => undefined);
    this.resetTo(TVConnectionState.Disconnected);
  }

  finishWake(deviceId: string): void {
    if (this.wakeInProgressDeviceId === deviceId) {
      this.wakeInProgressDeviceId = null;
    }
  }

  connect(device: TVDevice): Promise<void> {
    if (this.isTargeting(device.id) && this.inFlight) {
      return this.inFlight;
    }
    if (this.isTargeting(device.id) && this.adapter && this.state === TVConnectionState.Connected) {
      return Promise.resolve();
    }

    if (this.wakeInProgressDeviceId !== device.id) {
      this.wakeInProgressDeviceId = null;
    }
    this.targetDevice = device;
    this.shouldRestore = true;
    const generation = this.beginOperation();
    const connectPromise = (async () => {
      try {
        await this.teardown();
        if (generation !== this.generation) {
          throw new TVConnectionError('Connection superseded', 'cancelled');
        }
        this.device = device;
        this.resetTo(TVConnectionState.Disconnected);
        return await this.startAttempt(device, generation, TVConnectionState.Connecting, false);
      } finally {
        if (generation === this.generation) {
          this.targetDevice = null;
        }
      }
    })();

    this.inFlight = connectPromise;
    return connectPromise;
  }

  /** Manual reconnect to the last targeted device. */
  reconnect(): Promise<void> {
    if (!this.device) {
      return Promise.reject(new TVConnectionError('No device to reconnect to', 'no_device'));
    }
    if (this.state === TVConnectionState.Connected) {
      return Promise.resolve();
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    this.shouldRestore = true;
    const device = this.device;
    const generation = this.beginOperation();
    const reconnectPromise = (async () => {
      await this.teardown();
      if (generation !== this.generation) {
        throw new TVConnectionError('Reconnect superseded', 'cancelled');
      }
      this.error = null;
      return this.startAttempt(device, generation, TVConnectionState.Reconnecting, false);
    })();

    this.inFlight = reconnectPromise;
    return reconnectPromise;
  }

  async disconnect(forgetDevice = false): Promise<void> {
    this.beginOperation();
    this.targetDevice = null;
    this.wakeInProgressDeviceId = null;
    this.shouldRestore = false;
    if (forgetDevice) this.device = null;
    const closing = this.teardown();
    this.resetTo(TVConnectionState.Disconnected);
    await closing;
  }

  /** Call when the app returns to the foreground. */
  async handleAppForeground(): Promise<void> {
    this.isBackgrounded = false;

    if (this.isForegroundHandling) {
      return;
    }
    this.isForegroundHandling = true;

    try {
      if (this.state === TVConnectionState.Connected && this.adapter) {
        const adapter = this.adapter;
        const generation = this.generation;
        const probeStarted = connectionClock();
        let isHealthy = false;
        try {
          isHealthy = (await adapter.checkLiveness?.()) ?? true;
        } catch {
          isHealthy = false;
        }

        connectionTiming('foreground-liveness', probeStarted, isHealthy ? 'healthy' : 'failed');

        // If the app was moved back to background while awaiting liveness, abort
        if (this.isBackgrounded || generation !== this.generation || adapter !== this.adapter) {
          return;
        }

        if (isHealthy) {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.log('[SmartRemote][AppState] Socket verified healthy upon returning to foreground');
          }
          adapter.resumeHeartbeat?.();
          return;
        }

        // Socket is unhealthy: transition from Connected to Reconnecting
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[SmartRemote][AppState] Socket liveness check failed upon foreground; initiating recovery');
        }
        this.setState(TVConnectionState.Reconnecting);
      }

      const needsReconnect =
        this.state === TVConnectionState.Disconnected ||
        this.state === TVConnectionState.Error ||
        this.state === TVConnectionState.Reconnecting;

      if (
        this.shouldRestore &&
        this.device &&
        needsReconnect &&
        !this.inFlight &&
        !this.isWakeInProgress(this.device.id)
      ) {
        this.clearRetryTimer();
        this.retryCount = 0;
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[SmartRemote][AppState] Foreground reconnecting');
        }
        await this.reconnect().catch(() => undefined);
      }
    } finally {
      this.isForegroundHandling = false;
    }
  }

  /** Call when the app moves to the background: pending retries are dropped, session is released. */
  handleAppBackground(): void {
    this.isBackgrounded = true;
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[SmartRemote][AppState] App moved to background');
    }
    this.clearRetryTimer();
    this.adapter?.pauseHeartbeat?.();

    if (this.state === TVConnectionState.Reconnecting ||
        this.state === TVConnectionState.Connecting ||
        (this.inFlight && this.state !== TVConnectionState.Pairing)) {
      this.device = this.targetDevice ?? this.device;
      this.beginOperation();
      this.targetDevice = null;
      this.teardown().catch(() => undefined);
      this.resetTo(TVConnectionState.Disconnected);
    }
  }

  // ---- internals ----

  private beginOperation(): number {
    this.generation += 1;
    this.clearRetryTimer();
    this.retryCount = 0;
    this.cancelAttempt?.(new TVConnectionError('Connection cancelled', 'cancelled'));
    this.cancelAttempt = null;
    this.inFlight = null;
    return this.generation;
  }

  private async teardown(): Promise<void> {
    this.unsubscribeAdapter?.();
    this.unsubscribeAdapter = null;
    const adapter = this.adapter;
    this.adapter = null;
    this.capabilities = null;
    if (adapter) {
      try {
        await adapter.disconnect();
      } catch {
        // Best effort cleanup.
      }
    }
  }

  private resetTo(state: TVConnectionState): void {
    this.error = null;
    this.setState(state);
  }

  private startAttempt(
    device: TVDevice,
    generation: number,
    initial: TVConnectionState.Connecting | TVConnectionState.Reconnecting,
    autoRetry: boolean,
  ): Promise<void> {
    let adapter: ITVRemoteAdapter;
    try {
      adapter = this.adapterFactory.create(device);
    } catch (e) {
      this.error = e as Error;
      this.setState(initial);
      this.setState(TVConnectionState.Error);
      return Promise.reject(e);
    }

    this.adapter = adapter;
    this.unsubscribeAdapter = adapter.onConnectionStateChange((s, err) => {
      if (adapter === this.adapter) this.onAdapterState(generation, s, err);
    });
    this.setState(initial);

    const promise = this.runAttempt(adapter, device, generation, autoRetry);
    this.inFlight = promise;
    return promise;
  }

  private async runAttempt(
    adapter: ITVRemoteAdapter,
    device: TVDevice,
    generation: number,
    autoRetry: boolean,
  ): Promise<void> {
    let timer: unknown;
    const cancelled = new Promise<never>((_, reject) => {
      this.cancelAttempt = reject;
    });
    let rejectTimeout: (error: Error) => void = () => undefined;
    const timeout = new Promise<never>((_, reject) => {
      rejectTimeout = reject;
    });
    // Local to this attempt so a stale attempt can never clear a newer attempt's timer.
    const arm = (ms: number, message: string) => {
      this.scheduler.clearTimeout(timer);
      timer = this.scheduler.setTimeout(() => rejectTimeout(new TVTimeoutError(message)), ms);
    };
    arm(this.connectTimeoutMs, 'Connecting to the TV timed out');
    this.extendTimeout = (ms, message) => {
      if (generation === this.generation) {
        arm(ms, message);
      }
    };

    try {
      await Promise.race([adapter.connect(device), timeout, cancelled]);
      if (generation !== this.generation) {
        throw new TVConnectionError('Connection cancelled', 'cancelled');
      }
      this.capabilities = adapter.getCapabilities();
      const detectedMac = (adapter as { getDiscoveredMac?: () => string | null }).getDiscoveredMac?.();
      if (detectedMac && (!this.device?.macAddress || this.device.macAddress !== detectedMac)) {
        this.device = {
          ...(this.device ?? device),
          macAddress: detectedMac,
        };
      }
      this.shouldRestore = true;
      this.retryCount = 0;
      this.error = null;
      this.inFlight = null;
      this.setState(TVConnectionState.Connected);
    } catch (e) {
      if (generation !== this.generation) {
        throw e instanceof TVConnectionError && e.code === 'cancelled'
          ? e
          : new TVConnectionError('Connection cancelled', 'cancelled', e);
      }
      await this.teardown();
      if (generation !== this.generation) {
        throw new TVConnectionError('Connection superseded during cleanup', 'cancelled', e);
      }
      this.inFlight = null;
      this.error = e as Error;
      const retryable = autoRetry && isRetryableConnectionFailure(e);
      if (!isRetryableConnectionFailure(e)) this.shouldRestore = false;
      if (retryable) {
        this.scheduleRetry(generation);
      } else {
        this.error = e as Error;
        this.setState(TVConnectionState.Error);
      }
      throw e;
    } finally {
      this.scheduler.clearTimeout(timer);
      if (generation === this.generation) {
        this.cancelAttempt = null;
        this.extendTimeout = null;
      }
    }
  }

  private onAdapterState(generation: number, state: TVConnectionState, error?: Error): void {
    if (generation !== this.generation) {
      return;
    }
    if (state === TVConnectionState.Pairing) {
      if (
        this.state === TVConnectionState.Connecting ||
        this.state === TVConnectionState.Reconnecting
      ) {
        // The TV is waiting for the user: switch from the network budget to the pairing window.
        this.extendTimeout?.(this.pairingTimeoutMs, 'Pairing was not accepted on the TV in time');
        this.setState(TVConnectionState.Pairing);
      }
      return;
    }
    const lost = state === TVConnectionState.Disconnected || state === TVConnectionState.Error;
    if (lost && this.state === TVConnectionState.Connected) {
      this.handleConnectionLost(generation, error);
    }
  }

  private handleConnectionLost(generation: number, error?: Error): void {
    this.error = error ?? null;
    const closing = this.teardown();
    this.lossCleanup = closing;
    closing.then(() => {
      if (this.lossCleanup === closing) this.lossCleanup = null;
    });

    if (this.isBackgrounded) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(
          '[SmartRemote][AppState] Connection lost while backgrounded; releasing session without scheduling background retry',
        );
      }
      this.clearRetryTimer();
      this.setState(TVConnectionState.Disconnected);
      return;
    }

    if (error && !isRetryableConnectionFailure(error)) {
      this.shouldRestore = false;
      this.setState(TVConnectionState.Error);
      return;
    }
    this.setState(TVConnectionState.Reconnecting);
    this.scheduleRetry(generation);
  }

  private scheduleRetry(generation: number): void {
    if (generation !== this.generation) {
      return;
    }
    this.clearRetryTimer();
    if (this.retryCount >= this.policy.maxAttempts) {
      this.error = this.error ?? new TVConnectionError('Could not reconnect to the TV');
      this.setState(TVConnectionState.Error);
      return;
    }
    const delay = Math.min(
      this.policy.baseDelayMs * 2 ** this.retryCount,
      this.policy.maxDelayMs,
    );
    this.retryCount += 1;
    if (this.state !== TVConnectionState.Reconnecting) {
      this.setState(TVConnectionState.Reconnecting);
    }
    const scheduled = connectionClock();
    connectionTiming('retry-scheduled', scheduled, 'scheduled');
    const run = () => {
      if (generation !== this.generation || this.isBackgrounded || !this.device || this.inFlight) return;
      connectionTiming('retry-executed', scheduled);
      this.startAttempt(this.device, generation, TVConnectionState.Reconnecting, true).catch(
        () => undefined,
      );
    };
    this.retryTimer = this.scheduler.setTimeout(() => {
      this.retryTimer = null;
      if (this.lossCleanup) this.lossCleanup.then(run);
      else run();
    }, delay);
    this.notify();
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      this.scheduler.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private setState(next: TVConnectionState): void {
    if (next === this.state) {
      return;
    }
    if (!canTransition(this.state, next)) {
      throw new TVConnectionError(`Invalid connection transition ${this.state} -> ${next}`);
    }
    this.state = next;
    this.notify();
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach(listener => {
      try {
        listener(snapshot);
      } catch {
        // listeners must not break the session
      }
    });
  }
}
