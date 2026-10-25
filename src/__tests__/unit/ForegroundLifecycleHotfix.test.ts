import { UNKNOWN_CAPABILITIES } from '../../domain/entities/TVCapabilities';
import { TVDevice } from '../../domain/entities/TVDevice';
import { PairingStatus } from '../../domain/enums/PairingStatus';
import { TVBrand } from '../../domain/enums/TVBrand';
import { TVPlatform } from '../../domain/enums/TVPlatform';
import { TVProtocol } from '../../domain/enums/TVProtocol';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { TVConnectionError } from '../../domain/errors/TVConnectionError';
import { ITVDeviceRepository } from '../../domain/interfaces/ITVDeviceRepository';
import { RestoreLastTVUseCase } from '../../application/usecases/RestoreLastTVUseCase';
import { StartupRestorationUseCase } from '../../application/usecases/StartupRestorationUseCase';
import { TVConnectionManager } from '../../application/services/TVConnectionManager';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';

describe('Foreground Lifecycle & App Restart Connection Hotfix Suite', () => {
  const testDevice: TVDevice = {
    id: 'lg-oled-55c3',
    name: 'LG OLED55C3',
    ipAddress: '192.168.1.105',
    brand: TVBrand.LG,
    platform: TVPlatform.WebOS,
    protocol: TVProtocol.LGWebOSSSAP,
    capabilities: UNKNOWN_CAPABILITIES,
    pairingStatus: PairingStatus.Paired,
  };

  const createMockRepo = (devices: TVDevice[] = [], lastSelectedId: string | null = null): ITVDeviceRepository => ({
    getAll: jest.fn().mockResolvedValue(devices),
    getById: jest.fn().mockImplementation(async (id: string) => devices.find(d => d.id === id) ?? null),
    save: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    getLastSelectedId: jest.fn().mockResolvedValue(lastSelectedId),
    setLastSelectedId: jest.fn().mockResolvedValue(undefined),
  });

  it('Healthy foreground return: preserves Connected state, resumes heartbeat and does not reconnect', async () => {
    let adapterCount = 0;
    let currentAdapter: MockTVAdapter | null = null;

    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => {
        adapterCount++;
        currentAdapter = new MockTVAdapter();
        return currentAdapter;
      },
    });

    await manager.connect(testDevice);
    expect(manager.getState()).toBe(TVConnectionState.Connected);
    expect(adapterCount).toBe(1);
    expect(currentAdapter!.heartbeatPaused).toBe(false);

    // App moves to background
    manager.handleAppBackground();
    expect(currentAdapter!.heartbeatPaused).toBe(true);

    // Returning to foreground with a healthy socket
    currentAdapter!.checkLivenessResult = true;
    await manager.handleAppForeground();

    // Heartbeat resumed, still connected, no duplicate adapter created
    expect(currentAdapter!.heartbeatPaused).toBe(false);
    expect(manager.getState()).toBe(TVConnectionState.Connected);
    expect(adapterCount).toBe(1);

    await manager.disconnect();
  });

  it('Failed foreground liveness: transitions from Connected to Reconnecting and initiates exactly one reconnect', async () => {
    let adapterCount = 0;
    const adapters: MockTVAdapter[] = [];

    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => {
        adapterCount++;
        const adapter = new MockTVAdapter();
        adapters.push(adapter);
        return adapter;
      },
    });

    await manager.connect(testDevice);
    expect(manager.getState()).toBe(TVConnectionState.Connected);
    expect(adapterCount).toBe(1);

    // App moves to background
    manager.handleAppBackground();

    // The socket died / suspended while in background, so liveness check fails
    adapters[0].checkLivenessResult = false;

    // App returns to foreground
    await manager.handleAppForeground();

    // Recovery occurred: fresh adapter created, session back to Connected
    expect(manager.getState()).toBe(TVConnectionState.Connected);
    expect(adapterCount).toBe(2);

    await manager.disconnect();
  });

  it('Foreground during pending reconnect does not spawn duplicate attempts', async () => {
    let adapterCount = 0;
    let gateResolve: () => void = () => undefined;
    const connectGate = new Promise<void>(resolve => {
      gateResolve = resolve;
    });

    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => {
        adapterCount++;
        if (adapterCount === 2) {
          // Second adapter waits on connectGate
          return new MockTVAdapter({ connectGate });
        }
        return new MockTVAdapter();
      },
    });

    await manager.connect(testDevice);
    expect(manager.getState()).toBe(TVConnectionState.Connected);

    // Active socket drops
    const firstAdapter = manager.getReadyAdapter() as MockTVAdapter;
    firstAdapter.simulateConnectionLoss();
    expect(manager.getState()).toBe(TVConnectionState.Reconnecting);

    // Start manual reconnect which enters in-flight pending state
    const reconnectPromise = manager.reconnect();
    await new Promise(resolve => setTimeout(() => resolve(undefined), 0));
    expect(adapterCount).toBe(2);

    // While reconnect is pending in-flight, foreground event occurs
    await manager.handleAppForeground();

    // Still only 2 adapters created (no duplicate session created)
    expect(adapterCount).toBe(2);

    // Unblock the pending connection
    gateResolve();
    await reconnectPromise;

    expect(manager.getState()).toBe(TVConnectionState.Connected);
    await manager.disconnect();
  });

  it('Rapid AppState transitions do not cause reconnect storms or crash state machine', async () => {
    let adapterCount = 0;
    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => {
        adapterCount++;
        return new MockTVAdapter();
      },
    });

    await manager.connect(testDevice);
    expect(manager.getState()).toBe(TVConnectionState.Connected);

    // Fire rapid interleaved AppState events
    manager.handleAppBackground();
    const fg1 = manager.handleAppForeground();
    manager.handleAppBackground();
    const fg2 = manager.handleAppForeground();

    await Promise.all([fg1, fg2]);

    expect(manager.getState()).toBe(TVConnectionState.Connected);
    expect(adapterCount).toBe(1);

    await manager.disconnect();
  });

  it('Cold start with saved TV restores connection directly', async () => {
    const repo = createMockRepo([testDevice], testDevice.id);
    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => new MockTVAdapter(),
    });
    const restoreLastTV = new RestoreLastTVUseCase(manager, repo);
    const startup = new StartupRestorationUseCase(repo, restoreLastTV);

    const result = await startup.execute();

    expect(result.savedDevices).toHaveLength(1);
    expect(result.restoredDevice?.id).toBe(testDevice.id);
    expect(result.error).toBeUndefined();
    expect(manager.getState()).toBe(TVConnectionState.Connected);

    await manager.disconnect();
  });

  it('Cold start with TV offline retains targeted TV and restores upon subsequent foreground', async () => {
    let shouldFail = true;
    const repo = createMockRepo([testDevice], testDevice.id);

    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => {
        if (shouldFail) {
          return new MockTVAdapter({
            connectError: new TVConnectionError('TV unreachable', 'connection_failed'),
          });
        }
        return new MockTVAdapter();
      },
    });

    const restoreLastTV = new RestoreLastTVUseCase(manager, repo);
    const startup = new StartupRestorationUseCase(repo, restoreLastTV);

    // Cold start with TV offline
    const result = await startup.execute();
    expect(result.error).toBeDefined();
    expect(manager.getState()).toBe(TVConnectionState.Error);
    // Crucially: targeted device is retained!
    expect(manager.getDevice()?.id).toBe(testDevice.id);

    // Later: TV is powered on and app is brought to foreground
    shouldFail = false;
    await manager.handleAppForeground();

    expect(manager.getState()).toBe(TVConnectionState.Connected);
    expect(manager.getDevice()?.id).toBe(testDevice.id);

    await manager.disconnect();
  });

  it('Startup restoration overlapping foreground event does not duplicate connections', async () => {
    let adapterCount = 0;
    let gateResolve: () => void = () => undefined;
    const connectGate = new Promise<void>(resolve => {
      gateResolve = resolve;
    });

    const repo = createMockRepo([testDevice], testDevice.id);
    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => {
        adapterCount++;
        return new MockTVAdapter({ connectGate });
      },
    });

    const restoreLastTV = new RestoreLastTVUseCase(manager, repo);
    const startup = new StartupRestorationUseCase(repo, restoreLastTV);

    // Startup restoration begins and hangs waiting on connectGate
    const startupPromise = startup.execute();
    await new Promise(resolve => setTimeout(() => resolve(undefined), 0));
    expect(adapterCount).toBe(1);

    // Foreground event arrives concurrently while startup restoration is in-flight
    await manager.handleAppForeground();

    // No duplicate adapter created
    expect(adapterCount).toBe(1);

    // Let the startup connection complete
    gateResolve();
    const result = await startupPromise;

    expect(result.restoredDevice?.id).toBe(testDevice.id);
    expect(manager.getState()).toBe(TVConnectionState.Connected);

    await manager.disconnect();
  });

  it('Explicit disconnect does not automatically reconnect on foreground', async () => {
    let adapterCount = 0;
    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => {
        adapterCount++;
        return new MockTVAdapter();
      },
    });

    await manager.connect(testDevice);
    expect(manager.getState()).toBe(TVConnectionState.Connected);
    expect(adapterCount).toBe(1);

    // User explicitly disconnects
    await manager.disconnect();
    expect(manager.getState()).toBe(TVConnectionState.Disconnected);

    // App moves to background and foreground
    manager.handleAppBackground();
    await manager.handleAppForeground();

    // Must remain Disconnected and NOT reconnect
    expect(manager.getState()).toBe(TVConnectionState.Disconnected);
    expect(adapterCount).toBe(1);
  });

  it('No duplicate connection listeners or sockets across repeated lifecycle cycles', async () => {
    const states: TVConnectionState[] = [];
    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => new MockTVAdapter(),
    });

    const unsubscribe = manager.subscribe(snapshot => {
      states.push(snapshot.state);
    });

    await manager.connect(testDevice);
    manager.handleAppBackground();
    await manager.handleAppForeground();
    manager.handleAppBackground();
    await manager.handleAppForeground();

    // Connected -> Disconnected on cleanup
    await manager.disconnect();
    unsubscribe();

    // Verify clean sequence without duplicate duplicate events
    expect(states[0]).toBe(TVConnectionState.Connecting);
    expect(states[1]).toBe(TVConnectionState.Connected);
    expect(states[states.length - 1]).toBe(TVConnectionState.Disconnected);
  });

  it('Stale asynchronous teardown cannot overwrite a newer Connected state', async () => {
    let teardownGateResolve: () => void = () => undefined;
    const teardownGate = new Promise<void>(resolve => {
      teardownGateResolve = resolve;
    });

    let adapterCreated = 0;
    const slowTeardownAdapter = new MockTVAdapter();
    const originalDisconnect = slowTeardownAdapter.disconnect.bind(slowTeardownAdapter);
    slowTeardownAdapter.disconnect = async () => {
      await teardownGate;
      return originalDisconnect();
    };

    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => {
        adapterCreated++;
        if (adapterCreated === 1) {
          return slowTeardownAdapter;
        }
        return new MockTVAdapter();
      },
    });

    await manager.connect(testDevice);
    expect(manager.getState()).toBe(TVConnectionState.Connected);

    // Adapter loses connection, moves to Reconnecting
    slowTeardownAdapter.simulateConnectionLoss();
    expect(manager.getState()).toBe(TVConnectionState.Reconnecting);

    // App background initiates teardown on the slow adapter
    manager.handleAppBackground();

    // User immediately foregrounds and reconnect succeeds with new adapter
    const reconnectPromise = manager.reconnect();
    await reconnectPromise;
    expect(manager.getState()).toBe(TVConnectionState.Connected);

    // Now the background teardown finally finishes
    teardownGateResolve();
    await new Promise(resolve => setTimeout(() => resolve(undefined), 10));

    // Must still be Connected (generation check protected state from being overwritten to Disconnected)
    expect(manager.getState()).toBe(TVConnectionState.Connected);

    await manager.disconnect();
  });

  it('Connection lost while backgrounded transitions to Disconnected without background retries and reconnects cleanly on foreground', async () => {
    let adapterCount = 0;
    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => {
        adapterCount++;
        return new MockTVAdapter();
      },
    });

    await manager.connect(testDevice);
    expect(manager.getState()).toBe(TVConnectionState.Connected);
    expect(adapterCount).toBe(1);

    // App moves to background
    manager.handleAppBackground();

    // Socket drops while in background
    const adapter = manager.getReadyAdapter() as MockTVAdapter;
    adapter.simulateConnectionLoss();

    // While backgrounded, it transitioned to Disconnected rather than running retry loops
    expect(manager.getState()).toBe(TVConnectionState.Disconnected);

    // App returns to foreground
    await manager.handleAppForeground();

    // Immediately recovered with fresh session
    expect(manager.getState()).toBe(TVConnectionState.Connected);
    expect(adapterCount).toBe(2);

    await manager.disconnect();
  });
});
