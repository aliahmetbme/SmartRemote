import { TVDevice } from '../entities/TVDevice';

export interface SaveTVDeviceOptions {
  preserveStoredMac?: boolean;
  requireExisting?: boolean;
  isCurrent?: () => boolean;
}

export interface ITVDeviceRepository {
  getAll(): Promise<TVDevice[]>;
  getById(id: string): Promise<TVDevice | null>;
  /** Insert or update. */
  save(device: TVDevice, options?: SaveTVDeviceOptions): Promise<void>;
  remove(id: string): Promise<void>;
  getLastSelectedId(): Promise<string | null>;
  setLastSelectedId(id: string | null, isCurrent?: () => boolean): Promise<void>;
}
