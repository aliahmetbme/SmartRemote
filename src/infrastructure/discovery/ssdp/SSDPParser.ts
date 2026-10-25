export interface SSDPPacket {
  status: number;
  headers: Record<string, string>;
  raw: string;
}

export const SSDP_MULTICAST_ADDRESS = '239.255.255.250';
export const SSDP_MULTICAST_PORT = 1900;
export const LG_WEBOS_SSDP_ST = 'urn:lge-com:service:webos-second-screen:1';

import { isLocalIPv4Address } from '../../../domain/utils/ipValidator';

export { isLocalIPv4Address };

/**
 * Builds a compliant SSDP M-SEARCH discovery packet.
 */
export function createMSearchPacket(target = LG_WEBOS_SSDP_ST, mx = 3): string {
  return [
    'M-SEARCH * HTTP/1.1',
    `HOST: ${SSDP_MULTICAST_ADDRESS}:${SSDP_MULTICAST_PORT}`,
    'MAN: "ssdp:discover"',
    `MX: ${Math.max(1, Math.min(mx, 5))}`,
    `ST: ${target}`,
    'USER-AGENT: SmartRemote/1.0 UPnP/1.0',
    '',
    '',
  ].join('\r\n');
}

/**
 * Parses raw SSDP HTTP response or NOTIFY datagram.
 * Header names are normalized to lowercase.
 */
export function parseSSDPResponse(raw: string): SSDPPacket | null {
  if (!raw || typeof raw !== 'string') {
    return null;
  }

  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) {
    return null;
  }

  const firstLine = lines[0].trim();
  const statusMatch = /^HTTP\/\d\.\d\s+(\d{3})/i.exec(firstLine);
  const status = statusMatch ? Number(statusMatch[1]) : (firstLine.startsWith('NOTIFY') ? 200 : 0);

  if (status !== 200) {
    return null;
  }

  const headers: Record<string, string> = {};

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();
      headers[key] = value;
    }
  }

  return { status, headers, raw };
}

/**
 * Extracts UUID from a USN string (e.g. `uuid:12345678-1234...::urn:...` -> `12345678-1234...`)
 */
export function extractUUIDFromUSN(usn?: string): string | null {
  if (!usn) return null;
  const match = /uuid:([A-Fa-f0-9-]+)/i.exec(usn);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Extracts host IP and port from a URL string.
 */
export function extractHostFromLocation(location?: string): { host: string; port: number } | null {
  if (!location) return null;
  const match = /^https?:\/\/([^/:]+)(?::(\d+))?/i.exec(location);
  if (!match) return null;
  const host = match[1];
  const port = match[2] ? Number(match[2]) : 80;
  return { host, port };
}
