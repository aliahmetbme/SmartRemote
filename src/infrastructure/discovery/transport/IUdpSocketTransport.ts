export interface UdpRemoteInfo {
  address: string;
  port: number;
  family?: 'IPv4' | 'IPv6';
  size?: number;
}

export type UdpMessageListener = (message: string, rinfo: UdpRemoteInfo) => void;

/**
 * Protocol-independent contract for UDP socket networking.
 * Decouples SSDP packet serialization/deserialization from physical sockets.
 */
export interface IUdpSocketTransport {
  /**
   * Binds to a local port (or ephemeral port if not specified).
   * Resolves with the bound port number.
   */
  bind(port?: number): Promise<number>;

  /**
   * Sends a UDP datagram to the specified destination.
   */
  send(message: string, port: number, address: string): Promise<void>;

  /**
   * Registers a callback for incoming datagrams.
   * Returns an unsubscribe function.
   */
  onMessage(listener: UdpMessageListener): () => void;

  /**
   * Closes the socket and releases native resources.
   */
  close(): Promise<void>;

  /**
   * Returns true if UDP socket networking is supported in the current environment.
   */
  isAvailable(): boolean;
}
