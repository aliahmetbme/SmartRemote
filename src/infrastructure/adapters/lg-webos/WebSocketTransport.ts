import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  type EmitterSubscription,
} from 'react-native';

/**
 * Minimal WebSocket surface used by the LG webOS code.
 * Implemented by both React Native's global WebSocket and dedicated native transports.
 */
export interface IWebSocketTransport {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketFactory = (url: string) => IWebSocketTransport;

/**
 * Default React Native WebSocket transport.
 * Used for standard web sockets, non-LG connections, and Android fallback.
 */
export const reactNativeWebSocketFactory: WebSocketFactory = url => {
  if (typeof WebSocket === 'undefined') {
    throw new Error('WebSocket is not defined in the current runtime environment');
  }
  return new WebSocket(url) as unknown as IWebSocketTransport;
};

export interface LGNativeWebSocketEventMap {
  id: number;
  data?: string;
  message?: string;
  code?: number;
  reason?: string;
  domain?: string;
}

let nextSocketId = 1;

/**
 * Dedicated iOS native WebSocket transport backed by NSURLSessionWebSocketTask.
 * Bypasses SocketRocket CFStream TLS handshake limitations on modern iOS,
 * validating certificates directly against the anchored LG intermediate CA.
 */
export class LGNativeWebSocketTransport implements IWebSocketTransport {
  private readonly socketId: number;
  private readonly url: string;
  private readonly nativeModule: any;
  private readonly emitter: NativeEventEmitter | null;
  private subscriptions: EmitterSubscription[] = [];
  private closed = false;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;

  constructor(
    url: string,
    nativeModule = Platform.OS === 'ios' ? NativeModules?.LGNativeWebSocketModule : null,
    customEmitter?: NativeEventEmitter,
  ) {
    this.socketId = nextSocketId++;
    this.url = url;
    this.nativeModule = nativeModule;
    this.emitter = customEmitter ?? (nativeModule ? new NativeEventEmitter(nativeModule) : null);
    this.init();
  }

  getSocketId(): number {
    return this.socketId;
  }

  private init(): void {
    if (!this.nativeModule || !this.emitter) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(
          '[SmartRemote][NativeWS] LGNativeWebSocketModule is not available in the current runtime',
        );
      }
      setTimeout(() => {
        if (this.closed) return;
        this.onerror?.({ message: 'LGNativeWebSocketModule is not available' });
        this.onclose?.({ code: 1006, reason: 'LGNativeWebSocketModule unavailable' });
      }, 0);
      return;
    }

    try {
      this.subscriptions.push(
        this.emitter.addListener('onLGWebSocketOpen', (rawEvent: any) => {
          const event = rawEvent as LGNativeWebSocketEventMap;
          if (event?.id === this.socketId && !this.closed) {
            if (typeof __DEV__ !== 'undefined' && __DEV__) {
              console.log(`[SmartRemote][NativeWS] Open event received for socket #${this.socketId}`);
            }
            this.onopen?.();
          }
        }),
        this.emitter.addListener('onLGWebSocketMessage', (rawEvent: any) => {
          const event = rawEvent as LGNativeWebSocketEventMap;
          if (event?.id === this.socketId && !this.closed) {
            this.onmessage?.({ data: event.data });
          }
        }),
        this.emitter.addListener('onLGWebSocketError', (rawEvent: any) => {
          const event = rawEvent as LGNativeWebSocketEventMap;
          if (event?.id === this.socketId && !this.closed) {
            if (typeof __DEV__ !== 'undefined' && __DEV__) {
              console.log(
                `[SmartRemote][NativeWS] Error event received for socket #${this.socketId}: ${event.message}`,
              );
            }
            this.onerror?.({ message: event.message, code: event.code, domain: event.domain });
          }
        }),
        this.emitter.addListener('onLGWebSocketClosed', (rawEvent: any) => {
          const event = rawEvent as LGNativeWebSocketEventMap;
          if (event?.id === this.socketId && !this.closed) {
            if (typeof __DEV__ !== 'undefined' && __DEV__) {
              console.log(
                `[SmartRemote][NativeWS] Close event received for socket #${this.socketId}: code=${event.code}, reason=${event.reason}`,
              );
            }
            this.closed = true;
            this.cleanup();
            this.onclose?.({ code: event.code ?? 1000, reason: event.reason ?? '' });
          }
        }),
      );

      this.nativeModule.connect(this.socketId, this.url);
    } catch (e) {
      this.cleanup();
      setTimeout(() => {
        if (this.closed) return;
        this.onerror?.(e);
        this.onclose?.({ code: 1006, reason: 'Native initialization failure' });
      }, 0);
    }
  }

  send(data: string): void {
    if (this.closed) return;
    this.nativeModule?.send(this.socketId, data);
  }

  close(code = 1000, reason = ''): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.nativeModule?.close(this.socketId, code, reason);
    } catch {
      // Ignore native close errors
    }
    this.cleanup();
    this.onclose?.({ code, reason });
  }

  private cleanup(): void {
    this.subscriptions.forEach(sub => {
      try {
        sub.remove();
      } catch {
        // Ignore removal errors
      }
    });
    this.subscriptions = [];
  }
}

/**
 * Checks if the URL is targeted at an LG webOS TV service or pointer input.
 */
export function isLGTVWebSocketUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  return (
    /^wss?:\/\/[^/]+:(?:3001|3000)(?:\/.*)?$/i.test(url) ||
    /^wss:\/\/(?:192\.168\.|10\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/i.test(url)
  );
}

/**
 * Checks whether native NSURLSessionWebSocketTask transport is available.
 */
export function isNativeWebSocketSupported(): boolean {
  return Platform.OS === 'ios' && Boolean(NativeModules?.LGNativeWebSocketModule);
}

/**
 * Creates a WebSocketFactory with automatic native transport selection for iOS LG TV connections.
 */
export function createWebSocketFactory(
  customNativeModule?: any,
  customEmitter?: NativeEventEmitter,
): WebSocketFactory {
  return (url: string): IWebSocketTransport => {
    const nativeModule =
      customNativeModule !== undefined
        ? customNativeModule
        : Platform.OS === 'ios'
          ? NativeModules?.LGNativeWebSocketModule
          : null;

    if (nativeModule && isLGTVWebSocketUrl(url)) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(`[SmartRemote][Transport] Selected LGNativeWebSocketTransport for ${url}`);
      }
      return new LGNativeWebSocketTransport(url, nativeModule, customEmitter);
    }

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(`[SmartRemote][Transport] Selected reactNativeWebSocketFactory for ${url}`);
    }
    return reactNativeWebSocketFactory(url);
  };
}

/**
 * Default WebSocket factory used across SmartRemote.
 */
export const defaultWebSocketFactory: WebSocketFactory = createWebSocketFactory();
