import { Scheduler } from '../../../domain/interfaces/IScheduler';
import { TVConnectionError, TVTimeoutError } from '../../../domain/errors/TVConnectionError';
import { TVUnsupportedOperationError } from '../../../domain/errors/TVUnsupportedOperationError';
import {
  sanitizeInboundSummary,
  sanitizeOutboundSummary,
} from '../../diagnostics/ConnectionDiagnostics';
import { IWebSocketCloseEvent, IWebSocketTransport, WebSocketFactory } from './WebSocketTransport';

/** Error reported by the TV for an SSAP request (`type: "error"` or `returnValue: false`). */
export class LGWebOSRequestError extends Error {
  /** Leading numeric status from the TV's message (e.g. 401, 404), when present. */
  readonly statusCode: number | null;

  constructor(message: string, statusCode: number | null) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'LGWebOSRequestError';
    this.statusCode = statusCode;
  }
}

export interface SSAPMessage {
  type: string;
  id?: string;
  uri?: string;
  error?: string;
  payload?: Record<string, unknown>;
}

export type SSAPMessageListener = (message: SSAPMessage) => void;

export interface LGWebOSWebSocketClientOptions {
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  scheduler?: Scheduler;
}

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

interface PendingRequest {
  resolve: (payload: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: unknown;
}

export function parseStatusCode(text: unknown): number | null {
  if (typeof text !== 'string') {
    return null;
  }
  const match = /^\s*(\d{3})\b/.exec(text);
  return match ? Number(match[1]) : null;
}

/** Validates an incoming frame. Returns null for anything that is not a well-formed SSAP message. */
export function parseSSAPMessage(data: unknown): SSAPMessage | null {
  if (typeof data !== 'string') {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const raw = parsed as Record<string, unknown>;
  if (typeof raw.type !== 'string') {
    return null;
  }
  if (raw.id !== undefined && typeof raw.id !== 'string') {
    return null;
  }
  if (
    raw.payload !== undefined &&
    (typeof raw.payload !== 'object' || raw.payload === null || Array.isArray(raw.payload))
  ) {
    return null;
  }
  return {
    type: raw.type,
    id: raw.id as string | undefined,
    uri: typeof raw.uri === 'string' ? raw.uri : undefined,
    error: typeof raw.error === 'string' ? raw.error : undefined,
    payload: raw.payload as Record<string, unknown> | undefined,
  };
}

/** One SSAP WebSocket session: connection lifecycle plus request/response correlation by id. */
export class LGWebOSWebSocketClient {
  private readonly scheduler: Scheduler;
  private readonly connectTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private socket: IWebSocketTransport | null = null;
  private opened = false;
  private lastCloseError: Error | null = null;
  private lastCloseEvent: IWebSocketCloseEvent | null = null;
  private lastOutboundSummary: string | null = null;
  private lastInboundSummary: string | null = null;
  private sequence = 0;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly messageListeners = new Set<SSAPMessageListener>();
  private readonly closeListeners = new Set<(error: Error) => void>();

  constructor(
    private readonly socketFactory: WebSocketFactory,
    options: LGWebOSWebSocketClientOptions = {},
  ) {
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 8000;
  }

  isOpen(): boolean {
    return this.opened && this.socket !== null;
  }

  getLastCloseError(): Error | null {
    return this.lastCloseError;
  }

  getLastCloseEvent(): IWebSocketCloseEvent | null {
    return this.lastCloseEvent;
  }

  getLastOutboundSummary(): string | null {
    return this.lastOutboundSummary;
  }

  getLastInboundSummary(): string | null {
    return this.lastInboundSummary;
  }

  isPingSupported(): boolean {
    return Boolean(this.socket && typeof this.socket.ping === 'function');
  }

  async ping(): Promise<void> {
    if (!this.opened || !this.socket) {
      throw new TVConnectionError('SSAP socket is not open');
    }
    if (typeof this.socket.ping !== 'function') {
      throw new TVUnsupportedOperationError('WebSocket transport does not support native ping');
    }
    await this.socket.ping();
  }

  open(url: string): Promise<void> {
    if (this.socket) {
      return Promise.reject(new TVConnectionError('Socket already opened'));
    }
    this.lastCloseError = null;
    this.lastCloseEvent = null;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: unknown;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        this.scheduler.clearTimeout(timer);
        this.detachAndClose();
        reject(error);
      };

      let socket: IWebSocketTransport;
      try {
        socket = this.socketFactory(url);
      } catch (e) {
        reject(new TVConnectionError('Could not create WebSocket', 'connection_failed', e));
        return;
      }
      this.socket = socket;

      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(`[SmartRemote][WebSocket] Connecting to ${url} (timeout: ${this.connectTimeoutMs}ms)`);
      }

      timer = this.scheduler.setTimeout(
        () => {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.log(`[SmartRemote][WebSocket] Connection to ${url} timed out after ${this.connectTimeoutMs}ms`);
          }
          fail(new TVTimeoutError(`WebSocket connection to ${url} timed out after ${this.connectTimeoutMs}ms`));
        },
        this.connectTimeoutMs,
      );

