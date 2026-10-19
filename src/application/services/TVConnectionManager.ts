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
  connectTimeoutMs?: number;
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

  async connect(device: TVDevice): Promise<void> {
    if (this.device?.id === device.id) {
      if (this.state === TVConnectionState.Connected) {
        return;
      }
      if (this.inFlight) {
        return this.inFlight;
      }
    }

    const generation = this.beginOperation();
    await this.teardown();
    if (generation !== this.generation) {
      throw new TVConnectionError('Connection superseded', 'cancelled');
    }
    this.device = device;
    this.resetTo(TVConnectionState.Disconnected);
    return this.startAttempt(device, generation, TVConnectionState.Connecting, false);
  }

  /** Manual reconnect to the last targeted device. */
  async reconnect(): Promise<void> {
    if (!this.device) {
      throw new TVConnectionError('No device to reconnect to', 'no_device');
    }
    if (this.state === TVConnectionState.Connected) {
      return;
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    const device = this.device;
    const generation = this.beginOperation();
    await this.teardown();
    if (generation !== this.generation) {
      throw new TVConnectionError('Reconnect superseded', 'cancelled');
    }
    this.error = null;
    return this.startAttempt(device, generation, TVConnectionState.Reconnecting, false);
  }

  async disconnect(): Promise<void> {
    this.beginOperation();
    this.shouldRestore = false;
    await this.teardown();
    this.error = null;
    this.setState(TVConnectionState.Disconnected);
  }

  /** Call when the app returns to the foreground. */
  handleAppForeground(): void {
    const idle =
      this.state === TVConnectionState.Disconnected || this.state === TVConnectionState.Error;
    if (this.shouldRestore && this.device && idle && !this.inFlight) {
      this.reconnect().catch(() => undefined);
    }
  }

  /** Call when the app moves to the background: pending retries are dropped, session is released. */
  handleAppBackground(): void {
    if (this.state === TVConnectionState.Reconnecting) {
      this.beginOperation();
      this.teardown().then(() => {
        this.setState(TVConnectionState.Disconnected);
      });
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
    const timeout = new Promise<never>((_, reject) => {
      timer = this.scheduler.setTimeout(
        () => reject(new TVTimeoutError('Connecting to the TV timed out')),
        this.connectTimeoutMs,
      );
    });

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
