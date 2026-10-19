import { TVDevice } from '../entities/TVDevice';
import { ITVRemoteAdapter } from './ITVRemoteAdapter';

export interface ITVAdapterFactory {
  /** @throws TVUnsupportedOperationError when no adapter supports the device. */
  create(device: TVDevice): ITVRemoteAdapter;
  supports(device: TVDevice): boolean;
}
