export class TVUnsupportedOperationError extends Error {
  readonly code = 'unsupported_operation' as const;
  readonly operation: string;

  constructor(operation: string, reason?: string) {
    super(`Operation "${operation}" is not supported${reason ? `: ${reason}` : ''}`);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'TVUnsupportedOperationError';
    this.operation = operation;
  }
}
