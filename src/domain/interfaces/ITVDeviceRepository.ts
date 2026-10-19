import { TVDevice } from '../entities/TVDevice';

export interface ITVDeviceRepository {
  getAll(): Promise<TVDevice[]>;
  getById(id: string): Promise<TVDevice | null>;
  /** Insert or update. */
  save(device: TVDevice): Promise<void>;
  remove(id: string): Promise<void>;
  getLastSelectedId(): Promise<string | null>;
  setLastSelectedId(id: string | null): Promise<void>;
}
