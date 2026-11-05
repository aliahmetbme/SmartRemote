import { isValidMacAddress } from '../../domain/utils/macValidator';
import { TVDevice } from '../../domain/entities/TVDevice';
import { PairingStatus } from '../../domain/enums/PairingStatus';
import { ITVDeviceRepository } from '../../domain/interfaces/ITVDeviceRepository';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { TVConnectionError } from '../../domain/errors/TVConnectionError';
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
    private readonly onSelect?: (id: string) => void,
  ) {}

  async execute(device: TVDevice): Promise<TVDevice> {
    this.onSelect?.(device.id);
    const connection = this.manager.connect(device);
    const revision = this.manager.getOperationRevision();
    const isCurrent = () => this.manager.getOperationRevision() === revision &&
      this.manager.getState() === TVConnectionState.Connected &&
      this.manager.getDevice()?.id === device.id;
    const assertCurrent = () => {
      if (!isCurrent()) throw new TVConnectionError('Connection superseded', 'cancelled');
    };
    await connection;
    assertCurrent();
    const activeDevice = this.manager.getDevice() ?? device;
    const existing = await this.repository.getById(device.id);
    assertCurrent();
    const macAddress = isValidMacAddress(existing?.macAddress) ? existing?.macAddress : activeDevice.macAddress || device.macAddress;
    const connected: TVDevice = {
      ...(existing ?? device),
      ...activeDevice,
      pairingStatus: PairingStatus.Paired,
      capabilities: this.manager.getCapabilities() ?? existing?.capabilities ?? device.capabilities,
      macAddress,
      lastConnectedAt: this.now(),
    };
    await this.repository.save(connected, { preserveStoredMac: true, isCurrent });
    assertCurrent();
    await this.repository.setLastSelectedId(connected.id, isCurrent);
    const saved = await this.repository.getById(connected.id);
    assertCurrent();
    return saved ?? connected;
  }
}
