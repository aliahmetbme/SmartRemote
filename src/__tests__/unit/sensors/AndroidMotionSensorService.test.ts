import { AndroidMotionSensorService } from '../../../infrastructure/sensors/AndroidMotionSensorService';

function setup() {
  const listeners = new Map<string, (...args: unknown[]) => unknown>();
  const native = {
    isAvailable: jest.fn().mockResolvedValue(true),
    startMotionUpdates: jest.fn().mockResolvedValue(undefined),
    stopMotionUpdates: jest.fn().mockResolvedValue(undefined),
  };
  const emitter = {
    addListener: (name: string, listener: (...args: unknown[]) => unknown) => {
      listeners.set(name, listener);
      return { remove: () => { listeners.delete(name); } };
    },
  };
  return { native, listeners, service: new AndroidMotionSensorService(native, emitter) };
}

const sample = {
  timestamp: 12.016,
  attitude: { pitch: 0.6, roll: 0, yaw: 0.3 },
  rotationRate: { x: -0.5, y: -0.4, z: 0 },
  gravity: { x: 0, y: -0.6, z: -0.8 },
};

describe('AndroidMotionSensorService', () => {
  it('reports missing and unsupported sensors without inventing capability', async () => {
    const absent = new AndroidMotionSensorService(null);
    await expect(absent.isAvailable()).resolves.toBe(false);
    await expect(absent.start(16, jest.fn())).rejects.toThrow('unavailable');
    const { native, service } = setup();
    native.isAvailable.mockResolvedValue(false);
    await expect(service.isAvailable()).resolves.toBe(false);
  });

  it('rejects invalid and out-of-order samples and stale session events', async () => {
    const { native, listeners, service } = setup();
    const deliver = jest.fn();
    await service.start(16, deliver);
    const sessionId = native.startMotionUpdates.mock.calls[0][1];
    const event = listeners.get('onAndroidDeviceMotion')!;
    event({ ...sample, sessionId });
    event({ ...sample, sessionId });
    event({ ...sample, timestamp: 12, sessionId });
    event({ ...sample, timestamp: 13, rotationRate: { x: NaN, y: 0, z: 0 }, sessionId });
    await service.start(20, deliver);
    event({ ...sample, timestamp: 14, sessionId });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining(sample));
    await service.stop();
    await service.stop();
    expect(native.stopMotionUpdates).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });

  it('cleans up failed registration and retries on the next hold', async () => {
    const { native, listeners, service } = setup();
    native.startMotionUpdates.mockRejectedValueOnce(new Error('registration failed'));
    await expect(service.start(16, jest.fn())).rejects.toThrow('registration failed');
    expect(listeners.size).toBe(0);
    expect(service.isTracking()).toBe(false);
    await service.start(16, jest.fn());
    expect(service.isTracking()).toBe(true);
    await service.stop();
  });

  it('stops during registration and rejects its late completion', async () => {
    const { native, listeners, service } = setup();
    let finish!: () => void;
    native.startMotionUpdates.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    const started = service.start(16, jest.fn());
    await service.stop();
    finish();
    await expect(started).rejects.toThrow('interrupted');
    expect(native.stopMotionUpdates).toHaveBeenCalledTimes(1);
    expect(service.isTracking()).toBe(false);
    expect(listeners.size).toBe(0);
  });

  it('clears sampling on native pause or rotation and notifies once', async () => {
    const { native, listeners, service } = setup();
    const interrupted = jest.fn();
    const unsubscribe = service.onInterrupted(interrupted);
    await service.start(16, jest.fn());
    const sessionId = native.startMotionUpdates.mock.calls[0][1];
    const event = listeners.get('onAndroidMotionInterrupted')!;
    event({ sessionId: sessionId - 1 });
    expect(service.isTracking()).toBe(true);
    event({ sessionId });
    event({ sessionId });
    expect(service.isTracking()).toBe(false);
    expect(interrupted).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
    unsubscribe();
  });
});
