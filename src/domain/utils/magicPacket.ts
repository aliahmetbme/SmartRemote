import { parseMacBytes } from './macValidator';

export const MAGIC_PACKET_LENGTH = 102;
export const MAGIC_PACKET_HEADER_LENGTH = 6;
export const MAC_REPETITIONS = 16;
export const MAC_ADDRESS_LENGTH = 6;

/**
 * Builds standard Wake-on-LAN (AMD Magic Packet) payload:
 * - 6 bytes of 0xFF
 * - Followed by 16 repetitions of the target 6-byte MAC address
 * Total length: 102 bytes.
 *
 * Throws Error if MAC address is invalid.
 */
export function buildMagicPacket(macAddress: string): Uint8Array {
  const macBytes = parseMacBytes(macAddress);
  const packet = new Uint8Array(MAGIC_PACKET_LENGTH);

  // 1. Synchronization stream: 6 bytes of 0xFF
  for (let i = 0; i < MAGIC_PACKET_HEADER_LENGTH; i++) {
    packet[i] = 0xff;
  }

  // 2. Target MAC address repeated 16 times
  for (let rep = 0; rep < MAC_REPETITIONS; rep++) {
    const offset = MAGIC_PACKET_HEADER_LENGTH + rep * MAC_ADDRESS_LENGTH;
    for (let byteIdx = 0; byteIdx < MAC_ADDRESS_LENGTH; byteIdx++) {
      packet[offset + byteIdx] = macBytes[byteIdx];
    }
  }

  return packet;
}

/**
 * Converts a Uint8Array binary buffer to base64 string for bridge transport.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const globalAny = globalThis as unknown as {
    Buffer?: { from: (...args: unknown[]) => { toString: (enc: string) => string } };
    btoa?: (str: string) => string;
  };
  if (typeof globalAny.Buffer !== 'undefined') {
    return globalAny.Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof globalAny.btoa === 'function') {
    return globalAny.btoa(binary);
  }
  throw new Error('Base64 encoding is not available in the current JavaScript runtime');
}
