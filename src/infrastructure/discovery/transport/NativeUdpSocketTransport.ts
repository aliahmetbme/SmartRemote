import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { TVDiscoveryError } from '../../../domain/errors/TVDiscoveryError';
import { IUdpSocketTransport, UdpMessageListener, UdpRemoteInfo } from './IUdpSocketTransport';

export interface INativeUdpDriver {
  createSocket(type: 'udp4' | 'udp6'): {
    bind(port?: number, address?: string, callback?: () => void): void;
    send(
      msg: string | Uint8Array,
      offset: number,
      length: number,
      port: number,
      address: string,
      callback?: (error?: Error) => void,
    ): void;
    on(event: 'message', callback: (msg: Uint8Array | string, rinfo: UdpRemoteInfo) => void): void;
    on(event: 'error', callback: (error: Error) => void): void;
    close(callback?: () => void): void;
  };
}

interface IUdpSocketNativeModule {
  isAvailable(): Promise<boolean>;
  bind(port: number): Promise<number>;
  send(message: string, port: number, address: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Production-ready UDP transport supporting:
 * 1. Injected driver (for unit testing and mock environments)
 * 2. NativeModules.UdpSocketModule (Swift/Kotlin native module)
 * 3. Explicit handling of iOS multicast entitlement restrictions
 */
export class NativeUdpSocketTransport implements IUdpSocketTransport {
  private socket: ReturnType<INativeUdpDriver['createSocket']> | null = null;
  private readonly listeners = new Set<UdpMessageListener>();
  private readonly driver: INativeUdpDriver | null;
  private nativeSubscription: { remove(): void } | null = null;
  private isBound = false;

  constructor(driver?: INativeUdpDriver | null) {
    this.driver = driver ?? null;
  }

  private getNativeModule(): IUdpSocketNativeModule | null {
    const module = NativeModules?.UdpSocketModule;
    return module ?? null;
  }

  isAvailable(): boolean {
    if (this.driver !== null) {
      return typeof this.driver.createSocket === 'function';
    }

    // On iOS, receiving UDP multicast requires com.apple.developer.networking.multicast
    // Without this entitlement, iOS drops packets or errors. Manual IP is the reliable path.
    if (Platform.OS === 'ios') {
      return false;
    }

    const nativeModule = this.getNativeModule();
    return nativeModule !== null;
  }

  async bind(port = 0): Promise<number> {
    if (this.driver) {
      return this.bindWithDriver(port);
    }

    if (Platform.OS === 'ios') {
      throw new TVDiscoveryError(
        'SSDP UDP multicast discovery on iOS requires the restricted Apple entitlement com.apple.developer.networking.multicast. Please use manual IP connection.',
        'unsupported_transport',
      );
    }

    const nativeModule = this.getNativeModule();
    if (!nativeModule) {
      throw new TVDiscoveryError(
        'UDP native transport is not available in the current runtime environment',
        'unsupported_transport',
      );
    }

    try {
      const emitter = new NativeEventEmitter(NativeModules.UdpSocketModule);
      this.nativeSubscription = emitter.addListener(
        'onUdpMessage',
        (event: any) => {
          const rinfo: UdpRemoteInfo = {
            address: event.address,
            family: 'IPv4',
            port: event.port,
            size: event.data?.length ?? 0,
          };
          this.listeners.forEach(l => {
            try {
              l(event.data, rinfo);
            } catch {
              // Ignore individual listener errors
            }
          });
        },
      );

      const boundPort = await nativeModule.bind(port);
      this.isBound = true;
      return boundPort;
    } catch (error) {
      this.nativeSubscription?.remove();
      this.nativeSubscription = null;
      throw new TVDiscoveryError('Failed to bind native UDP socket', 'network_unavailable', error);
    }
  }

  private async bindWithDriver(port: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      try {
        const socket = this.driver!.createSocket('udp4');
        this.socket = socket;

        socket.on('error', (err: Error) => {
          reject(new TVDiscoveryError('UDP socket error during bind', 'network_unavailable', err));
        });

        socket.on('message', (msg: Uint8Array | string, rinfo: UdpRemoteInfo) => {
          let text = '';
          const globalObj = globalThis as unknown as { TextDecoder?: new () => { decode(b: Uint8Array): string } };
          if (typeof msg === 'string') {
            text = msg;
          } else if (typeof globalObj.TextDecoder !== 'undefined') {
            text = new globalObj.TextDecoder().decode(msg);
          } else {
            text = Array.from(msg)
              .map(byte => String.fromCharCode(byte))
              .join('');
          }

          this.listeners.forEach(l => {
            try {
              l(text, rinfo);
            } catch {
              // Ignore listener errors
            }
          });
        });

        socket.bind(port, '0.0.0.0', () => {
          this.isBound = true;
          resolve(port);
        });
      } catch (e) {
        reject(new TVDiscoveryError('Failed to create UDP socket', 'unsupported_transport', e));
      }
    });
  }

  async send(message: string, port: number, address: string): Promise<void> {
    if (!this.isBound) {
      throw new TVDiscoveryError('Cannot send UDP datagram before binding socket', 'network_unavailable');
    }

    if (this.driver && this.socket) {
      return new Promise<void>((resolve, reject) => {
        this.socket?.send(message, 0, message.length, port, address, err => {
          if (err) {
            reject(new TVDiscoveryError(`Failed to send UDP datagram to ${address}:${port}`, 'network_unavailable', err));
          } else {
            resolve();
          }
        });
      });
    }

    const nativeModule = this.getNativeModule();
    if (nativeModule) {
      try {
        await nativeModule.send(message, port, address);
      } catch (err) {
        throw new TVDiscoveryError(`Failed to send UDP datagram to ${address}:${port}`, 'network_unavailable', err);
      }
    }
  }

  onMessage(listener: UdpMessageListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    this.isBound = false;
    this.nativeSubscription?.remove();
    this.nativeSubscription = null;
    this.listeners.clear();

    if (this.socket) {
      const sock = this.socket;
      this.socket = null;
      await new Promise<void>(resolve => {
        try {
          sock.close(() => resolve());
        } catch {
          resolve();
        }
      });
    }

    const nativeModule = this.getNativeModule();
    if (nativeModule) {
      try {
        await nativeModule.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}
