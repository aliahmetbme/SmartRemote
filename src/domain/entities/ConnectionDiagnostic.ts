import { TVPairingError } from '../errors/TVPairingError';
export type FailureCategory =
  | 'NETWORK_UNAVAILABLE'
  | 'CONNECTION_TIMEOUT'
  | 'TV_UNREACHABLE'
  | 'CONNECTION_REFUSED'
  | 'DNS_FAILURE'
  | 'PAIRING_FAILED'
  | 'PAIRING_REJECTED'
  | 'TLS_TRUST_FAILURE'
  | 'CONNECTION_LOST'
  | 'UNKNOWN';
export interface LocalNetworkStatus {
  wifi: boolean | null;
  localTransport: boolean | null;
}
export interface ConnectionDiagnostic {
  category: FailureCategory;
  confidence: 'confirmed' | 'unknown';
  evidence: string;
  transportCode: string | null;
  failedAt: number;
  deviceId: string | null;
  revision: number;
  retryAttempt: number;
  network: LocalNetworkStatus;
}
// Only allowlisted structured codes are retained. Raw messages/domains/credentials are never serialized.
const transportCodes = new Set([
  'CONNECTION_TIMEOUT',
  'TV_UNREACHABLE',
  'CONNECTION_REFUSED',
  'DNS_FAILURE',
  'TLS_TRUST_FAILURE',
]);
export function classifyConnectionFailure(
  error: unknown,
  lost = false,
): Pick<
  ConnectionDiagnostic,
  'category' | 'confidence' | 'evidence' | 'transportCode'
> {
  let current = error;
  for (
    let depth = 0;
    current && typeof current === 'object' && depth < 6;
    ++depth
  ) {
    const item = current as {
      code?: unknown;
      cause?: unknown;
      domain?: unknown;
      diagnosticCode?: unknown;
      errorCode?: unknown;
    };
    if (current instanceof TVPairingError)
      return {
        category:
          current.reason === 'rejected' ? 'PAIRING_REJECTED' : 'PAIRING_FAILED',
        confidence: 'confirmed',
        evidence:
          current.reason === 'rejected'
            ? 'TV rejected registration'
            : 'Registration did not complete',
        transportCode: null,
      };
    let category: FailureCategory | null = null;
    if (
      typeof item.diagnosticCode === 'string' &&
      transportCodes.has(item.diagnosticCode)
    )
      category = item.diagnosticCode as FailureCategory;
    if (item.code === 'tls_trust_failure') category = 'TLS_TRUST_FAILURE';
    if (item.code === 'timeout') category = 'CONNECTION_TIMEOUT';
    // Existing NSURLSession transport preserves NSURLErrorDomain + numeric code.
    if (item.domain === 'NSURLErrorDomain') {
      const code =
        typeof item.errorCode === 'number' ? item.errorCode : item.code;
      if (code === -1001) category = 'CONNECTION_TIMEOUT';
      if (code === -1004) category = 'TV_UNREACHABLE';
      if (code === -1003 || code === -1006) category = 'DNS_FAILURE';
      if ([-1201, -1202, -1203, -1204].includes(code as number))
        category = 'TLS_TRUST_FAILURE';
    }
    if (category)
      return {
        category,
        confidence: 'confirmed',
        evidence: 'Structured transport failure',
        transportCode: category,
      };
    current = item.cause;
  }
  return {
    category: lost ? 'CONNECTION_LOST' : 'UNKNOWN',
    confidence: lost ? 'confirmed' : 'unknown',
    evidence: lost
      ? 'Established TV session closed'
      : 'No reliable cause supplied by transport',
    transportCode: null,
  };
}
export function isRetryableConnectionFailure(error: unknown): boolean {
  const category = classifyConnectionFailure(error).category;
  return !['PAIRING_FAILED', 'PAIRING_REJECTED', 'TLS_TRUST_FAILURE'].includes(
    category,
  );
}
