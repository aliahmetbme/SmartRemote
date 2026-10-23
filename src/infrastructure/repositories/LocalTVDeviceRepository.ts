import { TVDevice } from '../../domain/entities/TVDevice';
import { UNKNOWN_CAPABILITIES, TVCapabilities } from '../../domain/entities/TVCapabilities';
import { PairingStatus } from '../../domain/enums/PairingStatus';
import { TVBrand } from '../../domain/enums/TVBrand';
import { TVPlatform } from '../../domain/enums/TVPlatform';
import { TVProtocol } from '../../domain/enums/TVProtocol';
import { ITVDeviceRepository } from '../../domain/interfaces/ITVDeviceRepository';
import { IKeyValueStorage } from '../storage/IKeyValueStorage';

const DEVICES_KEY = 'smartremote.savedDevices.v1';
const LAST_SELECTED_KEY = 'smartremote.lastSelectedDeviceId.v1';

export function normalizeDevice(value: unknown): TVDevice | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id || typeof v.ipAddress !== 'string' || !v.ipAddress) {
    return null;
  }
  const name = typeof v.name === 'string' && v.name ? v.name : `LG TV (${v.ipAddress})`;
  const brand =
    typeof v.brand === 'string' && Object.values(TVBrand).includes(v.brand as TVBrand)
      ? (v.brand as TVBrand)
      : TVBrand.LG;
  const platform =
    typeof v.platform === 'string' && Object.values(TVPlatform).includes(v.platform as TVPlatform)
      ? (v.platform as TVPlatform)
      : TVPlatform.WebOS;
  const protocol =
    typeof v.protocol === 'string' && Object.values(TVProtocol).includes(v.protocol as TVProtocol)
      ? (v.protocol as TVProtocol)
      : TVProtocol.LGWebOSSSAP;
  const pairingStatus =
    typeof v.pairingStatus === 'string' &&
    Object.values(PairingStatus).includes(v.pairingStatus as PairingStatus)
      ? (v.pairingStatus as PairingStatus)
      : PairingStatus.Paired;
  const capabilities =
    typeof v.capabilities === 'object' && v.capabilities !== null
      ? (v.capabilities as TVCapabilities)
      : UNKNOWN_CAPABILITIES;
  const model = typeof v.model === 'string' ? v.model : undefined;
  const macAddress = typeof v.macAddress === 'string' ? v.macAddress : undefined;
  const lastConnectedAt = typeof v.lastConnectedAt === 'number' ? v.lastConnectedAt : undefined;

  return {
    id: v.id,
    name,
    brand,
    model,
    ipAddress: v.ipAddress,
    macAddress,
    platform,
    protocol,
    capabilities,
    pairingStatus,
    lastConnectedAt,
  };
}

export class LocalTVDeviceRepository implements ITVDeviceRepository {
  private writeLock: Promise<void> = Promise.resolve();

  constructor(private readonly storage: IKeyValueStorage) {}

  private withLock<T>(op: () => Promise<T>): Promise<T> {
    const next = this.writeLock.then(op, op);
    this.writeLock = next.then(() => {}, () => {});
    return next;
  }

  async getAll(): Promise<TVDevice[]> {
    const raw = await this.storage.getItem(DEVICES_KEY);
    if (!raw) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[SmartRemote][Repository] No saved devices found in storage');
      }
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        console.warn('[SmartRemote][Repository] Storage format invalid, expected array');
        return [];
      }
      const valid: TVDevice[] = [];
      for (const item of parsed) {
        const norm = normalizeDevice(item);
        if (norm) {
          valid.push(norm);
        }
      }
      if (valid.length < parsed.length) {
        console.warn(
          `[SmartRemote][Repository] Ignored ${parsed.length - valid.length} unrecoverable device entries`,
        );
      }
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(
          `[SmartRemote][Repository] Loaded ${valid.length} saved TV device(s): [${valid.map(d => d.id).join(', ')}]`,
        );
      }
      return valid;
    } catch (e) {
      console.error('[SmartRemote][Repository] Failed to parse stored devices JSON', e);
      return [];
    }
  }

  async getById(id: string): Promise<TVDevice | null> {
    return (await this.getAll()).find(d => d.id === id) ?? null;
  }

  async save(device: TVDevice): Promise<void> {
    return this.withLock(async () => {
      // Re-read inside lock to prevent race conditions
      const raw = await this.storage.getItem(DEVICES_KEY);
      let devices: TVDevice[] = [];
      if (raw) {
        try {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              const norm = normalizeDevice(item);
              if (norm) devices.push(norm);
            }
          }
        } catch {
          // If raw is corrupted JSON, reset list
          devices = [];
        }
      }

      const index = devices.findIndex(d => d.id === device.id);
      if (index >= 0) {
        devices[index] = device;
      } else {
        devices.push(device);
      }
      await this.storage.setItem(DEVICES_KEY, JSON.stringify(devices));
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(
          `[SmartRemote][Repository] Saved TV device id='${device.id}', name='${device.name}', total saved=${devices.length}`,
        );
      }
    });
  }

  async remove(id: string): Promise<void> {
    return this.withLock(async () => {
      const devices = (await this.getAll()).filter(d => d.id !== id);
      await this.storage.setItem(DEVICES_KEY, JSON.stringify(devices));
      if ((await this.getLastSelectedId()) === id) {
        await this.setLastSelectedId(null);
      }
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(
          `[SmartRemote][Repository] Removed TV device id='${id}', remaining saved=${devices.length}`,
        );
      }
    });
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
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(`[SmartRemote][Repository] Set lastSelectedDeviceId='${id}'`);
    }
  }
}
