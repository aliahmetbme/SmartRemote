export class RepositoryCorruptionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'RepositoryCorruptionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
