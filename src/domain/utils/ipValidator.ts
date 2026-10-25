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
