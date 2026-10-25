import { ICredentialStorage } from '../../domain/interfaces/ICredentialStorage';
import { ITVDeviceRepository } from '../../domain/interfaces/ITVDeviceRepository';
import { TVConnectionManager } from '../services/TVConnectionManager';

export interface ForgetTVResult {
  deviceId: string;
  disconnected: boolean;
  credentialsRemoved: boolean;
  deviceRemoved: boolean;
}

/**
 * Coordinates forgetting a TV:
 * 1. Safely disconnects the active connection if it matches the forgotten device.
 * 2. Removes the device from the persistent repository.
 * 3. Removes stored pairing credentials from secure credential storage.
 */
export class ForgetTVUseCase {
  constructor(
    private readonly repository: ITVDeviceRepository,
    private readonly manager: TVConnectionManager,
    private readonly credentialStorage?: ICredentialStorage,
  ) {}

  async execute(deviceId: string): Promise<ForgetTVResult> {
    if (!deviceId) {
      throw new Error('Device ID must not be empty');
    }

    let disconnected = false;
    let credentialsRemoved = false;

    // 1. If currently connected or reconnecting to this TV, tear down connection cleanly
    const currentDevice = this.manager.getDevice();
    if (currentDevice && currentDevice.id === deviceId) {
      try {
        await this.manager.disconnect();
        disconnected = true;
      } catch (err) {
        console.warn(`[SmartRemote][ForgetTV] Failed to cleanly disconnect TV ${deviceId}:`, err);
      }
    }

    // 2. Remove persistent metadata from repository (authoritative source)
    await this.repository.remove(deviceId);

    // 3. Remove pairing credentials from Keychain / secure storage
    if (this.credentialStorage) {
      try {
        await this.credentialStorage.remove(deviceId);
        credentialsRemoved = true;
      } catch (err) {
        console.warn(`[SmartRemote][ForgetTV] Failed to delete credentials for TV ${deviceId}:`, err);
      }
    }

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(`[SmartRemote][ForgetTV] Successfully forgot TV device ${deviceId}`);
    }

    return {
      deviceId,
      disconnected,
      credentialsRemoved,
      deviceRemoved: true,
    };
  }
}
