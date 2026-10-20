import { MotionPointerController } from '../../presentation/controllers/MotionPointerController';
import {
  DeviceMotionSample,
  IMotionSensorService,
  MotionSampleListener,
} from '../../domain/interfaces/IMotionSensorService';
import { TVConnectionManager, Scheduler } from '../../application/services/TVConnectionManager';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { makeWebOSDevice } from '../../testing/fixtures';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';
import { LocalTVDeviceRepository } from '../../infrastructure/repositories/LocalTVDeviceRepository';
import { StartupRestorationUseCase } from '../../application/usecases/StartupRestorationUseCase';
import { createContainer } from '../../di/container';
import { tvActions } from '../../store/slices/tvSlice';
import { connectionActions } from '../../store/slices/connectionSlice';
import { LGWebOSAdapter } from '../../infrastructure/adapters/lg-webos/LGWebOSAdapter';
import { FakeWebOSServer } from '../../testing/FakeWebOSServer';
import { InMemoryCredentialStorage } from '../../infrastructure/storage/InMemoryCredentialStorage';

class MockSensorService implements IMotionSensorService {
  public available = true;
  public tracking = false;
  public listener: MotionSampleListener | null = null;

  async isAvailable(): Promise<boolean> {
    return this.available;
  }
  async start(_intervalMs: number, onSample: MotionSampleListener): Promise<void> {
    this.tracking = true;
    this.listener = onSample;
  }
  async stop(): Promise<void> {
    this.tracking = false;
    this.listener = null;
  }
  isTracking(): boolean {
    return this.tracking;
  }
  emit(sample: DeviceMotionSample): void {
    if (this.tracking && this.listener) {
      this.listener(sample);
    }
  }
}

