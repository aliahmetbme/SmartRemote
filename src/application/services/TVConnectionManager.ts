import { TVCapabilities } from '../../domain/entities/TVCapabilities';
import { TVDevice } from '../../domain/entities/TVDevice';
import { canTransition, TVConnectionState } from '../../domain/enums/TVConnectionState';
import { TVConnectionError, TVTimeoutError } from '../../domain/errors/TVConnectionError';
import { TVPairingError } from '../../domain/errors/TVPairingError';
import { ITVAdapterFactory } from '../../domain/interfaces/ITVAdapterFactory';
import { ITVRemoteAdapter } from '../../domain/interfaces/ITVRemoteAdapter';

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

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
  /** True after a successful connection until the user disconnects explicitly. */
  private shouldRestore = false;

  constructor(
    private readonly adapterFactory: ITVAdapterFactory,
    options: TVConnectionManagerOptions = {},
  ) {
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.pairingTimeoutMs = options.pairingTimeoutMs ?? DEFAULT_PAIRING_TIMEOUT_MS;
    this.policy = { ...DEFAULT_RECONNECT, ...options.reconnect };
  }

  getState(): TVConnectionState {
    return this.state;
  }

  getDevice(): TVDevice | null {
    return this.device;
  }

  getSnapshot(): ConnectionSnapshot {
    return {
      state: this.state,
      device: this.device,
      capabilities: this.capabilities,
      error: this.error,
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

  connect(device: TVDevice): Promise<void> {
    if ((this.targetDevice?.id === device.id || this.device?.id === device.id) && this.inFlight) {
      return this.inFlight;
    }
    if (this.device?.id === device.id && this.state === TVConnectionState.Connected) {
      return Promise.resolve();
    }

    this.targetDevice = device;
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

  async disconnect(): Promise<void> {
    this.beginOperation();
    this.targetDevice = null;
    this.shouldRestore = false;
    await this.teardown();
    this.error = null;
    this.setState(TVConnectionState.Disconnected);
  }

  /** Call when the app returns to the foreground. */
  async handleAppForeground(): Promise<void> {
    if (this.state === TVConnectionState.Connected && this.adapter) {
      try {
        const isHealthy = (await this.adapter.checkLiveness?.()) ?? true;
        if (isHealthy) {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.log('[SmartRemote][AppState] Socket verified healthy upon returning to foreground');
          }
          this.adapter.resumeHeartbeat?.();
          return;
        }
      } catch {
        // Liveness check failed, fall through to reconnect
      }
    }

    const needsReconnect =
      this.state === TVConnectionState.Disconnected ||
      this.state === TVConnectionState.Error ||
      this.state === TVConnectionState.Reconnecting;
    if (this.shouldRestore && this.device && needsReconnect && !this.inFlight) {
      this.clearRetryTimer();
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(`[SmartRemote][AppState] Foreground reconnecting to device ${this.device.id}`);
      }
      this.reconnect().catch(() => undefined);
    }
  }

  /** Call when the app moves to the background: pending retries are dropped, session is released. */
  handleAppBackground(): void {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[SmartRemote][AppState] App moved to background');
    }
    if (this.state === TVConnectionState.Reconnecting) {
      this.beginOperation();
      this.teardown().then(() => {
        this.setState(TVConnectionState.Disconnected);
      });
    }
    this.adapter?.pauseHeartbeat?.();
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
        // best effort cleanup
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
    this.unsubscribeAdapter = adapter.onConnectionStateChange((s, err) =>
      this.onAdapterState(generation, s, err),
    );
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
      this.inFlight = null;
      await this.teardown();
      const retryable = autoRetry && !(e instanceof TVPairingError);
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
    this.unsubscribeAdapter?.();
    this.unsubscribeAdapter = null;
    const adapter = this.adapter;
    this.adapter = null;
    this.capabilities = null;
    adapter?.disconnect().catch(() => undefined);
    this.setState(TVConnectionState.Reconnecting);
    this.scheduleRetry(generation);
  }

  private scheduleRetry(generation: number): void {
    if (generation !== this.generation) {
      return;
    }
    this.clearRetryTimer();
    if (this.retryCount >= this.policy.maxAttempts) {
      this.error = new TVConnectionError('Could not reconnect to the TV');
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
    this.retryTimer = this.scheduler.setTimeout(() => {
      this.retryTimer = null;
      if (generation !== this.generation || !this.device) {
        return;
      }
      this.startAttempt(this.device, generation, TVConnectionState.Reconnecting, true).catch(
        () => undefined,
      );
    }, delay);
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
