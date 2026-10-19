export interface SSDPPacket {
  status: number;
  headers: Record<string, string>;
  raw: string;
}

export const SSDP_MULTICAST_ADDRESS = '239.255.255.250';
export const SSDP_MULTICAST_PORT = 1900;
export const LG_WEBOS_SSDP_ST = 'urn:lge-com:service:webos-second-screen:1';

/**
 * Validates whether an IP address is a valid local/private IPv4 address.
 * Prevents SSRF attacks and connecting to arbitrary internet hosts.
 */
export function isLocalIPv4Address(ip: string): boolean {
  if (!ip || typeof ip !== 'string') {
    return false;
  }

  const parts = ip.split('.');
  if (parts.length !== 4) {
    return false;
  }

  const octets = parts.map(p => {
    if (!/^\d{1,3}$/.test(p)) {
      return -1;
    }
    if (p.length > 1 && p.startsWith('0')) {
      return -1;
    }
    const n = Number(p);
    return n >= 0 && n <= 255 ? n : -1;
  });

  if (octets.some(o => o === -1)) {
    return false;
  }

  const [a, b] = octets;

  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 127.0.0.0/8 (Loopback for local dev/testing)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-local)
  if (a === 169 && b === 254) return true;

  return false;
}

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
