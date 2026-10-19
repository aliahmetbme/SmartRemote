import { TVDevice } from '../../domain/entities/TVDevice';
import { PairingStatus } from '../../domain/enums/PairingStatus';
import { ITVDeviceRepository } from '../../domain/interfaces/ITVDeviceRepository';
import { TVConnectionManager } from '../services/TVConnectionManager';

/**
 * Connects to a TV (pairing happens inside the adapter if required) and, once
 * the TV is ready for commands, persists it as paired and as the last device.
 */
export class ConnectTVUseCase {
  constructor(
    private readonly manager: TVConnectionManager,
    private readonly repository: ITVDeviceRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(device: TVDevice): Promise<TVDevice> {
    await this.manager.connect(device);
    const connected: TVDevice = {
      ...device,
      pairingStatus: PairingStatus.Paired,
      lastConnectedAt: this.now(),
    };
    await this.repository.save(connected);
    await this.repository.setLastSelectedId(connected.id);
    return connected;
  }
}
