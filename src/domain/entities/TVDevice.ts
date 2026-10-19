import { PairingStatus } from '../enums/PairingStatus';
import { TVBrand } from '../enums/TVBrand';
import { TVPlatform } from '../enums/TVPlatform';
import { TVProtocol } from '../enums/TVProtocol';
import { TVCapabilities } from './TVCapabilities';

/**
 * Plain, serializable description of a TV. Contains no secrets
 * (pairing keys live in ICredentialStorage).
 */
export interface TVDevice {
  id: string;
  name: string;
  brand: TVBrand;
  model?: string;
  ipAddress: string;
  macAddress?: string;
  platform: TVPlatform;
  protocol: TVProtocol;
  /** Capabilities known/declared at discovery time; adapters report the authoritative set once connected. */
  capabilities: TVCapabilities;
  pairingStatus: PairingStatus;
  /** Epoch milliseconds. */
  lastConnectedAt?: number;
}
