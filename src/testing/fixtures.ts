import { createCapabilities } from '../domain/entities/TVCapabilities';
import { TVDevice } from '../domain/entities/TVDevice';
import { PairingStatus } from '../domain/enums/PairingStatus';
import { TVBrand } from '../domain/enums/TVBrand';
import { TVPlatform } from '../domain/enums/TVPlatform';
import { TVProtocol } from '../domain/enums/TVProtocol';

export function makeMockDevice(overrides: Partial<TVDevice> = {}): TVDevice {
  return {
    id: 'mock-1',
    name: 'Mock TV',
    brand: TVBrand.Mock,
    ipAddress: '192.168.0.10',
    platform: TVPlatform.Mock,
    protocol: TVProtocol.Mock,
    capabilities: createCapabilities(),
    pairingStatus: PairingStatus.Unpaired,
    ...overrides,
  };
}

export function makeWebOSDevice(overrides: Partial<TVDevice> = {}): TVDevice {
  return makeMockDevice({
    id: 'webos-1',
    name: 'Living Room TV',
    brand: TVBrand.LG,
    platform: TVPlatform.WebOS,
    protocol: TVProtocol.LGWebOSSSAP,
    ...overrides,
  });
}
