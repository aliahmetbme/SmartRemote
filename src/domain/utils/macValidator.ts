/**
 * MAC Address Validation, Canonicalization, and Parsing.
 *
 * Supports formats:
 * - Colon-separated: "AA:BB:CC:DD:EE:FF"
 * - Hyphen-separated: "AA-BB-CC-DD-EE-FF"
 * - Dot-separated: "AABB.CCDD.EEFF"
 * - Plain hex: "AABBCCDDEEFF"
 */

const MAC_HEX_REGEX = /^[0-9a-fA-F]{12}$/;

/**
 * Strips all non-hexadecimal delimiters and returns uppercase 12-char hex string,
 * or null if the input is invalid or contains unexpected characters.
 */
export function extractHexMac(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  const clean = input.trim().replace(/[:.-]/g, '');
  if (!MAC_HEX_REGEX.test(clean)) {
    return null;
  }
  return clean.toUpperCase();
}

/**
 * Validates whether a given value is a syntactically valid unicast MAC address.
 * Rejects:
 * - Empty / null / non-string
 * - Wrong number of hex digits (not 12 hex digits)
 * - Broadcast address (FF:FF:FF:FF:FF:FF)
 * - All-zero address (00:00:00:00:00:00)
 */
export function isValidMacAddress(input: unknown): boolean {
  const hex = extractHexMac(input);
  if (!hex) {
    return false;
  }
  if (hex === '000000000000' || hex === 'FFFFFFFFFFFF') {
    return false;
  }
  return true;
}

/**
 * Canonicalizes any valid MAC address into standard uppercase colon-separated format:
 * "AA:BB:CC:DD:EE:FF".
 *
 * Throws Error if the MAC is invalid.
 */
export function canonicalizeMacAddress(input: string): string {
  const hex = extractHexMac(input);
  if (!hex || hex === '000000000000' || hex === 'FFFFFFFFFFFF') {
    throw new Error(`Invalid MAC address: "${input}"`);
  }
  const parts: string[] = [];
  for (let i = 0; i < 12; i += 2) {
    parts.push(hex.substring(i, i + 2));
  }
  return parts.join(':');
}

/**
 * Parses a valid MAC address into 6 raw bytes (Uint8Array).
 *
 * Throws Error if the MAC is invalid.
 */
export function parseMacBytes(input: string): Uint8Array {
  const hex = extractHexMac(input);
  if (!hex || hex === '000000000000' || hex === 'FFFFFFFFFFFF') {
    throw new Error(`Invalid MAC address: "${input}"`);
  }
  const bytes = new Uint8Array(6);
  for (let i = 0; i < 6; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Formats a 6-byte array or buffer into canonical "AA:BB:CC:DD:EE:FF" string.
 */
export function formatMacBytes(bytes: Uint8Array | number[]): string {
  if (!bytes || bytes.length !== 6) {
    throw new Error('MAC bytes must be exactly 6 bytes');
  }
  const parts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const val = bytes[i];
    if (val < 0 || val > 255 || !Number.isInteger(val)) {
      throw new Error(`Invalid byte value at index ${i}: ${val}`);
    }
    parts.push(val.toString(16).padStart(2, '0').toUpperCase());
  }
  return parts.join(':');
}
