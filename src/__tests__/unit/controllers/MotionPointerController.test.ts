import {
  MotionPointerController,
  normalizeAngle,
} from '../../../presentation/controllers/MotionPointerController';
import {
  DeviceMotionSample,
  IMotionSensorService,
  MotionSampleListener,
} from '../../../domain/interfaces/IMotionSensorService';

class MockMotionSensorService implements IMotionSensorService {
  public available: boolean = true;
  public tracking: boolean = false;
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

describe('MotionPointerController', () => {
  let mockSensor: MockMotionSensorService;
  let commandHandler: jest.Mock;
  let controller: MotionPointerController;

  const makeSample = (yaw: number, pitch: number, roll: number = 0, timestamp: number = Date.now()): DeviceMotionSample => ({
    attitude: { yaw, pitch, roll },
    rotationRate: { x: 0, y: 0, z: 0 },
    timestamp,
  });

  beforeEach(() => {
    mockSensor = new MockMotionSensorService();
    commandHandler = jest.fn().mockResolvedValue(undefined);
    controller = new MotionPointerController(mockSensor, commandHandler, {
      baseGain: 1000,
      sensitivity: 1.0,
      deadZoneRadians: 0.05,
      accelGain: 0,
      smoothingAlpha: 1.0, // Disable smoothing for exact numeric checks
      maxDelta: 50,
      throttleMs: 0, // Disable throttle for unit step tests
    });
  });

  describe('Angle normalization', () => {
    it('normalizes angles within [-PI, PI]', () => {
      expect(normalizeAngle(0)).toBeCloseTo(0);
      expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI);
      expect(normalizeAngle(-Math.PI)).toBeCloseTo(-Math.PI);
      expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
      expect(normalizeAngle(-3 * Math.PI)).toBeCloseTo(-Math.PI);
    });
  });

  describe('Lifecycle & Availability', () => {
    it('returns false and does not start if sensor is unavailable', async () => {
      mockSensor.available = false;
      const started = await controller.start();
      expect(started).toBe(false);
      expect(controller.getIsRunning()).toBe(false);
      expect(mockSensor.isTracking()).toBe(false);
    });

    it('starts and stops sensor subscription cleanly', async () => {
      const started = await controller.start();
      expect(started).toBe(true);
      expect(controller.getIsRunning()).toBe(true);
      expect(mockSensor.isTracking()).toBe(true);

      await controller.stop();
      expect(controller.getIsRunning()).toBe(false);
      expect(mockSensor.isTracking()).toBe(false);
    });
  });

  describe('Motion Activation & Release (Hold-to-Move)', () => {
    beforeEach(async () => {
      await controller.start();
    });

    it('does not send commands when unengaged (hold button released)', () => {
      expect(controller.getIsEngaged()).toBe(false);

      // Samples arrive while unengaged
      mockSensor.emit(makeSample(0.1, 0.2));
      mockSensor.emit(makeSample(0.2, 0.3));

      expect(commandHandler).not.toHaveBeenCalled();
    });

    it('anchors reference orientation on first sample after engagement with 0 movement', () => {
      controller.setEngaged(true);
      expect(controller.getIsEngaged()).toBe(true);

      // First sample after engagement anchors reference
      mockSensor.emit(makeSample(0.5, 0.5));
      expect(commandHandler).not.toHaveBeenCalled();

      // Subsequent sample produces movement relative to baseline
      mockSensor.emit(makeSample(0.48, 0.5)); // yaw decrease by 0.02
      expect(commandHandler).toHaveBeenCalledTimes(1);
    });

    it('flushes buffers and stops sending movement when disengaged', () => {
      controller.setEngaged(true);
      mockSensor.emit(makeSample(0.0, 0.0));
      mockSensor.emit(makeSample(-0.02, 0.0)); // moves right
      expect(commandHandler).toHaveBeenCalledTimes(1);

      // Disengage
      controller.setEngaged(false);
      expect(controller.getIsEngaged()).toBe(false);

      // Samples after disengagement do not dispatch commands
      mockSensor.emit(makeSample(-0.05, 0.0));
      expect(commandHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Coordinate Mapping & Movement Direction', () => {
    beforeEach(async () => {
      await controller.start();
      controller.setEngaged(true);
    });

    it('maps yaw decrease (turning phone right) to positive deltaX (pointer right)', () => {
      mockSensor.emit(makeSample(0.0, 0.0));
      // Turning right: yaw decreases from 0.0 to -0.01 rad
      // deltaYaw = -0.01. rawDx = -(-0.01) * 1000 * 1.0 = +10
      mockSensor.emit(makeSample(-0.01, 0.0));

      expect(commandHandler).toHaveBeenCalledWith(10, 0);
    });

    it('maps yaw increase (turning phone left) to negative deltaX (pointer left)', () => {
      mockSensor.emit(makeSample(0.0, 0.0));
      // Turning left: yaw increases from 0.0 to +0.01 rad
      // deltaYaw = +0.01. rawDx = -(0.01) * 1000 * 1.0 = -10
      mockSensor.emit(makeSample(0.01, 0.0));

      expect(commandHandler).toHaveBeenCalledWith(-10, 0);
    });

    it('maps pitch decrease (tilting phone down) to positive deltaY (pointer down)', () => {
      mockSensor.emit(makeSample(0.0, 0.0));
      // Tilting down towards floor: pitch decreases from 0.0 to -0.01 rad
      // deltaPitch = -0.01. rawDy = -(-0.01) * 1000 * 1.0 = +10
      mockSensor.emit(makeSample(0.0, -0.01));

      expect(commandHandler).toHaveBeenCalledWith(0, 10);
    });

    it('maps pitch increase (tilting phone up) to negative deltaY (pointer up)', () => {
      mockSensor.emit(makeSample(0.0, 0.0));
      // Tilting up towards ceiling: pitch increases from 0.0 to +0.01 rad
      // deltaPitch = +0.01. rawDy = -(0.01) * 1000 * 1.0 = -10
      mockSensor.emit(makeSample(0.0, 0.01));

      expect(commandHandler).toHaveBeenCalledWith(0, -10);
    });

    it('inverts horizontal direction when invertX is true', () => {
      controller.setInvertX(true);
      expect(controller.isInvertedX()).toBe(true);

      mockSensor.emit(makeSample(0.0, 0.0));
      // Turning right normally gives +10; with invertX should give -10
      mockSensor.emit(makeSample(-0.01, 0.0));

      expect(commandHandler).toHaveBeenCalledWith(-10, 0);
    });

    it('inverts vertical direction when invertY is true', () => {
      controller.setInvertY(true);
      expect(controller.isInvertedY()).toBe(true);

      mockSensor.emit(makeSample(0.0, 0.0));
      // Tilting down normally gives +10; with invertY should give -10
      mockSensor.emit(makeSample(0.0, -0.01));

      expect(commandHandler).toHaveBeenCalledWith(0, -10);
    });
  });

  describe('Dead Zone & Tremor Filtering', () => {
    beforeEach(async () => {
      await controller.start();
      controller.setEngaged(true);
    });

    it('suppresses movements smaller than deadZoneRadians', () => {
      mockSensor.emit(makeSample(0.0, 0.0));
      // Movement of 0.001 rad is below deadZoneRadians (0.002 rad)
      mockSensor.emit(makeSample(0.001, 0.0005));

      expect(commandHandler).not.toHaveBeenCalled();
    });

    it('allows movements above deadZoneRadians', () => {
      mockSensor.emit(makeSample(0.0, 0.0));
      // Movement of 0.005 rad is above deadZoneRadians (0.002 rad)
      mockSensor.emit(makeSample(-0.005, 0.0));

      expect(commandHandler).toHaveBeenCalledWith(5, 0);
    });
  });

  describe('Sensitivity Configuration & Clamping', () => {
    beforeEach(async () => {
      await controller.start();
      controller.setEngaged(true);
    });

    it('scales delta proportionally with sensitivity', () => {
      controller.setSensitivity(2.0);
      expect(controller.getSensitivity()).toBe(2.0);

      mockSensor.emit(makeSample(0.0, 0.0));
      // deltaYaw = -0.01 * 1000 * 2.0 = 20
      mockSensor.emit(makeSample(-0.01, 0.0));

      expect(commandHandler).toHaveBeenCalledWith(20, 0);
    });

    it('clamps maximum delta to maxDelta limit', () => {
      mockSensor.emit(makeSample(0.0, 0.0));
      // Huge sudden turn: -0.2 rad * 1000 = 200px, should clamp to maxDelta (50px)
      mockSensor.emit(makeSample(-0.2, 0.0));

      expect(commandHandler).toHaveBeenCalledWith(50, 0);
    });
  });

  describe('Event Throttling & Promise Coalescing', () => {
    it('coalesces events while a command promise is in flight without creating queue pileup', async () => {
      let resolveCommand: () => void = () => {};
      const delayedCommand = jest.fn().mockImplementation(() => {
        return new Promise<void>(resolve => {
          resolveCommand = resolve;
        });
      });

      let currentTime = 1000;
      const throttledController = new MotionPointerController(mockSensor, delayedCommand, {
        baseGain: 1000,
        sensitivity: 1.0,
        deadZoneRadians: 0.001,
        accelGain: 0,
        smoothingAlpha: 1.0,
        maxDelta: 60,
        throttleMs: 10,
        now: () => currentTime,
      });

      await throttledController.start();
      throttledController.setEngaged(true);

      // Baseline
      mockSensor.emit(makeSample(0.0, 0.0));

      // First move: dispatches immediately
      mockSensor.emit(makeSample(-0.01, 0.0));
      expect(delayedCommand).toHaveBeenCalledTimes(1);
      expect(delayedCommand).toHaveBeenLastCalledWith(10, 0);

      // In-flight command is not yet resolved. Send second move
      mockSensor.emit(makeSample(-0.02, 0.0));
      // Should NOT dispatch another call while first is in flight!
      expect(delayedCommand).toHaveBeenCalledTimes(1);

      // Advance time and resolve in-flight command
      currentTime += 20;
      resolveCommand();
      await Promise.resolve();
      await Promise.resolve();

      // Next sample after resolution dispatches coalesced movement
      mockSensor.emit(makeSample(-0.03, 0.0));
      expect(delayedCommand).toHaveBeenCalledTimes(2);
    });

    it('handles command failure without crashing or throwing unhandled errors', async () => {
      const failingCommand = jest.fn().mockRejectedValue(new Error('TV pointer socket closed'));
      const safeController = new MotionPointerController(mockSensor, failingCommand, {
        baseGain: 1000,
        deadZoneRadians: 0.001,
        accelGain: 0,
        smoothingAlpha: 1.0,
        throttleMs: 0,
      });

      await safeController.start();
      safeController.setEngaged(true);

      mockSensor.emit(makeSample(0.0, 0.0));
      // Should not throw
      expect(() => {
        mockSensor.emit(makeSample(-0.01, 0.0));
      }).not.toThrow();

      expect(failingCommand).toHaveBeenCalledWith(10, 0);
    });
  });

  describe('Recenter Behavior', () => {
    beforeEach(async () => {
      await controller.start();
      controller.setEngaged(true);
    });

    it('clears reference orientation on recenter so next sample re-anchors', async () => {
      mockSensor.emit(makeSample(0.0, 0.0));
      mockSensor.emit(makeSample(-0.01, 0.0));
      expect(commandHandler).toHaveBeenCalledTimes(1);

      // Wait for promise resolution
      await Promise.resolve();

      controller.recenter();

      // Next sample after recenter anchors new orientation
      mockSensor.emit(makeSample(1.0, 1.0));
      expect(commandHandler).toHaveBeenCalledTimes(1); // No movement on anchor frame

      // Subsequent movement is relative to new anchor
      mockSensor.emit(makeSample(0.99, 1.0)); // -0.01 relative to 1.0
      expect(commandHandler).toHaveBeenCalledTimes(2);
      expect(commandHandler).toHaveBeenLastCalledWith(10, 0);
    });
  });

  describe('Gyroscopic Rate Vector & Gravity Projection (Phase 5.3)', () => {
    let currentTime = 1000;
    const makeGyroSample = (
      rotX: number,
      rotY: number,
      rotZ: number,
      gravity: { x: number; y: number; z: number } = { x: 0, y: -1, z: 0 },
      ts: number = currentTime,
    ): DeviceMotionSample => ({
      attitude: { yaw: 0, pitch: 0, roll: 0 },
      rotationRate: { x: rotX, y: rotY, z: rotZ },
      gravity,
      timestamp: ts,
    });

    beforeEach(async () => {
      currentTime = 1000;
      await controller.start();
      controller.setEngaged(true);
      // Anchor frame
      mockSensor.emit(makeGyroSample(0, 0, 0, { x: 0, y: -1, z: 0 }, currentTime));
    });

    it('maps physical portrait rotation right (negative rot.y) to positive deltaX (pointer right)', () => {
      currentTime += 20; // dt = 0.02s
      // In iOS portrait upright, turning right rotates clockwise looking down: rotY = -1.0 rad/s
      // grav.y = -1.0. omegaYaw = rotY * grav.y = (-1.0) * (-1.0) = +1.0
      // rawDx = 1.0 * 0.02 * 1000 = 20
      mockSensor.emit(makeGyroSample(0, -1.0, 0, { x: 0, y: -1, z: 0 }, currentTime));
      expect(commandHandler).toHaveBeenCalledWith(20, 0);
    });

    it('maps physical portrait rotation left (positive rot.y) to negative deltaX (pointer left)', () => {
      currentTime += 20;
      // In iOS portrait upright, turning left rotates counter-clockwise: rotY = +1.0 rad/s
      // omegaYaw = (+1.0) * (-1.0) = -1.0
      // rawDx = -1.0 * 0.02 * 1000 = -20
      mockSensor.emit(makeGyroSample(0, 1.0, 0, { x: 0, y: -1, z: 0 }, currentTime));
      expect(commandHandler).toHaveBeenCalledWith(-20, 0);
    });

    it('maps physical tilting down (negative rot.x) to positive deltaY (pointer down)', () => {
      currentTime += 20;
      // In iOS portrait, tilting down moves top towards -Z: rotX = -1.0 rad/s
      // omegaPitch = -rot.x = -(-1.0) = +1.0
      // rawDy = 1.0 * 0.02 * 1000 = 20
      mockSensor.emit(makeGyroSample(-1.0, 0, 0, { x: 0, y: -1, z: 0 }, currentTime));
      expect(commandHandler).toHaveBeenCalledWith(0, 20);
    });

    it('maps physical tilting up (positive rot.x) to negative deltaY (pointer up)', () => {
      currentTime += 20;
      // In iOS portrait, tilting up moves top towards +Z: rotX = +1.0 rad/s
      // omegaPitch = -rot.x = -(1.0) = -1.0
      // rawDy = -1.0 * 0.02 * 1000 = -20
      mockSensor.emit(makeGyroSample(1.0, 0, 0, { x: 0, y: -1, z: 0 }, currentTime));
      expect(commandHandler).toHaveBeenCalledWith(0, -20);
    });

    it('inverts ONLY horizontal movement when invertX is true', async () => {
      controller.setInvertX(true);
      currentTime += 20;

      // Turning right normally gives +20; with invertX gives -20
      mockSensor.emit(makeGyroSample(0, -1.0, 0, { x: 0, y: -1, z: 0 }, currentTime));
      expect(commandHandler).toHaveBeenCalledWith(-20, 0);

      await Promise.resolve();
      await Promise.resolve();

      // Verify vertical movement remains completely unaffected
      currentTime += 20;
      mockSensor.emit(makeGyroSample(-1.0, 0, 0, { x: 0, y: -1, z: 0 }, currentTime));
      expect(commandHandler).toHaveBeenLastCalledWith(0, 20);
    });

    it('inverts ONLY vertical movement when invertY is true', async () => {
      controller.setInvertY(true);
      currentTime += 20;

      // Tilting down normally gives +20; with invertY gives -20 (pointer UP)
      mockSensor.emit(makeGyroSample(-1.0, 0, 0, { x: 0, y: -1, z: 0 }, currentTime));
      expect(commandHandler).toHaveBeenCalledWith(0, -20);

      // Wait for promise resolution
      await Promise.resolve();
      await Promise.resolve();

      // Verify horizontal movement remains completely unaffected
      currentTime += 20;
      mockSensor.emit(makeGyroSample(0, -1.0, 0, { x: 0, y: -1, z: 0 }, currentTime));
      expect(commandHandler).toHaveBeenLastCalledWith(20, 0);
    });

    it('handles simultaneous diagonal movement correctly without axis swapping', () => {
      currentTime += 20;
      // Moving right (rotY = -1.0) and down (rotX = -1.0) simultaneously
      mockSensor.emit(makeGyroSample(-1.0, -1.0, 0, { x: 0, y: -1, z: 0 }, currentTime));
      expect(commandHandler).toHaveBeenCalledWith(20, 20);
    });

    it('projects yaw correctly when device is tilted 45 degrees forward', () => {
      currentTime += 20;
      // When phone is tilted forward 45 deg towards TV: grav.y = -0.707, grav.z = +0.707
      const g45Forward = { x: 0, y: -0.707, z: 0.707 };
      // User rotates clockwise around Earth vertical: rotY = -0.707, rotZ = 0.707
      mockSensor.emit(makeGyroSample(0, -0.707, 0.707, g45Forward, currentTime));
      // Dot product: (-0.707 * -0.707 + 0.707 * 0.707) = 0.5 + 0.5 = 1.0
      // rawDx = 1.0 * 0.02 * 1000 = 20
      expect(commandHandler).toHaveBeenCalledWith(20, 0);
    });

    it('projects yaw correctly when device is tilted 45 degrees backward', () => {
      currentTime += 20;
      // When phone is tilted backward 45 deg: grav.y = -0.707, grav.z = -0.707
      const g45Backward = { x: 0, y: -0.707, z: -0.707 };
      // User rotates clockwise around Earth vertical: rotY = -0.707, rotZ = -0.707
      mockSensor.emit(makeGyroSample(0, -0.707, -0.707, g45Backward, currentTime));
      // Dot product: (-0.707 * -0.707 + -0.707 * -0.707) = 0.5 + 0.5 = 1.0
      // rawDx = 1.0 * 0.02 * 1000 = 20
      expect(commandHandler).toHaveBeenCalledWith(20, 0);
    });

    it('bypasses acceleration and smoothing when diagnostic mode is enabled', () => {
      controller.setDiagnosticMode(true);
      expect(controller.isDiagnosticMode()).toBe(true);

      currentTime += 20;
      // High speed rotational movement (speed = 2.0 rad/s)
      // In normal mode this would trigger non-linear acceleration.
      // In diagnostic mode, acceleration is strictly bypassed (1.0x linear multiplier)
      mockSensor.emit(makeGyroSample(0, -2.0, 0, { x: 0, y: -1, z: 0 }, currentTime));
      // rawDx = 2.0 * 0.02 * 1000 * 1.0 = 40 (exact 1:1, no acceleration boost or smoothing lag)
      expect(commandHandler).toHaveBeenCalledWith(40, 0);
    });
  });

  describe('Non-Linear Acceleration & Precision (Phase 5.3)', () => {
    let currentTime = 1000;
    let accelController: MotionPointerController;

    const makeGyroSample = (rotY: number, ts: number): DeviceMotionSample => ({
      attitude: { yaw: 0, pitch: 0, roll: 0 },
      rotationRate: { x: 0, y: rotY, z: 0 },
      gravity: { x: 0, y: -1, z: 0 },
      timestamp: ts,
    });

    beforeEach(async () => {
      currentTime = 1000;
      accelController = new MotionPointerController(mockSensor, commandHandler, {
        baseGain: 1000,
        sensitivity: 1.0,
        deadZoneRadians: 0.001,
        accelGain: 0.8,
        accelThreshold: 0.5,
        smoothingAlpha: 1.0,
        maxDelta: 200,
        throttleMs: 0,
        now: () => currentTime,
      });

      await accelController.start();
      accelController.setEngaged(true);
      // Anchor
      mockSensor.emit(makeGyroSample(0, currentTime));
    });

    it('leaves slow movements below accelThreshold at linear 1.0x precision', () => {
      currentTime += 20; // dt = 0.02s
      // speed = 0.3 rad/s < 0.5 accelThreshold -> accelMultiplier = 1.0
      // rawDx = 0.3 * 0.02 * 1000 * 1.0 = 6
      mockSensor.emit(makeGyroSample(-0.3, currentTime));
      expect(commandHandler).toHaveBeenCalledWith(6, 0);
    });

    it('boosts fast movements above accelThreshold with acceleration curve', () => {
      currentTime += 20;
      // speed = 1.5 rad/s > 0.5 accelThreshold
      // excess = 1.0. accelMultiplier = 1.0 + 0.8 * 1.0 = 1.8
      // rawDx = 1.5 * 0.02 * 1000 * 1.8 = 54
      mockSensor.emit(makeGyroSample(-1.5, currentTime));
      expect(commandHandler).toHaveBeenCalledWith(54, 0);
    });
  });

  describe('Delta Clamping & Residual Retention (Phase 5.3)', () => {
    let currentTime = 1000;
    let clampController: MotionPointerController;

    beforeEach(async () => {
      currentTime = 1000;
      clampController = new MotionPointerController(mockSensor, commandHandler, {
        baseGain: 1000,
        sensitivity: 1.0,
        deadZoneRadians: 0.001,
        accelGain: 0,
        smoothingAlpha: 1.0,
        maxDelta: 50,
        throttleMs: 10,
        now: () => currentTime,
      });

      await clampController.start();
      clampController.setEngaged(true);
      // Baseline
      mockSensor.emit(makeSample(0.0, 0.0, 0, currentTime));
    });

    it('clamps single step to maxDelta and dispatches retained residual on next tick', async () => {
      currentTime += 20;
      // Movement produces rawDx = -(-0.09) * 1000 = 90px
      // maxDelta is 50px.
      // First tick should dispatch 50px and retain 40px in accumulator!
      mockSensor.emit(makeSample(-0.09, 0.0, 0, currentTime));
      expect(commandHandler).toHaveBeenCalledTimes(1);
      expect(commandHandler).toHaveBeenLastCalledWith(50, 0);

      // Await promise resolution
      await Promise.resolve();
      await Promise.resolve();

      // Advance time for throttle and send 0-delta frame
      currentTime += 20;
      mockSensor.emit(makeSample(-0.09, 0.0, 0, currentTime));

      // Residual 40px must be dispatched now without being discarded!
      expect(commandHandler).toHaveBeenCalledTimes(2);
      expect(commandHandler).toHaveBeenLastCalledWith(40, 0);
    });
  });

  describe('Error Backoff & Network Defense (Phase 5.3)', () => {
    let currentTime = 1000;

    it('enforces a 1500ms error cooldown after a socket rejection to avoid reconnection storms', async () => {
      const rejectingHandler = jest.fn().mockRejectedValue(new Error('TV pointer socket disconnected'));

      const backoffController = new MotionPointerController(mockSensor, rejectingHandler, {
        baseGain: 1000,
        sensitivity: 1.0,
        deadZoneRadians: 0.001,
        smoothingAlpha: 1.0,
        throttleMs: 10,
        now: () => currentTime,
      });

      await backoffController.start();
      backoffController.setEngaged(true);

      // Anchor
      mockSensor.emit(makeSample(0.0, 0.0, 0, currentTime));

      // First move triggers error
      currentTime += 20;
      mockSensor.emit(makeSample(-0.02, 0.0, 0, currentTime));
      expect(rejectingHandler).toHaveBeenCalledTimes(1);

      // Wait for rejection promise microtask to resolve
      await Promise.resolve();
      await Promise.resolve();

      // Subsequent moves within 1500ms MUST be suppressed to protect network
      currentTime += 100; // 100ms later (< 1500ms)
      mockSensor.emit(makeSample(-0.04, 0.0, 0, currentTime));
      expect(rejectingHandler).toHaveBeenCalledTimes(1);

      currentTime += 500; // 600ms later (< 1500ms)
      mockSensor.emit(makeSample(-0.06, 0.0, 0, currentTime));
      expect(rejectingHandler).toHaveBeenCalledTimes(1);

      // Once cooldown expires (1500ms +), moves are permitted again
      currentTime += 1000; // 1600ms total (> 1500ms)
      mockSensor.emit(makeSample(-0.08, 0.0, 0, currentTime));
      expect(rejectingHandler).toHaveBeenCalledTimes(2);
    });
  });
});
