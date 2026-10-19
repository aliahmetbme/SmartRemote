import { TVPairingError } from '../../domain/errors/TVPairingError';
import { ICredentialStorage } from '../../domain/interfaces/ICredentialStorage';

export interface IKeychainBridge {
  getGenericPassword(options?: { service?: string }): Promise<false | { password: string }>;
  setGenericPassword(
    username: string,
    password: string,
    options?: { service?: string; accessible?: string },
  ): Promise<unknown>;
  resetGenericPassword(options?: { service?: string }): Promise<boolean>;
}

function getDefaultKeychain(): IKeychainBridge {
  try {
    const Keychain = require('react-native-keychain');
    return Keychain;
  } catch (error) {
    throw new TVPairingError('React Native Keychain is not available in the current runtime environment', error);
  }
}

/**
 * Production implementation of ICredentialStorage backed by React Native Keychain.
 * Uses device-scoped keychain services to store client pairing keys securely.
 * Credentials are never logged, never saved in Redux, and never saved in AsyncStorage.
 */
export class SecureCredentialStorage implements ICredentialStorage {
  private readonly keychain: IKeychainBridge;

  constructor(keychainBridge?: IKeychainBridge) {
    this.keychain = keychainBridge ?? getDefaultKeychain();
  }

  private getServiceKey(deviceId: string): string {
    return `smartremote.tv.${deviceId}`;
  }

  async get(deviceId: string): Promise<string | null> {
    try {
      const result = await this.keychain.getGenericPassword({
        service: this.getServiceKey(deviceId),
      });
      if (!result) {
        return null;
      }
      return result.password;
    } catch (error) {
      throw new TVPairingError('Failed to read pairing credentials from secure storage', error);
    }
  }

  async set(deviceId: string, credential: string): Promise<void> {
    if (!credential) {
      throw new TVPairingError('Cannot store an empty pairing key');
    }
    try {
      await this.keychain.setGenericPassword('clientKey', credential, {
        service: this.getServiceKey(deviceId),
        accessible: 'AccessibleWhenUnlockedThisDeviceOnly',
      });
    } catch (error) {
      throw new TVPairingError('Failed to save pairing credentials into secure storage', error);
    }
  }

  async remove(deviceId: string): Promise<void> {
    try {
      await this.keychain.resetGenericPassword({
        service: this.getServiceKey(deviceId),
      });
    } catch (error) {
      throw new TVPairingError('Failed to remove pairing credentials from secure storage', error);
    }
  }
}
