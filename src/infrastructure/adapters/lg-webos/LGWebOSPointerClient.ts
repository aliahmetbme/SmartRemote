import { Scheduler } from '../../../domain/interfaces/IScheduler';
import { TVConnectionError, TVTimeoutError } from '../../../domain/errors/TVConnectionError';
import { PointerButton } from './LGWebOSCommandMapper';
import { IWebSocketTransport, WebSocketFactory } from './WebSocketTransport';

export interface LGWebOSPointerClientOptions {
  connectTimeoutMs?: number;
  scheduler?: Scheduler;
}

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const SOCKET_PATH = /^(wss?):\/\/([^/:]+)(?::(\d+))?(\/.*)?$/;

/**
 * Talks to the TV's separate "network input" socket whose URL is returned by
 * `ssap://com.webos.service.networkinput/getPointerInputSocket`. It uses a
 * plain-text frame format, not SSAP JSON, and is kept apart from the SSAP client.
 * Does not throttle: callers (touchpad UI) must rate-limit moves.
 */
export class LGWebOSPointerClient {
  private readonly scheduler: Scheduler;
  private readonly connectTimeoutMs: number;
  private socket: IWebSocketTransport | null = null;
  private opened = false;
  private readonly closeListeners = new Set<() => void>();

  constructor(
    private readonly socketFactory: WebSocketFactory,
    options: LGWebOSPointerClientOptions = {},
  ) {
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5000;
  }

  isOpen(): boolean {
    return this.opened;
  }

  /**
   * Connects to the socket path supplied by the TV. The host must match the TV
   * we are already talking to, so a response cannot redirect us elsewhere.
   */
  connect(socketPath: string, expectedHost: string): Promise<void> {
    const match = SOCKET_PATH.exec(socketPath);
    if (!match || match[2] !== expectedHost) {
      return Promise.reject(new TVConnectionError('TV returned an unexpected pointer socket address'));
    }
    this.close();
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: unknown;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        this.scheduler.clearTimeout(timer);
        this.close();
        reject(error);
      };

      let socket: IWebSocketTransport;
      try {
        socket = this.socketFactory(socketPath);
      } catch (e) {
        reject(new TVConnectionError('Could not create pointer socket', 'connection_failed', e));
        return;
      }
      this.socket = socket;
      timer = this.scheduler.setTimeout(
        () => fail(new TVTimeoutError('Pointer socket connection timed out')),
        this.connectTimeoutMs,
      );
      socket.onopen = () => {
        if (settled) return;
        settled = true;
        this.opened = true;
        this.scheduler.clearTimeout(timer);
        resolve();
      };
      socket.onerror = () => {
        if (!settled) fail(new TVConnectionError('Pointer socket connection failed'));
      };
      socket.onclose = () => {
        if (!settled) {
          fail(new TVConnectionError('Pointer socket closed before opening'));
          return;
        }
        this.opened = false;
        this.socket = null;
        this.closeListeners.forEach(l => l());
      };
    });
  }

  sendButton(name: PointerButton): void {
    this.write(`type:button\nname:${name}\n\n`);
  }

  move(deltaX: number, deltaY: number): void {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
      throw new RangeError('Pointer deltas must be finite numbers');
    }
    this.write(`type:move\ndx:${Math.round(deltaX)}\ndy:${Math.round(deltaY)}\ndown:0\n\n`);
  }

  click(): void {
    this.write('type:click\n\n');
  }

  onClose(listener: () => void): () => void {
    this.closeListeners.add(listener);
    return () => {
      this.closeListeners.delete(listener);
    };
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    this.opened = false;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close(1000);
      } catch {
        // already closed
      }
    }
  }

  private write(frame: string): void {
    if (!this.opened || !this.socket) {
      throw new TVConnectionError('Pointer socket is not open');
    }
    this.socket.send(frame);
  }
}
