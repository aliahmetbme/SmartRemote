import { MotionPointerController } from '../../../presentation/controllers/MotionPointerController';
import { DeviceMotionSample } from '../../../domain/interfaces/IMotionSensorService';

const sample = (yaw: number): DeviceMotionSample => ({
  attitude: { yaw, pitch: 0, roll: 0 }, timestamp: Date.now(),
  rotationRate: { x: 0, y: 0, z: 0 },
});
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

describe('Motion cadence and cancellation', () => {
  let controller: MotionPointerController;
  let send: jest.Mock;
  let resolve: () => void;
  let reject: (error: Error) => void;
  beforeEach(async () => {
    jest.useFakeTimers({ now: 1000 });
    send = jest.fn().mockImplementation(() => new Promise<void>((r, j) => { resolve = r; reject = j; }));
    const sensor = { isAvailable: async () => true, start: async () => {}, stop: async () => {}, isTracking: () => true };
    controller = new MotionPointerController(sensor, send, {
      baseGain: 1000, accelGain: 0, smoothingAlpha: 1, throttleMs: 25, maxDelta: 50,
      now: () => Date.now(),
    });
    await controller.start();
    controller.setEngaged(true);
    controller.handleMotionSample(sample(0));
    controller.handleMotionSample(sample(-0.01));
    controller.handleMotionSample(sample(-0.02));
  });
  afterEach(async () => { await controller.stop(); jest.useRealTimers(); });

  it('flushes residual at throttle expiry without another sample, once only', async () => {
    resolve(); await settle();
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(24); expect(send).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1); expect(send.mock.calls).toEqual([[10, 0], [10, 0]]);
    resolve(); await settle();
    expect(jest.getTimerCount()).toBe(0);
  });
  it('flushes immediately when completion is after throttle expiry', async () => {
    jest.advanceTimersByTime(40); resolve(); await settle();
    expect(send.mock.calls).toEqual([[10, 0], [10, 0]]);
  });
  it.each(['stop', 'release', 'recenter'])('cancels a pending flush on %s', async action => {
    resolve(); await settle();
    if (action === 'stop') await controller.stop();
    else if (action === 'release') controller.setEngaged(false);
    else controller.recenter();
    jest.advanceTimersByTime(2000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('does not overlap commands across release and reengagement', async () => {
    controller.setEngaged(false); controller.setEngaged(true);
    controller.handleMotionSample(sample(0)); controller.handleMotionSample(sample(-0.03));
    expect(send).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(25); resolve(); await settle();
    expect(send.mock.calls).toEqual([[10, 0], [30, 0]]);
  });
  it('rejects safely, clears backlog and observes cooldown', async () => {
    reject(new Error('closed')); await settle();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(30);
    controller.handleMotionSample(sample(-0.03));
    expect(send).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1500);
    expect(send).toHaveBeenCalledTimes(1); // old backlog expires rather than replaying
    controller.handleMotionSample(sample(-0.04));
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('reports controlled continuous cadence without duplicate dispatches', async () => {
    resolve(); await settle();
    jest.advanceTimersByTime(25); resolve(); await settle();
    for (let i = 3; i <= 42; i++) {
      jest.advanceTimersByTime(25);
      controller.handleMotionSample(sample(-i * 0.01));
      resolve(); await settle();
    }
    expect(send).toHaveBeenCalledTimes(42);
    expect(controller.getPerformanceSnapshot()).toMatchObject({
      dispatch: { meanMs: 25, p95Ms: 25, varianceMs2: 0 }, pendingTimers: 0,
      rejectedCommands: 0,
    });
  });
  it('discards stale backlog after slow transport without delayed bursts', async () => {
    jest.advanceTimersByTime(300); resolve(); await settle();
    expect(send).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
  });
  it('bounds rapid bursts and sends clamped residuals without zero packets', async () => {
    for (let i = 3; i < 100; i++) controller.handleMotionSample(sample(-i * 0.02));
    jest.advanceTimersByTime(25); resolve(); await settle();
    expect(send).toHaveBeenLastCalledWith(50, 0);
    jest.advanceTimersByTime(25); resolve(); await settle();
    expect(send).toHaveBeenLastCalledWith(50, 0);
    resolve(); await settle();
    expect(send).toHaveBeenCalledTimes(3); expect(jest.getTimerCount()).toBe(0);
  });
});
