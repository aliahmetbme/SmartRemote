import { TVDevice } from '../../domain/entities/TVDevice';
import { ITVDeviceRepository } from '../../domain/interfaces/ITVDeviceRepository';
import { TVConnectionManager } from '../services/TVConnectionManager';

/** Reconnects to the last used TV. Resolves null when there is nothing to restore. */
export class RestoreLastTVUseCase {
  constructor(
    private readonly manager: TVConnectionManager,
    private readonly repository: ITVDeviceRepository,
  ) {}

  async execute(): Promise<TVDevice | null> {
    const id = await this.repository.getLastSelectedId();
    if (!id) {
      return null;
    }
    const device = await this.repository.getById(id);
    if (!device) {
      return null;
    }
    await this.manager.connect(device);
    return device;
  }
}
