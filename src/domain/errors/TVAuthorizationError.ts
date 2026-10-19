export class TVAuthorizationError extends Error {
  readonly code = 'unauthorized' as const;
  readonly cause?: unknown;

  constructor(message = 'Permission or authorization denied by the TV', cause?: unknown) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'TVAuthorizationError';
    this.cause = cause;
  }
}
