import { ICredentialStorage } from '../../domain/interfaces/ICredentialStorage';

/** Non-persistent storage for tests only. Production uses Keychain (Phase 3). */
export class InMemoryCredentialStorage implements ICredentialStorage {
  private readonly data = new Map<string, string>();

  async get(deviceId: string): Promise<string | null> {
    return this.data.get(deviceId) ?? null;
  }
  async set(deviceId: string, credential: string): Promise<void> {
    this.data.set(deviceId, credential);
  }
  async remove(deviceId: string): Promise<void> {
    this.data.delete(deviceId);
  }
}
