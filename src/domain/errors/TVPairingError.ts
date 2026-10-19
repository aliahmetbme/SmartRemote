export class TVPairingError extends Error {
  readonly code = 'pairing_failed' as const;
  readonly cause?: unknown;

  constructor(message = 'Pairing with the TV failed', cause?: unknown) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'TVPairingError';
    this.cause = cause;
  }
}
