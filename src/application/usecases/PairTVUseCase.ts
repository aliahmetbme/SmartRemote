import { TVDevice } from '../../domain/entities/TVDevice';
import { PairingStatus } from '../../domain/enums/PairingStatus';
import { TVPairingError } from '../../domain/errors/TVPairingError';
import { ConnectTVUseCase } from './ConnectTVUseCase';

/** Explicit first-time pairing flow. Already paired devices should use ConnectTVUseCase. */
export class PairTVUseCase {
  constructor(private readonly connectTV: ConnectTVUseCase) {}

  async execute(device: TVDevice): Promise<TVDevice> {
    if (device.pairingStatus === PairingStatus.Paired) {
      throw new TVPairingError('Device is already paired; use connect instead');
    }
    return this.connectTV.execute(device);
  }
}