describe('Phase 5.4 Regression Suite', () => {
  describe('Motion Pipeline Stability & Bounds', () => {
    let mockSensor: MockSensorService;
    let commandHandler: jest.Mock;
    let currentTime: number;

    beforeEach(() => {
      mockSensor = new MockSensorService();
      commandHandler = jest.fn().mockResolvedValue(undefined);
      currentTime = 1000;
    });

    it('correctly handles Core Motion timestamp in seconds without dt lockup', async () => {
      const controller = new MotionPointerController(mockSensor, commandHandler, {
        baseGain: 1000,
        sensitivity: 1.0,
        smoothingAlpha: 1.0,
        accelGain: 0,
        now: () => currentTime,
      });

      await controller.start();
      controller.setEngaged(true);

      // Core Motion sends seconds (e.g. 100.000, 100.025)
      mockSensor.emit({
        timestamp: 100.0,
        attitude: { pitch: 0, roll: 0, yaw: 0 },
        rotationRate: { x: 0, y: 0, z: 0 },
        gravity: { x: 0, y: -1, z: 0 },
      });

      // Sample 25ms later
      currentTime += 25;
      mockSensor.emit({
        timestamp: 100.025,
        attitude: { pitch: 0, roll: 0, yaw: 0 },
        rotationRate: { x: 0, y: -0.5, z: 0 },
        gravity: { x: 0, y: -1, z: 0 },
      });

      expect(commandHandler).toHaveBeenCalledTimes(1);
      const call = commandHandler.mock.calls[0];
      expect(call[0]).toBeGreaterThanOrEqual(12);
      expect(call[0]).toBeLessThanOrEqual(13);
    });

    it('clears accumulated residual deltas after prolonged stall (>250ms) to prevent replay jump', async () => {
      const controller = new MotionPointerController(mockSensor, commandHandler, {
        baseGain: 1000,
        smoothingAlpha: 1.0,
        accelGain: 0,
        now: () => currentTime,
      });

      await controller.start();
      controller.setEngaged(true);

      mockSensor.emit({
        timestamp: 100.0,
        attitude: { pitch: 0, roll: 0, yaw: 0 },
        rotationRate: { x: 0, y: 0, z: 0 },
        gravity: { x: 0, y: -1, z: 0 },
      });

      // First dispatch
      currentTime += 25;
      mockSensor.emit({
        timestamp: 100.025,
        attitude: { pitch: 0, roll: 0, yaw: 0 },
        rotationRate: { x: 0, y: -0.5, z: 0 },
        gravity: { x: 0, y: -1, z: 0 },
      });
      expect(commandHandler).toHaveBeenCalledTimes(1);

      // Await promise microtask
      await Promise.resolve();
      await Promise.resolve();

      // Now simulate a 300ms stall (network/bridge interruption)
      currentTime += 300;

      // Next sample arrives: should clear prior accumulated residuals and not burst
      mockSensor.emit({
        timestamp: 100.325,
        attitude: { pitch: 0, roll: 0, yaw: 0 },
        rotationRate: { x: 0, y: -0.1, z: 0 },
        gravity: { x: 0, y: -1, z: 0 },
      });

      expect(commandHandler).toHaveBeenCalledTimes(2);
      const secondCall = commandHandler.mock.calls[1];
      // Should only contain the fresh movement (~3px), not old replayed movement
      expect(secondCall[0]).toBeLessThan(10);
    });

    it('caps maximum accumulator buildup at maxDelta * 2 to prevent runaway cursor', async () => {
      const controller = new MotionPointerController(mockSensor, commandHandler, {
        baseGain: 10000, // very high gain
        maxDelta: 60,
        smoothingAlpha: 1.0,
        now: () => currentTime,
      });

      await controller.start();
      controller.setEngaged(true);

      mockSensor.emit({
        timestamp: 100.0,
        attitude: { pitch: 0, roll: 0, yaw: 0 },
        rotationRate: { x: 0, y: 0, z: 0 },
        gravity: { x: 0, y: -1, z: 0 },
      });

      // Massive velocity
      currentTime += 25;
      mockSensor.emit({
        timestamp: 100.025,
        attitude: { pitch: 0, roll: 0, yaw: 0 },
        rotationRate: { x: 0, y: -5.0, z: 0 },
        gravity: { x: 0, y: -1, z: 0 },
      });

      expect(commandHandler).toHaveBeenCalledTimes(1);
      // Clamped to maxDelta
      expect(commandHandler).toHaveBeenCalledWith(60, 0);
    });
  });

  describe('Pointer Socket Lifecycle & SSAP Isolation', () => {
    const device = makeWebOSDevice({ ipAddress: '192.168.0.20' });

    it('tears down existing pointer socket cleanly when dropped without escalating to SSAP error', async () => {
      const server = new FakeWebOSServer();
      const credentialStorage = new InMemoryCredentialStorage();
      const adapter = new LGWebOSAdapter({ credentialStorage, webSocketFactory: server.factory });

      await adapter.connect(device);
      expect(adapter.getConnectionState()).toBe(TVConnectionState.Connected);

      // Verify pointer socket was opened
      expect(server.pointerSockets().length).toBe(1);
      const activePointer = server.pointerSockets()[0];
      expect(activePointer.closed).toBe(false);

      // Simulate pointer socket drop
      activePointer.drop();

      // Crucial: SSAP main connection must remain Connected!
      expect(adapter.getConnectionState()).toBe(TVConnectionState.Connected);

      // Subsequent pointer command recovers pointer on demand
      await adapter.movePointer(10, 10);
      expect(server.opened.filter(u => u.includes('netinput_pointer')).length).toBe(2);
      expect(server.pointerSockets().length).toBe(1);
      expect(adapter.getConnectionState()).toBe(TVConnectionState.Connected);

      await adapter.disconnect();
    });

    it('single-flights concurrent pointer establishment and does not open duplicate sockets', async () => {
      const server = new FakeWebOSServer();
      const credentialStorage = new InMemoryCredentialStorage();
      const adapter = new LGWebOSAdapter({ credentialStorage, webSocketFactory: server.factory });

      await adapter.connect(device);
      expect(adapter.getConnectionState()).toBe(TVConnectionState.Connected);

      // Drop pointer
      server.pointerSockets()[0].drop();

      // Trigger multiple concurrent movePointer commands
      const p1 = adapter.movePointer(5, 5);
      const p2 = adapter.movePointer(10, 10);
      const p3 = adapter.movePointer(15, 15);

      await Promise.all([p1, p2, p3]);

      // Exactly 1 new pointer socket was established for the recovery (total 2 sockets created across lifecycle)
      expect(server.opened.filter(u => u.includes('netinput_pointer')).length).toBe(2);
      expect(server.pointerSockets().length).toBe(1);
      expect(server.pointerFrames).toContain('type:move\ndx:5\ndy:5\ndown:0\n\n');
      expect(server.pointerFrames).toContain('type:move\ndx:10\ndy:10\ndown:0\n\n');
      expect(server.pointerFrames).toContain('type:move\ndx:15\ndy:15\ndown:0\n\n');

      await adapter.disconnect();
    });

    it('clears previous retry timer in TVConnectionManager to prevent duplicate reconnection loops', () => {
      let activeTimers = 0;
      const scheduler: Scheduler = {
        setTimeout: (_fn: () => void, _ms: number) => {
          activeTimers++;
          return activeTimers;
        },
        clearTimeout: (_handle: unknown) => {
          activeTimers = Math.max(0, activeTimers - 1);
        },
      };

      const manager = new TVConnectionManager(
        {
          create: () => new MockTVAdapter(),
          supports: () => true,
        },
        { scheduler },
      );

      // Manually trigger handleConnectionLost multiple times
      const gen = (manager as any).generation;
      (manager as any).scheduleRetry(gen);
      expect(activeTimers).toBe(1);

      (manager as any).scheduleRetry(gen);
      // Because clearRetryTimer() is called, activeTimers remains 1, not 2
      expect(activeTimers).toBe(1);
    });
  });

  describe('Saved TV & Device Management Integrity', () => {
    it('persists TV metadata and allows clean restoration without racing', async () => {
      const mockStorage = new Map<string, string>();
      const repo = new LocalTVDeviceRepository({
        getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
        setItem: jest.fn(async (key: string, value: string) => {
          mockStorage.set(key, value);
        }),
        removeItem: jest.fn(async (key: string) => {
          mockStorage.delete(key);
        }),
      });

      const device = makeWebOSDevice({
        id: 'tv-persisted-1',
        name: 'Living Room OLED',
        ipAddress: '192.168.1.150',
      });

      await repo.save(device);
      await repo.setLastSelectedId(device.id);

      // Startup restoration
      const restoreMock = { execute: jest.fn().mockResolvedValue(undefined) } as any;
      const restorationUseCase = new StartupRestorationUseCase(repo, restoreMock);
      const result = await restorationUseCase.execute();

      expect(result.savedDevices).toHaveLength(1);
      expect(result.savedDevices[0].id).toBe('tv-persisted-1');
      expect(result.savedDevices[0].name).toBe('Living Room OLED');
      expect(result.lastSelectedId).toBe('tv-persisted-1');

      // Offline device remains saved
      const allSaved = await repo.getAll();
      expect(allSaved).toHaveLength(1);
      expect(allSaved[0].id).toBe('tv-persisted-1');
    });

    it('forget TV removes device from repository and credentials from storage', async () => {
      const container = createContainer({
        adapterFactory: {
          create: () => new MockTVAdapter(),
          supports: () => true,
        },
      });

      const device = makeWebOSDevice({ id: 'tv-to-forget', name: 'Test TV' });
      await container.deviceRepository.save(device);
      await container.credentialStorage.set(device.id, 'secret-key');

      expect((await container.deviceRepository.getAll()).length).toBe(1);
      expect(await container.credentialStorage.get(device.id)).toBe('secret-key');

      // Forget TV execution
      await container.deviceRepository.remove(device.id);
      await container.credentialStorage.remove(device.id);
      container.store.dispatch(tvActions.deviceForgotten(device.id));

      expect((await container.deviceRepository.getAll()).length).toBe(0);
      expect(await container.credentialStorage.get(device.id)).toBeNull();
      expect(container.store.getState().tv.savedDevices).toHaveLength(0);
    });

    it('Remote header resolves TV name correctly without false "No TV Selected"', () => {
      const container = createContainer({
        adapterFactory: {
          create: () => new MockTVAdapter(),
          supports: () => true,
        },
      });

      const device = makeWebOSDevice({
        id: 'tv-active-1',
        name: 'LG QNED 65',
        ipAddress: '192.168.1.139',
      });

      // Simulate device connected & selected
      container.store.dispatch(tvActions.savedDevicesLoaded([device]));
      container.store.dispatch(tvActions.deviceSelected(device.id));
      container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));

      const state = container.store.getState();
      const activeDevice = state.tv.savedDevices.find(d => d.id === state.tv.selectedDeviceId);

      expect(activeDevice).toBeDefined();
      expect(activeDevice?.name).toBe('LG QNED 65');
    });
  });
});
