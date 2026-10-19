export type TVDiscoveryErrorCode =
  | 'permission_denied'
  | 'network_unavailable'
  | 'timeout'
  | 'cancelled'
  | 'invalid_response'
  | 'unsupported_device'
  | 'unsupported_transport';

export class TVDiscoveryError extends Error {
  readonly code: TVDiscoveryErrorCode;
  readonly cause?: unknown;

  constructor(message: string, code: TVDiscoveryErrorCode = 'unsupported_device', cause?: unknown) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'TVDiscoveryError';
    this.code = code;
    this.cause = cause;
  }
}
