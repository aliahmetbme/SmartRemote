import { NativeEventEmitter } from 'react-native';
import { CoreMotionSensorService } from '../../../infrastructure/sensors/CoreMotionSensorService';
import { DeviceMotionSample } from '../../../domain/interfaces/IMotionSensorService';

describe('CoreMotionSensorService', () => {
  it('reports unavailable when native module is null', async () => {
    const service = new CoreMotionSensorService();
    // In node/jest environment, NativeModules.MotionSensorModule is undefined unless mocked
    const isAvail = await service.isAvailable();
    expect(isAvail).toBe(false);
    expect(service.isTracking()).toBe(false);
  });

  it('reports unavailable when native module throws or returns false', async () => {
    const mockNative = {
      isAvailable: jest.fn().mockRejectedValue(new Error('unavailable')),
      startMotionUpdates: jest.fn().mockResolvedValue(undefined),
      stopMotionUpdates: jest.fn().mockResolvedValue(undefined),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };

    const service = new CoreMotionSensorService(mockNative);
    const available = await service.isAvailable();
    expect(available).toBe(false);
  });

  it('starts and stops motion tracking with listeners', async () => {
    const mockNative = {
      isAvailable: jest.fn().mockResolvedValue(true),
      startMotionUpdates: jest.fn().mockResolvedValue(undefined),
      stopMotionUpdates: jest.fn().mockResolvedValue(undefined),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    const mockEmitter = new NativeEventEmitter(mockNative as any);

    const service = new CoreMotionSensorService(mockNative, mockEmitter);
    expect(await service.isAvailable()).toBe(true);

    const onSample = jest.fn();
    await service.start(25, onSample);

    expect(service.isTracking()).toBe(true);
    expect(mockNative.startMotionUpdates).toHaveBeenCalledWith(25);

    // Simulate native event emit
    const sample: DeviceMotionSample = {
      attitude: { pitch: 0.1, roll: 0.05, yaw: -0.2 },
      rotationRate: { x: 0.01, y: 0.02, z: 0.03 },
      timestamp: 1000,
    };

    mockEmitter.emit('onDeviceMotion', sample);
    expect(onSample).toHaveBeenCalledWith(sample);

    // Stop tracking
    await service.stop();
    expect(service.isTracking()).toBe(false);
    expect(mockNative.stopMotionUpdates).toHaveBeenCalled();
  });

  it('throws error when starting without native module', async () => {
    const service = new CoreMotionSensorService();
    await expect(service.start(25, jest.fn())).rejects.toThrow();
  });
});
