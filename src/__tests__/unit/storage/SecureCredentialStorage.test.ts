import { TVPairingError } from '../../../domain/errors/TVPairingError';
import { IKeychainBridge, SecureCredentialStorage } from '../../../infrastructure/storage/SecureCredentialStorage';

describe('SecureCredentialStorage', () => {
  it('stores, retrieves, and removes credentials using scoped keychain services', async () => {
    const memory = new Map<string, string>();

    const mockKeychain: IKeychainBridge = {
      getGenericPassword: async options => {
        const val = memory.get(options?.service ?? '');
        return val ? { password: val } : false;
      },
      setGenericPassword: async (_user, password, options) => {
        memory.set(options?.service ?? '', password);
        return true;
      },
      resetGenericPassword: async options => {
        memory.delete(options?.service ?? '');
        return true;
      },
    };

    const storage = new SecureCredentialStorage(mockKeychain);

    await storage.set('tv-100', 'super-secret-client-key');
    expect(await storage.get('tv-100')).toBe('super-secret-client-key');
    expect(await storage.get('tv-200')).toBeNull();

    await storage.remove('tv-100');
    expect(await storage.get('tv-100')).toBeNull();
  });

  it('rejects empty credentials with TVPairingError', async () => {
    const storage = new SecureCredentialStorage({
      getGenericPassword: jest.fn(),
      setGenericPassword: jest.fn(),
      resetGenericPassword: jest.fn(),
    });

    await expect(storage.set('tv-1', '')).rejects.toBeInstanceOf(TVPairingError);
  });

  it('wraps native keychain errors into TVPairingError without leaking credentials in error message', async () => {
    const secret = 'sensitive-token-12345';
    const mockKeychain: IKeychainBridge = {
      getGenericPassword: async () => {
        throw new Error('Device keystore is locked');
      },
      setGenericPassword: async () => {
        throw new Error('OS authorization failed');
      },
      resetGenericPassword: async () => {
        throw new Error('Reset failed');
      },
    };

    const storage = new SecureCredentialStorage(mockKeychain);

    await expect(storage.get('tv-1')).rejects.toThrow(TVPairingError);
    await expect(storage.set('tv-1', secret)).rejects.toThrow(TVPairingError);
    await expect(storage.remove('tv-1')).rejects.toThrow(TVPairingError);

    // Verify secret is not in the error message
    try {
      await storage.set('tv-1', secret);
    } catch (err: unknown) {
      expect((err as Error).message).not.toContain(secret);
    }
  });
});
