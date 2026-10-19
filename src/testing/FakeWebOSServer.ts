import { IWebSocketTransport, WebSocketFactory } from '../infrastructure/adapters/lg-webos/WebSocketTransport';

export interface FakeWebOSServerOptions {
  /** URLs that accept connections. Default: every URL. */
  reachable?: (url: string) => boolean;
  clientKey?: string;
  /** Show a prompt and wait for acceptPairing() instead of auto-accepting. */
  manualPairing?: boolean;
  denyPairing?: boolean;
  /** Service names reported by getServiceList; null makes the call return 404. */
  services?: string[] | null;
  /** null makes getPointerInputSocket return 404. */
  pointerSocketPath?: string | null;
  /** URIs that answer "404 no such service or method". */
  unsupportedUris?: string[];
  /** URIs that answer "401 Unauthorized". */
  unauthorizedUris?: string[];
  /** Ignore all messages (simulates an unresponsive TV). */
  silent?: boolean;
  muted?: boolean;
}

export const POINTER_PATH = 'ws://192.168.0.20:3000/resources/abc/netinput_pointer.sock';

class FakeSocket implements IWebSocketTransport {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  closed = false;

  constructor(
    readonly url: string,
    private readonly server: FakeWebOSServer,
  ) {
    Promise.resolve().then(() => {
      if (this.closed) return;
      if (server.options.reachable && !server.options.reachable(url)) {
        this.closed = true;
        this.onerror?.({});
        this.onclose?.({ code: 1006 });
        return;
      }
      this.onopen?.();
    });
  }

  send(data: string): void {
    if (this.closed) throw new Error('socket closed');
    this.server.handle(this, data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.server.sockets.delete(this);
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  receiveRaw(data: unknown): void {
    this.onmessage?.({ data });
  }

  /** Remote side drops the connection. */
  drop(reason?: string): void {
    if (this.closed) return;
    this.closed = true;
    this.server.sockets.delete(this);
    this.onclose?.({ code: 1006, reason });
  }
}

/** In-memory LG webOS TV used by automated tests. Speaks just enough SSAP for the adapter. */
export class FakeWebOSServer {
  readonly sockets = new Set<FakeSocket>();
  readonly opened: string[] = [];
  readonly requests: Array<{ uri: string; payload?: Record<string, unknown> }> = [];
  readonly registrations: Array<Record<string, unknown>> = [];
  readonly pointerFrames: string[] = [];
  muted: boolean;
  private pendingRegistration: FakeSocket | null = null;

  constructor(readonly options: FakeWebOSServerOptions = {}) {
    this.muted = options.muted ?? false;
  }

  readonly factory: WebSocketFactory = url => {
    const socket = new FakeSocket(url, this);
    this.opened.push(url);
    this.sockets.add(socket);
    return socket;
  };

  get clientKey(): string {
    return this.options.clientKey ?? 'client-key-123';
  }

  ssapSockets(): FakeSocket[] {
    return [...this.sockets].filter(s => !s.url.includes('netinput_pointer'));
  }

  pointerSockets(): FakeSocket[] {
    return [...this.sockets].filter(s => s.url.includes('netinput_pointer'));
  }

  /** Remote drops every open socket. */
  dropAll(reason?: string): void {
    [...this.sockets].forEach(s => s.drop(reason));
  }

  acceptPairing(): void {
    const socket = this.pendingRegistration;
    this.pendingRegistration = null;
    socket?.receive({
      type: 'registered',
      id: 'register_0',
      payload: { 'client-key': this.clientKey },
    });
  }

  handle(socket: FakeSocket, data: string): void {
    if (socket.url.includes('netinput_pointer')) {
      this.pointerFrames.push(data);
      return;
    }
    if (this.options.silent) return;
    const message = JSON.parse(data) as {
      type: string;
      id: string;
      uri?: string;
      payload?: Record<string, unknown>;
    };
    if (message.type === 'register') {
      this.handleRegister(socket, message);
      return;
    }
    this.requests.push({ uri: message.uri ?? '', payload: message.payload });
    Promise.resolve().then(() => this.respond(socket, message));
  }

  private handleRegister(
    socket: FakeSocket,
    message: { id: string; payload?: Record<string, unknown> },
  ): void {
    const payload = message.payload ?? {};
    this.registrations.push(payload);
    Promise.resolve().then(() => {
      if (this.options.denyPairing) {
        socket.receive({ type: 'error', id: message.id, error: '403 User denied access', payload: {} });
        return;
      }
      if (payload['client-key'] === this.clientKey) {
        socket.receive({
          type: 'registered',
          id: message.id,
          payload: { 'client-key': this.clientKey },
        });
        return;
      }
      socket.receive({
        type: 'response',
        id: message.id,
        payload: { pairingType: 'PROMPT', returnValue: true },
      });
      if (this.options.manualPairing) {
        this.pendingRegistration = socket;
      } else {
        socket.receive({
          type: 'registered',
          id: message.id,
          payload: { 'client-key': this.clientKey },
        });
      }
    });
  }

  private respond(socket: FakeSocket, message: { id: string; uri?: string; payload?: Record<string, unknown> }): void {
    const uri = message.uri ?? '';
    const notFound = () =>
      socket.receive({ type: 'error', id: message.id, error: '404 no such service or method', payload: {} });
    const unauthorized = () =>
      socket.receive({ type: 'error', id: message.id, error: '401 Unauthorized', payload: {} });
    const ok = (payload: Record<string, unknown> = {}) =>
      socket.receive({ type: 'response', id: message.id, payload: { returnValue: true, ...payload } });

    if (this.options.unauthorizedUris?.includes(uri)) return unauthorized();
    if (this.options.unsupportedUris?.includes(uri)) return notFound();

    switch (uri) {
      case 'ssap://api/getServiceList': {
        const services = this.options.services === undefined
          ? ['audio', 'tv', 'system', 'system.launcher', 'com.webos.service.ime']
          : this.options.services;
        if (services === null) return notFound();
        return ok({ services: services.map(name => ({ name, version: 1 })) });
      }
      case 'ssap://com.webos.service.networkinput/getPointerInputSocket': {
        const path = this.options.pointerSocketPath === undefined ? POINTER_PATH : this.options.pointerSocketPath;
        if (path === null) return notFound();
        return ok({ socketPath: path });
      }
      case 'ssap://audio/getStatus':
        return ok({ mute: this.muted });
      case 'ssap://audio/setMute':
        this.muted = message.payload?.mute === true;
        return ok();
      default:
        return ok();
    }
  }
}
