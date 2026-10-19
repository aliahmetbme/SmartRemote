import { TVDevice } from '../../domain/entities/TVDevice';
import { ITVDeviceRepository } from '../../domain/interfaces/ITVDeviceRepository';
import { IKeyValueStorage } from '../storage/IKeyValueStorage';

const DEVICES_KEY = 'smartremote.savedDevices.v1';
const LAST_SELECTED_KEY = 'smartremote.lastSelectedDeviceId.v1';

function isDeviceLike(value: unknown): value is TVDevice {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.ipAddress === 'string' &&
    typeof v.protocol === 'string' &&
    typeof v.platform === 'string' &&
    typeof v.capabilities === 'object' &&
    v.capabilities !== null
  );
}

/** Stores non-sensitive device metadata only. Pairing keys belong in ICredentialStorage. */
export class LocalTVDeviceRepository implements ITVDeviceRepository {
  constructor(private readonly storage: IKeyValueStorage) {}

  async getAll(): Promise<TVDevice[]> {
    const raw = await this.storage.getItem(DEVICES_KEY);
    if (!raw) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isDeviceLike) : [];
    } catch {
      return [];
    }
  }

  async getById(id: string): Promise<TVDevice | null> {
    return (await this.getAll()).find(d => d.id === id) ?? null;
  }

  async save(device: TVDevice): Promise<void> {
    const devices = await this.getAll();
    const index = devices.findIndex(d => d.id === device.id);
    if (index >= 0) {
      devices[index] = device;
    } else {
      devices.push(device);
    }
    await this.storage.setItem(DEVICES_KEY, JSON.stringify(devices));
  }

  async remove(id: string): Promise<void> {
    const devices = (await this.getAll()).filter(d => d.id !== id);
    await this.storage.setItem(DEVICES_KEY, JSON.stringify(devices));
    if ((await this.getLastSelectedId()) === id) {
      await this.setLastSelectedId(null);
    }
  }

  getLastSelectedId(): Promise<string | null> {
    return this.storage.getItem(LAST_SELECTED_KEY);
  }

  async setLastSelectedId(id: string | null): Promise<void> {
    if (id === null) {
      await this.storage.removeItem(LAST_SELECTED_KEY);
    } else {
      await this.storage.setItem(LAST_SELECTED_KEY, id);
    }
  }
}
