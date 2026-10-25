export interface WakeOptions {
  /** Target UDP port. Defaults to 9 (with 7 supported as compatibility option). */
  port?: number;
  /** Custom destination broadcast address (e.g. "192.168.1.255"). Defaults to auto-discovered subnet broadcast and global broadcast. */
  broadcastAddress?: string;
  /** Bounded packet repeats. Defaults to 3. */
  repeatCount?: number;
  /** Milliseconds delay between repeat transmissions. Defaults to 50ms. */
  delayMs?: number;
}

export interface WakeResult {
  success: boolean;
  packetsSent: number;
  destinations: string[];
}

export interface ITVWakeService {
  /**
   * Transmits standard 102-byte Wake-on-LAN magic packet(s) to the target MAC address.
   */
  wake(macAddress: string, options?: WakeOptions): Promise<WakeResult>;

  /**
   * Returns true if UDP broadcast transmission is available on the current platform/runtime.
   */
  isSupported(): Promise<boolean>;
}
