import { createContainer } from '../../di/container';
import { makeMockDevice } from '../../testing/fixtures';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { InMemoryKeyValueStorage } from '../../infrastructure/storage/InMemoryKeyValueStorage';
import { LocalTVDeviceRepository } from '../../infrastructure/repositories/LocalTVDeviceRepository';
import { tvActions } from '../../store/slices/tvSlice';
import { selectSelectedDevice } from '../../store/selectors';

describe('Phase 10: State Ownership, Single Hydration & Persistence Integration', () => {
  it('fires onHydrated before network restoration completes, keeping saved TV visible while offline', async () => {
    const storage = new InMemoryKeyValueStorage();
    const repo = new LocalTVDeviceRepository(storage);
    const savedTv = makeMockDevice({
      id: 'saved-tv-1',
      name: 'Living Room OLED',
      ipAddress: '192.168.1.50',
      macAddress: 'AA:BB:CC:DD:EE:11',
    });
    await repo.save(savedTv);
    await repo.setLastSelectedId('saved-tv-1');

    let resolveAdapterConnect: () => void = () => {};
    const delayedAdapter = new MockTVAdapter();
    jest.spyOn(delayedAdapter, 'connect').mockImplementation(
      () =>
        new Promise(resolve => {
          resolveAdapterConnect = () => resolve(undefined);
        }),
    );

    const container = createContainer({
      deviceRepository: repo,
      keyValueStorage: storage,
      adapterFactory: {
        supports: () => true,
        create: () => delayedAdapter,
      },
    });

    let hydratedCalled = false;
    let networkRestorationFinished = false;

    // Start single authoritative startup workflow
    const startupPromise = container.useCases.startupRestoration
      .execute({
        onHydrated: ({ savedDevices, selectedDeviceId }) => {
          hydratedCalled = true;
          // Verify network connection is still in-flight
          expect(networkRestorationFinished).toBe(false);
          expect(savedDevices).toHaveLength(1);
          expect(selectedDeviceId).toBe('saved-tv-1');

          // Render into store immediately
          container.store.dispatch(tvActions.savedDevicesLoaded(savedDevices));
          container.store.dispatch(tvActions.deviceSelected(selectedDeviceId));
        },
      })
      .then(res => {
        networkRestorationFinished = true;
        return res;
      });

    // Wait until onHydrated runs upon storage resolution
    while (!hydratedCalled) {
      await new Promise(r => setTimeout(() => r(undefined), 5));
    }
    expect(hydratedCalled).toBe(true);

    // Verify Redux state displays saved TV immediately
    const state = container.store.getState();
    expect(state.tv.savedDevices).toHaveLength(1);
    expect(state.tv.selectedDeviceId).toBe('saved-tv-1');
    const selected = selectSelectedDevice(state);
    expect(selected?.id).toBe('saved-tv-1');
    expect(selected?.name).toBe('Living Room OLED');

    // Complete the delayed network connection
    resolveAdapterConnect();
    const result = await startupPromise;
    expect(result.restoredDevice?.id).toBe('saved-tv-1');
    expect(networkRestorationFinished).toBe(true);
  });

  it('keeps saved TV visible and selected when TV is powered off during application launch', async () => {
    const storage = new InMemoryKeyValueStorage();
    const repo = new LocalTVDeviceRepository(storage);
    const offlineTv = makeMockDevice({
      id: 'offline-tv',
      name: 'Bedroom TV',
      macAddress: '11:22:33:44:55:66',
    });
    await repo.save(offlineTv);
    await repo.setLastSelectedId('offline-tv');

    const failingAdapter = new MockTVAdapter({
      connectError: new Error('TV is offline or in standby'),
    });

    const container = createContainer({
      deviceRepository: repo,
      keyValueStorage: storage,
      adapterFactory: {
        supports: () => true,
        create: () => failingAdapter,
      },
    });

    const result = await container.useCases.startupRestoration.execute({
      onHydrated: ({ savedDevices, selectedDeviceId }) => {
        container.store.dispatch(tvActions.savedDevicesLoaded(savedDevices));
        if (selectedDeviceId) {
          container.store.dispatch(tvActions.deviceSelected(selectedDeviceId));
        }
      },
    });

    // TV failed to restore over network
    expect(result.restoredDevice).toBeNull();
    expect(result.error?.message).toContain('TV is offline');

    // But TV remains fully visible and selected in Redux
    const state = container.store.getState();
    expect(state.tv.savedDevices).toHaveLength(1);
    expect(state.tv.selectedDeviceId).toBe('offline-tv');
    const active = selectSelectedDevice(state);
    expect(active?.id).toBe('offline-tv');
    expect(active?.name).toBe('Bedroom TV');
  });

  it('preserves user selected TV when changed while startup restoration was in-flight', async () => {
    const storage = new InMemoryKeyValueStorage();
    const repo = new LocalTVDeviceRepository(storage);
    const tv1 = makeMockDevice({ id: 'tv-1', name: 'TV 1' });
    const tv2 = makeMockDevice({ id: 'tv-2', name: 'TV 2' });
    await repo.save(tv1);
    await repo.save(tv2);
    await repo.setLastSelectedId('tv-1');

    let resolveConnectTv1!: () => void;
    const adapterInstance = new MockTVAdapter();
    jest.spyOn(adapterInstance, 'connect').mockImplementation(() => {
      return new Promise(resolve => {
        resolveConnectTv1 = () => resolve(undefined);
      });
    });

    const container = createContainer({
      deviceRepository: repo,
      keyValueStorage: storage,
      adapterFactory: {
        supports: () => true,
        create: () => adapterInstance,
      },
    });

    // Start startup restoration
    const startupPromise = container.useCases.startupRestoration.execute({
      onHydrated: ({ savedDevices, selectedDeviceId }) => {
        container.store.dispatch(tvActions.savedDevicesLoaded(savedDevices));
        if (selectedDeviceId) {
          container.store.dispatch(tvActions.deviceSelected(selectedDeviceId));
        }
      },
    });

    // Wait until connect starts
    while (!resolveConnectTv1) {
      await new Promise(r => setTimeout(() => r(undefined), 5));
    }

    // User switches to TV 2 while restoration is pending
    container.store.dispatch(tvActions.deviceSelected('tv-2'));

    // Network restoration completes for TV 1
    resolveConnectTv1();
    await startupPromise;

    // Redux selector must still reflect user-chosen TV 2
    expect(container.store.getState().tv.selectedDeviceId).toBe('tv-2');
  });

  it('persists automatically discovered MAC address and survives application restart', async () => {
    const storage = new InMemoryKeyValueStorage();
    const repo = new LocalTVDeviceRepository(storage);

    // Initial TV without MAC
    const tvNoMac = makeMockDevice({
      id: 'tv-auto-mac',
      name: 'LG webOS TV',
      ipAddress: '192.168.1.100',
      macAddress: undefined,
    });
    await repo.save(tvNoMac);

    const mockAdapter = new MockTVAdapter();
    (mockAdapter as any).getDiscoveredMac = () => '00:E0:4C:68:01:22';

    const container1 = createContainer({
      deviceRepository: repo,
      keyValueStorage: storage,
      adapterFactory: {
        supports: () => true,
        create: () => mockAdapter,
      },
    });

    // Connect to the TV
    await container1.useCases.connectTV.execute(tvNoMac);

    // Verify discovered MAC was persisted
    const savedInRepo = await repo.getById('tv-auto-mac');
    expect(savedInRepo?.macAddress).toBe('00:E0:4C:68:01:22');

    // Simulate app cold restart with fresh container sharing the same storage
    const container2 = createContainer({
      deviceRepository: new LocalTVDeviceRepository(storage),
      keyValueStorage: storage,
      adapterFactory: {
        supports: () => true,
        create: () => new MockTVAdapter(),
      },
    });

    const hydration = await container2.useCases.hydrateDevices.execute();
    const reloadedTv = hydration.savedDevices.find(d => d.id === 'tv-auto-mac');
    expect(reloadedTv?.macAddress).toBe('00:E0:4C:68:01:22');
  });

  it('preserves manually edited MAC address during automatic reconnect', async () => {
    const storage = new InMemoryKeyValueStorage();
    const repo = new LocalTVDeviceRepository(storage);

    const tv = makeMockDevice({
      id: 'tv-manual-mac',
      name: 'LG OLED',
      macAddress: undefined,
    });
    await repo.save(tv);

    const mockAdapter = new MockTVAdapter();
    const container = createContainer({
      deviceRepository: repo,
      keyValueStorage: storage,
      adapterFactory: {
        supports: () => true,
        create: () => mockAdapter,
      },
    });

    // User manually enters MAC address in settings
    await container.useCases.updateTVMac.execute('tv-manual-mac', 'AA:BB:CC:DD:EE:99');

    // Adapter reconnects with an initial device representation that had no MAC
    await container.connectionManager.connect(tv);

    // Verify manually entered MAC was NOT overwritten
    const persisted = await repo.getById('tv-manual-mac');
    expect(persisted?.macAddress).toBe('AA:BB:CC:DD:EE:99');
  });

  it('supports Power On via Wake-on-LAN while connecting or reconnecting', async () => {
    const tv = makeMockDevice({
      id: 'wol-tv',
      macAddress: 'AA:BB:CC:11:22:33',
    });

    let sendWakePacketCount = 0;
    let wakeSent = false;
    const mockWakeService = {
      isSupported: jest.fn().mockResolvedValue(true),
      wake: jest.fn().mockImplementation(async () => {
        sendWakePacketCount++;
        wakeSent = true;
        return { success: true, packetCount: 1, destinations: ['255.255.255.255:9'] };
      }),
    };

    const delayedAdapter = new MockTVAdapter();
    jest.spyOn(delayedAdapter, 'connect').mockImplementation(async () => {
      while (!wakeSent) {
        await new Promise(r => setTimeout(() => r(undefined), 10));
      }
      return;
    });

    const container = createContainer({
      wakeService: mockWakeService,
      adapterFactory: {
        supports: () => true,
        create: () => delayedAdapter,
      },
    });

    // Start connecting (hangs)
    container.connectionManager.connect(tv).catch(() => {});
    while (container.connectionManager.getState() !== TVConnectionState.Connecting) {
      await new Promise(r => setTimeout(() => r(undefined), 5));
    }
    expect(container.connectionManager.getState()).toBe(TVConnectionState.Connecting);

    // User presses Power while Connecting: initiates WoL
    const wakePromise = container.useCases.powerTV.execute(tv, {
      wakeTimeoutMs: 50,
      probeIntervalMs: 20,
      initialBootDelayMs: 0,
    });

    const result = await wakePromise;
    expect(result.action).toBe('wake');
    expect(sendWakePacketCount).toBe(1);
    expect(mockWakeService.wake).toHaveBeenCalledWith(
      'AA:BB:CC:11:22:33',
      expect.anything(),
    );
  });

  it('handles Power Off when connected followed by Power On when disconnected', async () => {
    const tv = makeMockDevice({
      id: 'pwr-tv',
      macAddress: 'FF:EE:DD:CC:BB:AA',
    });

    const mockAdapter = new MockTVAdapter();
    const powerOffSpy = jest.spyOn(mockAdapter, 'powerOff').mockResolvedValue();

    const mockWakeService = {
      isSupported: jest.fn().mockResolvedValue(true),
      wake: jest.fn().mockResolvedValue({
        success: true,
        packetCount: 1,
        destinations: ['255.255.255.255:9'],
      }),
    };

    const container = createContainer({
      wakeService: mockWakeService,
      adapterFactory: {
        supports: () => true,
        create: () => mockAdapter,
      },
    });

    // Connect to TV
    await container.connectionManager.connect(tv);
    expect(container.connectionManager.getState()).toBe(TVConnectionState.Connected);

    // 1. Power Off when Connected
    const powerOffResult = await container.useCases.powerTV.execute(tv, { isConnected: true });
    expect(powerOffResult.action).toBe('powerOff');
    expect(powerOffSpy).toHaveBeenCalled();

    // Disconnect connection
    await container.connectionManager.disconnect();
    expect(container.connectionManager.getState()).toBe(TVConnectionState.Disconnected);

    // 2. Power On when Disconnected (Wake-on-LAN)
    const powerOnResult = await container.useCases.powerTV.execute(tv, {
      isConnected: false,
      wakeTimeoutMs: 50,
      probeIntervalMs: 20,
      initialBootDelayMs: 0,
    });
    expect(powerOnResult.action).toBe('wake');
    expect(mockWakeService.wake).toHaveBeenCalledWith('FF:EE:DD:CC:BB:AA', expect.anything());
  });

  it('tears down previous TV session when switching to a different TV', async () => {
    const tv1 = makeMockDevice({ id: 'tv-1', name: 'TV 1' });
    const tv2 = makeMockDevice({ id: 'tv-2', name: 'TV 2' });

    const adapter1 = new MockTVAdapter();
    const adapter2 = new MockTVAdapter();
    const disconnectSpy1 = jest.spyOn(adapter1, 'disconnect');

    const container = createContainer({
      adapterFactory: {
        supports: () => true,
        create: device => (device.id === 'tv-1' ? adapter1 : adapter2),
      },
    });

    // Connect to TV 1
    await container.connectionManager.connect(tv1);
    expect(container.connectionManager.getDevice()?.id).toBe('tv-1');

    // Switch to TV 2
    await container.connectionManager.connect(tv2);

    // TV 1 was cleanly disconnected
    expect(disconnectSpy1).toHaveBeenCalled();
    expect(container.connectionManager.getDevice()?.id).toBe('tv-2');
  });

  it('handles rapid foreground/background AppState cycles idempotently', async () => {
    const tv = makeMockDevice({ id: 'tv-liveness' });
    const adapter = new MockTVAdapter();
    adapter.checkLiveness = jest.fn().mockResolvedValue(true);

    const container = createContainer({
      adapterFactory: {
        supports: () => true,
        create: () => adapter,
      },
    });

    await container.connectionManager.connect(tv);

    // Rapid background -> foreground -> background -> foreground
    await Promise.all([
      container.connectionManager.handleAppBackground(),
      container.connectionManager.handleAppForeground(),
      container.connectionManager.handleAppBackground(),
      container.connectionManager.handleAppForeground(),
    ]);

    expect(container.connectionManager.getState()).toBe(TVConnectionState.Connected);
  });
});
