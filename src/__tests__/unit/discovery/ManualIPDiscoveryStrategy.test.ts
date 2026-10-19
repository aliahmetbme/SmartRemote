import { PairingStatus } from '../../../domain/enums/PairingStatus';
import { TVBrand } from '../../../domain/enums/TVBrand';
import { TVPlatform } from '../../../domain/enums/TVPlatform';
import { TVProtocol } from '../../../domain/enums/TVProtocol';
import { ManualIPDiscoveryStrategy } from '../../../infrastructure/discovery/discovery-strategies/ManualIPDiscoveryStrategy';

describe('ManualIPDiscoveryStrategy', () => {
  it('validates and probes a reachable LG TV IP address', async () => {
    const prober = jest.fn().mockResolvedValue(true);
    const strategy = new ManualIPDiscoveryStrategy({ prober });

    const device = await strategy.probe('192.168.1.45');

    expect(prober).toHaveBeenCalledWith('192.168.1.45', 3000);
    expect(device).toMatchObject({
      id: 'manual-lg-192.168.1.45',
      name: 'LG webOS TV (192.168.1.45)',
      brand: TVBrand.LG,
      platform: TVPlatform.WebOS,
      protocol: TVProtocol.LGWebOSSSAP,
      ipAddress: '192.168.1.45',
      pairingStatus: PairingStatus.Unpaired,
    });
    expect(device.capabilities.volumeControl).toBe('unknown');
  });

  it('rejects public internet IPs and invalid address formats', async () => {
    const prober = jest.fn();
    const strategy = new ManualIPDiscoveryStrategy({ prober });

    await expect(strategy.probe('8.8.8.8')).rejects.toMatchObject({
      code: 'invalid_response',
    });

    await expect(strategy.probe('192.168.1.300')).rejects.toMatchObject({
      code: 'invalid_response',
    });

    await expect(strategy.probe('not-an-ip')).rejects.toMatchObject({
      code: 'invalid_response',
    });

    expect(prober).not.toHaveBeenCalled();
  });

  it('throws TVDiscoveryError when the device probe fails', async () => {
    const prober = jest.fn().mockResolvedValue(false);
    const strategy = new ManualIPDiscoveryStrategy({ prober });

    await expect(strategy.probe('192.168.1.99')).rejects.toMatchObject({
      code: 'unsupported_device',
    });
  });

  it('handles cancellation via AbortSignal', async () => {
    const prober = jest.fn();
    const strategy = new ManualIPDiscoveryStrategy({ prober });

    const controller = new AbortController();
    controller.abort();

    await expect(strategy.probe('192.168.1.50', { signal: controller.signal })).rejects.toMatchObject({
      code: 'cancelled',
    });
  });
});
