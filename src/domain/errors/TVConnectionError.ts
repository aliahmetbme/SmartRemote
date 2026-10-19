export type TVConnectionErrorCode = 'connection_failed' | 'timeout' | 'cancelled' | 'no_device';

export class TVConnectionError extends Error {
  readonly code: TVConnectionErrorCode;
  readonly cause?: unknown;

  constructor(message: string, code: TVConnectionErrorCode = 'connection_failed', cause?: unknown) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'TVConnectionError';
    this.code = code;
    this.cause = cause;
  }
}

export class TVTimeoutError extends TVConnectionError {
  constructor(message = 'Operation timed out', cause?: unknown) {
    super(message, 'timeout', cause);
    this.name = 'TVTimeoutError';
  }
}
