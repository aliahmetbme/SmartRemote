import { TVDevice } from '../../domain/entities/TVDevice';
import { TVConnectionError } from '../../domain/errors/TVConnectionError';
import { ITVDeviceRepository } from '../../domain/interfaces/ITVDeviceRepository';
import { canonicalizeMacAddress, isValidMacAddress } from '../../domain/utils/macValidator';

export class UpdateTVMacUseCase {
  constructor(private readonly repository: ITVDeviceRepository) {}

  async execute(deviceId: string, macAddress: string): Promise<TVDevice> {
    if (!isValidMacAddress(macAddress)) {
      throw new TVConnectionError(
        `Invalid MAC address: "${macAddress}". Please use format XX:XX:XX:XX:XX:XX`,
        'invalid_mac',
      );
    }

    const canonicalMac = canonicalizeMacAddress(macAddress);
    const device = await this.repository.getById(deviceId);
    if (!device) {
      throw new TVConnectionError(`TV device '${deviceId}' not found in saved devices`, 'not_found');
    }

    const updatedDevice: TVDevice = {
      ...device,
      macAddress: canonicalMac,
    };

    await this.repository.save(updatedDevice);
    return updatedDevice;
  }
}
