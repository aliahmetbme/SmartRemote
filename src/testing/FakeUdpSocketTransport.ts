import { IUdpSocketTransport, UdpMessageListener, UdpRemoteInfo } from '../infrastructure/discovery/transport/IUdpSocketTransport';

export interface FakeUdpSocketOptions {
  available?: boolean;
  bindPort?: number;
  bindError?: Error;
  sendError?: Error;
}

export class FakeUdpSocketTransport implements IUdpSocketTransport {
  bound = false;
  closed = false;
  sentDatagrams: Array<{ message: string; port: number; address: string }> = [];
  private readonly listeners = new Set<UdpMessageListener>();

  constructor(private readonly options: FakeUdpSocketOptions = {}) {}

  isAvailable(): boolean {
    return this.options.available ?? true;
  }

  async bind(port = 0): Promise<number> {
    if (this.options.available === false) {
      throw new Error('UDP transport not available');
    }
    if (this.options.bindError) {
      throw this.options.bindError;
    }
    this.bound = true;
    return port || this.options.bindPort || 19001;
  }

  async send(message: string, port: number, address: string): Promise<void> {
    if (!this.bound) {
      throw new Error('Socket not bound');
    }
    if (this.options.sendError) {
      throw this.options.sendError;
    }
    this.sentDatagrams.push({ message, port, address });
  }

  onMessage(listener: UdpMessageListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Helper for tests to simulate a datagram received by the socket.
   */
  simulateIncoming(message: string, rinfo: UdpRemoteInfo): void {
    this.listeners.forEach(l => {
      try {
        l(message, rinfo);
      } catch {
        // ignore
      }
    });
  }

  async close(): Promise<void> {
    this.bound = false;
    this.closed = true;
    this.listeners.clear();
  }
}
