import { makeMockDevice, makeWebOSDevice } from '../../../testing/fixtures';
import { IDiscoveryStrategy } from '../../../infrastructure/discovery/discovery-strategies/IDiscoveryStrategy';
import { ManualIPDiscoveryStrategy } from '../../../infrastructure/discovery/discovery-strategies/ManualIPDiscoveryStrategy';
import { TVDiscoveryService } from '../../../infrastructure/discovery/TVDiscoveryService';

describe('TVDiscoveryService', () => {
  it('combines and deduplicates devices from multiple strategies', async () => {
    const dev1 = makeMockDevice({ id: 'tv-1', name: 'Mock TV 1' });
    const dev2 = makeWebOSDevice({ id: 'tv-2', name: 'LG TV 2' });
    const devDuplicate = makeWebOSDevice({ id: 'tv-2', name: 'LG TV 2 Duplicate' });

    const strategyA: IDiscoveryStrategy = {
      id: 'strat-a',
      isAvailable: () => true,
      discover: async options => {
        options?.onDeviceFound?.(dev1);
        options?.onDeviceFound?.(dev2);
        return [dev1, dev2];
      },
    };

    const strategyB: IDiscoveryStrategy = {
      id: 'strat-b',
      isAvailable: () => true,
      discover: async options => {
        options?.onDeviceFound?.(devDuplicate);
        return [devDuplicate];
      },
    };

    const service = new TVDiscoveryService({
      strategies: [strategyA, strategyB],
    });

    const onDeviceFound = jest.fn();
    const result = await service.discover({ onDeviceFound });

    expect(result).toHaveLength(2);
    expect(result.map(d => d.id)).toEqual(['tv-1', 'tv-2']);
    expect(onDeviceFound).toHaveBeenCalledTimes(2);
  });

  it('filters out unavailable strategies and survives strategy errors', async () => {
    const dev = makeMockDevice({ id: 'tv-ok' });

    const availableStrategy: IDiscoveryStrategy = {
      id: 'available',
      isAvailable: () => true,
      discover: async () => [dev],
    };

    const unavailableStrategy: IDiscoveryStrategy = {
      id: 'unavailable',
      isAvailable: () => false,
      discover: jest.fn(),
    };

    const failingStrategy: IDiscoveryStrategy = {
      id: 'failing',
      isAvailable: () => true,
      discover: async () => {
        throw new Error('Network interface error');
      },
    };

    const service = new TVDiscoveryService({
      strategies: [availableStrategy, unavailableStrategy, failingStrategy],
    });

    const result = await service.discover();
    expect(result).toEqual([dev]);
    expect(unavailableStrategy.discover).not.toHaveBeenCalled();
  });

  it('delegates manual IP probe to manual strategy', async () => {
    const manualStrategy = new ManualIPDiscoveryStrategy({
      prober: async () => true,
    });
    const service = new TVDiscoveryService({ manualStrategy });

    const dev = await service.probeManualIP('192.168.1.120');
    expect(dev.ipAddress).toBe('192.168.1.120');
  });

  it('throws TVDiscoveryError with unsupported_transport when all configured strategies are unavailable', async () => {
    const unavailableStrategy: IDiscoveryStrategy = {
      id: 'ssdp-unavailable',
      isAvailable: () => false,
      discover: jest.fn(),
    };

    const service = new TVDiscoveryService({
      strategies: [unavailableStrategy],
    });

    await expect(service.discover()).rejects.toMatchObject({
      code: 'unsupported_transport',
      message: expect.stringContaining('Automatic SSDP discovery is unavailable'),
    });
    expect(unavailableStrategy.discover).not.toHaveBeenCalled();
  });

  it('propagates the strategy error when all available strategies encounter failures', async () => {
    const failingStrategy: IDiscoveryStrategy = {
      id: 'failing',
      isAvailable: () => true,
      discover: async () => {
        throw new Error('Local network prohibited / permission denied');
      },
    };

    const service = new TVDiscoveryService({
      strategies: [failingStrategy],
    });

    await expect(service.discover()).rejects.toThrow('Local network prohibited / permission denied');
  });
});