      socket.onopen = () => {
        if (settled) return;
        settled = true;
        this.opened = true;
        this.scheduler.clearTimeout(timer);
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(`[SmartRemote][WebSocket] Connection established to ${url}`);
        }
        resolve();
      };
      socket.onerror = (event: unknown) => {
        const errorMsg = (event as { message?: string })?.message;
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(`[SmartRemote][WebSocket] Error on ${url}:`, errorMsg ?? event);
        }
        if (!settled) {
          fail(
            new TVConnectionError(
              errorMsg ? `WebSocket connection failed for ${url}: ${errorMsg}` : `WebSocket connection failed for ${url}`,
              'connection_failed',
              event,
            ),
          );
        }
        // After open, an error is always followed by onclose, which handles cleanup.
      };
      socket.onclose = (event: IWebSocketCloseEvent) => {
        const code = event?.code;
        const reason = event?.reason;
        const domain = event?.domain;
        const errorCode = event?.errorCode;
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(
            `[SmartRemote][WebSocket] Closed for ${url} (code: ${code}, reason: ${reason ?? 'none'}, domain: ${domain ?? 'none'}:${errorCode ?? 'none'})`,
          );
        }
        const detail = [
          code !== undefined ? `code: ${code}` : null,
          reason ? `reason: ${reason}` : null,
          domain ? `domain: ${domain}:${errorCode}` : null,
        ]
          .filter(Boolean)
          .join(', ');
        this.lastCloseEvent = { code, reason, domain, errorCode };

        if (!settled) {
          const closeError = new TVConnectionError(
            detail
              ? `WebSocket closed before opening for ${url} (${detail})`
              : `WebSocket closed before opening for ${url}`,
            'connection_failed',
            event,
          );
          this.lastCloseError = closeError;
          fail(closeError);
          return;
        }
        this.handleRemoteClose(code, reason);
      };
      socket.onmessage = event => this.handleFrame(event.data);
    });
  }

  /** Sends a request and resolves with the response payload. */
  request(
    uri: string,
    payload?: Record<string, unknown>,
    timeoutMs: number = this.requestTimeoutMs,
  ): Promise<Record<string, unknown>> {
    if (!this.opened || !this.socket) {
      const cause = this.lastCloseError ? ` (${this.lastCloseError.message})` : '';
      return Promise.reject(
        new TVConnectionError(
          `SSAP socket is not open${cause}`,
          'connection_failed',
          this.lastCloseError ?? undefined,
        ),
      );
    }
    this.sequence += 1;
    const id = `req_${this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = this.scheduler.setTimeout(() => {
        this.pending.delete(id);
        reject(new TVTimeoutError(`Request to ${uri} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const frame = JSON.stringify({ type: 'request', id, uri, payload });
      this.lastOutboundSummary = sanitizeOutboundSummary(frame);
      try {
        this.socket?.send(frame);
      } catch (e) {
        this.scheduler.clearTimeout(timer);
        this.pending.delete(id);
        reject(new TVConnectionError('Failed to send request', 'connection_failed', e));
      }
    });
  }

  /** Sends a frame that is not a request/response pair (used for registration). */
  sendRaw(message: Record<string, unknown>): void {
    if (!this.opened || !this.socket) {
      const cause = this.lastCloseError ? ` (${this.lastCloseError.message})` : '';
      throw new TVConnectionError(
        `SSAP socket is not open${cause}`,
        'connection_failed',
        this.lastCloseError ?? undefined,
      );
    }
    const frame = JSON.stringify(message);
    this.lastOutboundSummary = sanitizeOutboundSummary(frame);
    this.socket.send(frame);
  }

  onMessage(listener: SSAPMessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  /** Fires when the socket closes for any reason; intentional closes report a 'cancelled' TVConnectionError. */
  onClose(listener: (error: Error) => void): () => void {
    this.closeListeners.add(listener);
    return () => {
      this.closeListeners.delete(listener);
    };
  }

  /** Intentional close. Rejects in-flight requests and notifies close listeners (e.g. a pairing in progress). */
  close(): void {
    const wasOpen = this.socket !== null;
    const error = new TVConnectionError('Connection closed', 'cancelled');
    this.rejectAllPending(error);
    this.detachAndClose();
    if (wasOpen) {
      this.notifyClosed(error);
    }
  }

  private handleFrame(data: unknown): void {
    this.lastInboundSummary = sanitizeInboundSummary(data);
    const message = parseSSAPMessage(data);
    if (!message) {
      return; // malformed frames are dropped
    }
    const pending = message.id ? this.pending.get(message.id) : undefined;
    if (message.id && pending) {
      if (message.type === 'response') {
        this.settle(message.id, pending, message.payload ?? {});
      } else if (message.type === 'error') {
        this.pending.delete(message.id);
        this.scheduler.clearTimeout(pending.timer);
        pending.reject(
          new LGWebOSRequestError(message.error ?? 'Unknown error', parseStatusCode(message.error)),
        );
      }
    }
    this.messageListeners.forEach(listener => {
      try {
        listener(message);
      } catch {
        // listeners must not break the socket
      }
    });
  }

  private settle(id: string, pending: PendingRequest, payload: Record<string, unknown>): void {
    this.pending.delete(id);
    this.scheduler.clearTimeout(pending.timer);
    if (payload.returnValue === false) {
      const text = typeof payload.errorText === 'string' ? payload.errorText : 'Request failed';
      pending.reject(new LGWebOSRequestError(text, parseStatusCode(text)));
    } else {
      pending.resolve(payload);
    }
  }

  private handleRemoteClose(code?: number, reason?: string): void {
    const detail = [code !== undefined ? `code: ${code}` : null, reason ? `reason: "${reason}"` : null]
      .filter(Boolean)
      .join(', ');
    const error = new TVConnectionError(
      detail ? `Connection to the TV closed (${detail})` : 'Connection to the TV closed',
      'connection_failed',
    );
    this.lastCloseError = error;
    this.opened = false;
    this.socket = null;
    this.rejectAllPending(error);
    this.notifyClosed(error);
  }

  private notifyClosed(error: Error): void {
    this.closeListeners.forEach(listener => {
      try {
        listener(error);
      } catch {
        // ignore
      }
    });
  }

  private rejectAllPending(error: Error): void {
    this.pending.forEach(p => {
      this.scheduler.clearTimeout(p.timer);
      p.reject(error);
    });
    this.pending.clear();
  }

  private detachAndClose(): void {
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
}
