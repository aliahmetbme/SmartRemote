import { makeMockDevice } from '../../testing/fixtures';
import { DiscoveryManager } from '../../application/services/DiscoveryManager';
import { DiscoverTVsUseCase } from '../../application/usecases/DiscoverTVsUseCase';
import { createContainer } from '../../di/container';
import { ITVDiscoveryService } from '../../domain/interfaces/ITVDiscoveryService';
import { createAppStore } from '../../store';
import {
  selectDiscoveredDevices,
  selectDiscoveryError,
  selectDiscoveryStatus,
} from '../../store/selectors';
import { TVDiscoveryError } from '../../domain/errors/TVDiscoveryError';

describe('DiscoveryManager and Redux Integration', () => {
  it('dispatches discoveryStarted, deviceDiscovered, and discoveryCompleted to Redux', async () => {
    const store = createAppStore();
    const dev1 = makeMockDevice({ id: 'tv-1', name: 'Dev 1' });
    const dev2 = makeMockDevice({ id: 'tv-2', name: 'Dev 2' });

    const discoveryService: ITVDiscoveryService = {
      discover: async options => {
        options?.onDeviceFound?.(dev1);
        options?.onDeviceFound?.(dev2);
        return [dev1, dev2];
      },
    };

    const useCase = new DiscoverTVsUseCase(discoveryService);
    const manager = new DiscoveryManager(useCase, store.dispatch);

    expect(selectDiscoveryStatus(store.getState())).toBe('idle');
    expect(selectDiscoveryError(store.getState())).toBeNull();

    const resultPromise = manager.startDiscovery();
    expect(manager.getIsScanning()).toBe(true);
    expect(selectDiscoveryStatus(store.getState())).toBe('scanning');

    const result = await resultPromise;
    expect(result).toHaveLength(2);
    expect(manager.getIsScanning()).toBe(false);
    expect(selectDiscoveryStatus(store.getState())).toBe('completed');
    expect(selectDiscoveryError(store.getState())).toBeNull();

    const discovered = selectDiscoveredDevices(store.getState());
    expect(discovered).toHaveLength(2);
    expect(discovered.map(d => d.id)).toEqual(['tv-1', 'tv-2']);
  });

  it('dispatches discoveryFailed on error with structured error info', async () => {
    const store = createAppStore();
    const failingService: ITVDiscoveryService = {
      discover: async () => {
        throw new TVDiscoveryError('UDP multicast transport unsupported', 'unsupported_transport');
      },
    };

    const useCase = new DiscoverTVsUseCase(failingService);
    const manager = new DiscoveryManager(useCase, store.dispatch);

    await expect(manager.startDiscovery()).rejects.toThrow('UDP multicast transport unsupported');
    expect(selectDiscoveryStatus(store.getState())).toBe('failed');
    expect(selectDiscoveryError(store.getState())).toEqual({
      code: 'unsupported_transport',
      message: 'UDP multicast transport unsupported',
    });
    expect(manager.getIsScanning()).toBe(false);
  });

  it('supports cancelling discovery in progress', async () => {
    const store = createAppStore();
    let aborted = false;

    const slowService: ITVDiscoveryService = {
      discover: async options => {
        return new Promise(resolve => {
          options?.signal?.addEventListener('abort', () => {
            aborted = true;
            resolve([]);
          });
        });
      },
    };

    const useCase = new DiscoverTVsUseCase(slowService);
    const manager = new DiscoveryManager(useCase, store.dispatch);

    const startPromise = manager.startDiscovery();
    expect(manager.getIsScanning()).toBe(true);

    manager.cancelDiscovery();
    await startPromise;

    expect(aborted).toBe(true);
    expect(manager.getIsScanning()).toBe(false);
    expect(selectDiscoveryStatus(store.getState())).toBe('completed');
  });

  it('end-to-end container exposes discoveryManager and startupRestoration use case', async () => {
    const dev = makeMockDevice({ id: 'container-tv' });
    const discoveryService: ITVDiscoveryService = {
      discover: async options => {
        options?.onDeviceFound?.(dev);
        return [dev];
      },
    };

    const container = createContainer({ discoveryService });
    expect(container.discoveryManager).toBeDefined();
    expect(container.useCases.discoverTVs).toBeDefined();
    expect(container.useCases.probeManualIP).toBeDefined();
    expect(container.useCases.startupRestoration).toBeDefined();

    const devices = await container.discoveryManager.startDiscovery();
    expect(devices).toHaveLength(1);
    expect(selectDiscoveredDevices(container.store.getState())[0].id).toBe('container-tv');
  });
});
