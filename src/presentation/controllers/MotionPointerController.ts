import {
  IMotionSensorService,
  DeviceMotionSample,
  DeviceAttitude,
} from '../../domain/interfaces/IMotionSensorService';

export interface MotionControllerOptions {
  /**
   * Base gain mapping angular velocity (rad/s) to pointer movement (px/s).
   * Default: 1200 px/rad.
   */
  baseGain?: number;
  /**
   * User sensitivity multiplier (0.4 to 3.0).
   * Default: 1.0.
   */
  sensitivity?: number;
  /**
   * Minimum angular velocity in rad/s to register pointer motion (filters resting hand tremor).
   * Default: 0.025 rad/s (~1.4 deg/s).
   */
  deadZoneRadPerSec?: number;
  /**
   * Legacy alias for deadZoneRadPerSec.
   */
  deadZoneRadians?: number;
  /**
   * Non-linear acceleration threshold in rad/s.
   * Movements below this speed are 1:1 linear for fine precision.
   * Default: 0.35 rad/s (~20 deg/s).
   */
  accelThreshold?: number;
  /**
   * Non-linear acceleration gain factor.
   * Default: 1.2.
   */
  accelGain?: number;
  /**
   * Exponential moving average smoothing factor alpha (0 < alpha <= 1).
   * 1.0 = raw / no smoothing. Lower = smoother.
   * Default: 0.80.
   */
  smoothingAlpha?: number;
  /**
   * Maximum single-dispatch delta in pixels along each axis.
   * Default: 120 px.
   */
  maxDelta?: number;
  /**
   * Sensor sample rate request in milliseconds.
   * Default: 25 ms (~40 Hz).
   */
  updateIntervalMs?: number;
  /**
   * Minimum interval between network command dispatches.
   * Default: 25 ms.
   */
  throttleMs?: number;
  /**
   * Diagnostic mode flag: when true, disables acceleration and smoothing,
   * providing pure linear 1:1 mapping and throttled diagnostic logging.
   * Default: false.
   */
  diagnosticMode?: boolean;
  /**
   * Optional callback for receiving diagnostic snapshots.
   */
  onDiagnosticSample?: (diag: MotionDiagnosticData) => void;
  /**
   * Invert horizontal movement direction.
   * Default: false.
   */
  invertX?: boolean;
  /**
   * Invert vertical movement direction.
   * Default: false.
   */
  invertY?: boolean;
  /**
   * Custom clock function for testing.
   * Default: () => Date.now().
   */
  now?: () => number;
}

export interface MotionDiagnosticData {
  gyro: { x: number; y: number; z: number };
  gravity: { x: number; y: number; z: number };
  angularRates: { horizontal: number; vertical: number };
  pointerDelta: { dx: number; dy: number };
  inversion: { invertX: boolean; invertY: boolean };
  diagnosticMode: boolean;
  sampleRateHz?: number;
  sampleIntervalMs?: number;
  dispatchedRateHz?: number;
  pendingDelta?: { dx: number; dy: number };
}

export type PointerCommandHandler = (deltaX: number, deltaY: number) => Promise<void>;

/**
 * Normalizes an angle in radians to [-PI, PI].
 */
export function normalizeAngle(rad: number): number {
  let a = rad % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Independent MotionPointerController translating iPhone gyroscopic rate and attitude
 * into relative pointer movement for LG webOS TV.
 *
 * Implements:
 * - Start / stop lifecycle with sensor subscription cleanup
 * - Explicit motion activation ("hold-to-move") preventing unintended movement
 * - Gimbal-lock free angular rate vector projection (device X for pitch, gravity dot for yaw)
 * - True Invert Y consistency (independent of device tilt angle)
 * - Dynamic non-linear pointer acceleration (fine precision at low speeds, wide reach at high speeds)
 * - Proportional sensitivity scaling without premature truncation
 * - Bounded maximum delta with residual preservation (no discarded movements)
 * - Bounded dispatch frequency and failure cooldown to protect SSAP connection
 */
export class MotionPointerController {
  private readonly sensorService: IMotionSensorService;
  private readonly commandHandler: PointerCommandHandler;

  private baseGain: number;
  private sensitivity: number;
  private deadZoneRadPerSec: number;
  private accelThreshold: number;
  private accelGain: number;
  private smoothingAlpha: number;
  private maxDelta: number;
  private updateIntervalMs: number;
  private throttleMs: number;
  private invertX: boolean;
  private invertY: boolean;
  private nowFn: () => number;
  private diagnosticMode: boolean;
  private onDiagnosticSample?: (diag: MotionDiagnosticData) => void;
  private lastDiagLogTime: number = 0;
  private latestDiagRates = {
    rot: { x: 0, y: 0, z: 0 },
    grav: { x: 0, y: -1, z: 0 },
    omegaYaw: 0,
    omegaPitch: 0,
  };

  private sampleCount: number = 0;
  private sampleRateWindowStart: number = 0;
  private currentSampleRateHz: number = 0;
  private dispatchCount: number = 0;
  private dispatchRateWindowStart: number = 0;
  private currentDispatchRateHz: number = 0;
  private lastSampleIntervalMs: number = 0;

  private isRunning: boolean = false;
  private isEngaged: boolean = false;

  private lastAttitude: DeviceAttitude | null = null;
  private lastSampleTimestamp: number | null = null;
  private smoothedDeltaX: number = 0;
  private smoothedDeltaY: number = 0;

  private accumulatedDeltaX: number = 0;
  private accumulatedDeltaY: number = 0;

  private lastDispatchTime: number = 0;
  private isCommandInFlight: boolean = false;
  private errorCooldownUntil: number = 0;

  constructor(
    sensorService: IMotionSensorService,
    commandHandler: PointerCommandHandler,
    options: MotionControllerOptions = {},
  ) {
    this.sensorService = sensorService;
    this.commandHandler = commandHandler;

    this.baseGain = options.baseGain ?? 1200;
    this.sensitivity = options.sensitivity ?? 1.0;
    this.deadZoneRadPerSec =
      options.deadZoneRadPerSec ?? options.deadZoneRadians ?? 0.025;
    this.accelThreshold = options.accelThreshold ?? 0.35;
    this.accelGain = options.accelGain !== undefined ? options.accelGain : 1.2;
    this.smoothingAlpha = options.smoothingAlpha ?? 0.8;
    this.maxDelta = options.maxDelta ?? 120;
    this.updateIntervalMs = options.updateIntervalMs ?? 25;
    this.throttleMs = options.throttleMs ?? 25;
    this.invertX = options.invertX ?? false;
    this.invertY = options.invertY ?? false;
    this.diagnosticMode = options.diagnosticMode ?? false;
    this.onDiagnosticSample = options.onDiagnosticSample;
    this.nowFn = options.now ?? (() => Date.now());
  }

  // --- Configuration Accessors ---

  public getSensitivity(): number {
    return this.sensitivity;
  }

  public setSensitivity(value: number): void {
    this.sensitivity = Math.max(0.2, Math.min(4.0, value));
  }

  public isInvertedX(): boolean {
    return this.invertX;
  }

  public setInvertX(inverted: boolean): void {
    this.invertX = inverted;
  }

  public isInvertedY(): boolean {
    return this.invertY;
  }

  public setInvertY(inverted: boolean): void {
    this.invertY = inverted;
  }

  public isDiagnosticMode(): boolean {
    return this.diagnosticMode;
  }

  public setDiagnosticMode(enabled: boolean): void {
    this.diagnosticMode = enabled;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public getIsEngaged(): boolean {
    return this.isEngaged;
  }

  // --- Lifecycle & Activation ---

  /**
   * Starts motion sensor updates and attaches the event subscription.
   */
  public async start(): Promise<boolean> {
    if (this.isRunning) return true;

    const available = await this.sensorService.isAvailable();
    if (!available) {
      return false;
    }

    await this.sensorService.start(this.updateIntervalMs, this.handleMotionSample.bind(this));
    this.isRunning = true;
    return true;
  }

  /**
   * Stops sensor updates and cleans up subscriptions.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      await this.sensorService.stop();
    } catch {
      // Safe teardown
    }

    this.isRunning = false;
    this.resetMovementState();
  }

  /**
   * Engages or disengages pointer control ("hold-to-move").
   * When engaged, the reference attitude is initialized from the next sample.
   * When disengaged, buffers are immediately cleared so no pointer drift occurs.
   */
  public setEngaged(engaged: boolean): void {
    this.isEngaged = engaged;
    this.resetMovementState();
  }

  /**
   * Recenters reference attitude and flushes accumulators.
   */
  public recenter(): void {
    this.resetMovementState();
  }

  private resetMovementState(): void {
    this.lastAttitude = null;
    this.lastSampleTimestamp = null;
    this.smoothedDeltaX = 0;
    this.smoothedDeltaY = 0;
    this.accumulatedDeltaX = 0;
    this.accumulatedDeltaY = 0;
    this.isCommandInFlight = false;
    this.sampleCount = 0;
    this.sampleRateWindowStart = 0;
    this.currentSampleRateHz = 0;
    this.dispatchCount = 0;
    this.dispatchRateWindowStart = 0;
    this.currentDispatchRateHz = 0;
    this.lastSampleIntervalMs = 0;
  }

  // --- Sensor Processing & Movement Calculation ---

  /**
   * Handles incoming sensor sample.
   * Exported internally for deterministic unit testing.
   */
  public handleMotionSample(sample: DeviceMotionSample): void {
    if (!this.isRunning || !this.isEngaged) {
      return;
    }

    const currentAttitude = sample.attitude;
    if (!this.lastAttitude) {
      // First frame of engagement anchors baseline
      this.lastAttitude = { ...currentAttitude };
      this.lastSampleTimestamp = sample.timestamp;
      return;
    }

    // Delta time calculation bounded to realistic sample interval.
    // Handles timestamp units gracefully (seconds from iOS Core Motion vs ms from testing/synthetic).
    let dt = this.updateIntervalMs / 1000;
    if (this.lastSampleTimestamp !== null && sample.timestamp > this.lastSampleTimestamp) {
      const rawDelta = sample.timestamp - this.lastSampleTimestamp;
      const elapsedSec = rawDelta > 1.0 ? rawDelta / 1000 : rawDelta;
      if (elapsedSec >= 0.005 && elapsedSec <= 0.1) {
        dt = elapsedSec;
      }
    }
    this.lastSampleIntervalMs = Number((dt * 1000).toFixed(1));
    this.lastSampleTimestamp = sample.timestamp;

    const now = this.nowFn();
    if (this.sampleRateWindowStart === 0) {
      this.sampleRateWindowStart = now;
    } else if (now - this.sampleRateWindowStart >= 1000) {
      this.currentSampleRateHz = Math.round(
        (this.sampleCount * 1000) / (now - this.sampleRateWindowStart),
      );
      this.sampleCount = 0;
      this.sampleRateWindowStart = now;
    }
    this.sampleCount++;

    // Stale movement protection: if there was a prolonged dispatch delay (>250ms),
    // clear accumulated movement so historical motion is NOT replayed after stalls.
    if (this.lastDispatchTime > 0 && now - this.lastDispatchTime > 250) {
      this.accumulatedDeltaX = 0;
      this.accumulatedDeltaY = 0;
      this.smoothedDeltaX = 0;
      this.smoothedDeltaY = 0;
    }

    const rot = sample.rotationRate;
    const grav = sample.gravity;

    let omegaYaw = 0;
    let omegaPitch = 0;

    const hasDirectRotationRate =
      rot && (rot.x !== 0 || rot.y !== 0 || rot.z !== 0);

    if (hasDirectRotationRate) {
      // 1. Vertical axis (Pitch):
      // In iOS portrait orientation:
      // +X points horizontally to the right across the screen.
      // Tilting top of phone down moves top towards -Z (away from user face).
      // By right-hand rule around +X, curling from +Y to -Z is NEGATIVE angular velocity (rot.x < 0).
      // For LG webOS TV pointer, moving DOWN requires positive deltaY (dy > 0).
      // Tilting top of phone up moves top towards +Z (rot.x > 0), requiring dy < 0.
      // Therefore, vertical angular rate: omegaPitch = -rot.x.
      omegaPitch = -rot.x;

      // 2. Horizontal axis (Yaw):
      // Rotation around the Earth's vertical axis (pointing up to ceiling).
      // The upward vertical unit vector in device coordinates is u_hat = -grav / ||grav||.
      // Turning right in upright portrait: rot.y < 0.
      // In upright portrait, grav.y ≈ -1, grav.x ≈ 0, grav.z ≈ 0.
      // The projection (rot . grav) / ||grav|| = rot.y * (-1) = -rot.y.
      // For turning right (rot.y < 0): -rot.y = -(-...) > 0.
      // For LG webOS TV pointer, moving RIGHT requires positive deltaX (dx > 0).
      // Therefore, the horizontal angular rate is:
      // omegaYaw = +(rot . grav) / ||grav||.
      if (grav && (grav.x !== 0 || grav.y !== 0 || grav.z !== 0)) {
        const gLen = Math.hypot(grav.x, grav.y, grav.z);
        if (gLen > 0.1) {
          omegaYaw = (rot.x * grav.x + rot.y * grav.y + rot.z * grav.z) / gLen;
        } else {
          omegaYaw = -rot.y;
        }
      } else {
        omegaYaw = -rot.y;
      }
    } else {
      // Fallback for attitude-only samples: incremental delta / dt
      // In .xArbitraryZVertical reference frame:
      // Turning right makes attitude.yaw decrease (deltaYaw < 0).
      // Tilting top down makes attitude.pitch decrease (deltaPitch < 0).
      const deltaYaw = normalizeAngle(currentAttitude.yaw - this.lastAttitude.yaw);
      const deltaPitch = normalizeAngle(currentAttitude.pitch - this.lastAttitude.pitch);
      omegaYaw = -deltaYaw / dt;
      omegaPitch = -deltaPitch / dt;
    }

    this.lastAttitude = { ...currentAttitude };

    // Dead zone filter on angular speed (filters hand tremor at rest)
    const angularSpeed = Math.hypot(omegaYaw, omegaPitch);
    const activeDeadZone = this.diagnosticMode ? 0.002 : this.deadZoneRadPerSec;
    if (angularSpeed < activeDeadZone) {
      this.smoothedDeltaX *= 0.15;
      this.smoothedDeltaY *= 0.15;
      if (Math.abs(this.accumulatedDeltaX) >= 1 || Math.abs(this.accumulatedDeltaY) >= 1) {
        this.tryDispatchMovement();
      }
      return;
    }

    // Non-linear acceleration:
    // Precision targeting at low speeds (< accelThreshold), effortless screen traversal at high speeds.
    // In diagnostic mode, acceleration is disabled for 1:1 linear verification.
    let accelMultiplier = 1.0;
    if (!this.diagnosticMode && this.accelGain > 0 && angularSpeed > this.accelThreshold) {
      const excess = angularSpeed - this.accelThreshold;
      accelMultiplier = 1.0 + this.accelGain * Math.min(3.5, excess);
    }

    // Effective gain applied directly to rate * dt
    const effectiveGain = this.baseGain * this.sensitivity * accelMultiplier;

    let rawDx = omegaYaw * dt * effectiveGain;
    let rawDy = omegaPitch * dt * effectiveGain;

    if (this.invertX) {
      rawDx = -rawDx;
    }
    if (this.invertY) {
      rawDy = -rawDy;
    }

    // Exponential Moving Average (EMA) smoothing
    // In diagnostic mode, smoothing is bypassed (alpha = 1.0)
    const activeAlpha = this.diagnosticMode ? 1.0 : this.smoothingAlpha;
    this.smoothedDeltaX =
      activeAlpha * rawDx + (1 - activeAlpha) * this.smoothedDeltaX;
    this.smoothedDeltaY =
      activeAlpha * rawDy + (1 - activeAlpha) * this.smoothedDeltaY;

    // Accumulate smoothed deltas with a bounded headroom limit
    this.accumulatedDeltaX += this.smoothedDeltaX;
    this.accumulatedDeltaY += this.smoothedDeltaY;

    const maxAccumulated = this.maxDelta * 2;
    this.accumulatedDeltaX = Math.max(
      -maxAccumulated,
      Math.min(maxAccumulated, this.accumulatedDeltaX),
    );
    this.accumulatedDeltaY = Math.max(
      -maxAccumulated,
      Math.min(maxAccumulated, this.accumulatedDeltaY),
    );

    // Cache latest diagnostic data for throttled dispatch logging
    this.latestDiagRates = {
      rot: rot ? { ...rot } : { x: 0, y: 0, z: 0 },
      grav: grav ? { ...grav } : { x: 0, y: -1, z: 0 },
      omegaYaw,
      omegaPitch,
    };

    // Flush to command handler with bounded frequency
    this.tryDispatchMovement();
  }

  /**
   * Dispatches accumulated movement if throttle period has elapsed,
   * no command is in flight, and no error cooldown is active.
   */
  private tryDispatchMovement(): void {
    if (!this.isEngaged) {
      return;
    }

    const now = this.nowFn();
    if (now - this.lastDispatchTime < this.throttleMs) {
      return;
    }

    if (this.isCommandInFlight) {
      return;
    }

    if (now < this.errorCooldownUntil) {
      return;
    }

    const sendX = Math.round(this.accumulatedDeltaX);
    const sendY = Math.round(this.accumulatedDeltaY);

    if (sendX === 0 && sendY === 0) {
      return;
    }

    // Clamp single step to bounded maximum delta
    const clampedX = Math.max(-this.maxDelta, Math.min(this.maxDelta, sendX));
    const clampedY = Math.max(-this.maxDelta, Math.min(this.maxDelta, sendY));

    // Deduct ONLY what is actually dispatched, retaining residuals for the next frame
    this.accumulatedDeltaX -= clampedX;
    this.accumulatedDeltaY -= clampedY;

    // Dispatch rate metrics
    if (this.dispatchRateWindowStart === 0) {
      this.dispatchRateWindowStart = now;
    } else if (now - this.dispatchRateWindowStart >= 1000) {
      this.currentDispatchRateHz = Math.round(
        (this.dispatchCount * 1000) / (now - this.dispatchRateWindowStart),
      );
      this.dispatchCount = 0;
      this.dispatchRateWindowStart = now;
    }
    this.dispatchCount++;

    // Throttled diagnostic logging (max 2 logs / sec)
    if (this.diagnosticMode && now - this.lastDiagLogTime >= 500) {
      this.lastDiagLogTime = now;
      const diagData: MotionDiagnosticData = {
        gyro: { ...this.latestDiagRates.rot },
        gravity: { ...this.latestDiagRates.grav },
        angularRates: {
          horizontal: Number(this.latestDiagRates.omegaYaw.toFixed(3)),
          vertical: Number(this.latestDiagRates.omegaPitch.toFixed(3)),
        },
        pointerDelta: { dx: clampedX, dy: clampedY },
        inversion: { invertX: this.invertX, invertY: this.invertY },
        diagnosticMode: true,
        sampleRateHz: this.currentSampleRateHz,
        sampleIntervalMs: this.lastSampleIntervalMs,
        dispatchedRateHz: this.currentDispatchRateHz,
        pendingDelta: {
          dx: Math.round(this.accumulatedDeltaX),
          dy: Math.round(this.accumulatedDeltaY),
        },
      };
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(
          `[SmartRemote][MotionDiag] ` +
            `Rate: ${diagData.sampleRateHz ?? 0}Hz (${diagData.sampleIntervalMs ?? 0}ms) | ` +
            `SendRate: ${diagData.dispatchedRateHz ?? 0}Hz | ` +
            `Rates: (H:${diagData.angularRates.horizontal.toFixed(2)}, V:${diagData.angularRates.vertical.toFixed(2)}) | ` +
            `Out: dx=${clampedX}, dy=${clampedY} (pending: ${diagData.pendingDelta?.dx ?? 0}, ${diagData.pendingDelta?.dy ?? 0}) | ` +
            `Invert: X=${this.invertX}, Y=${this.invertY}`,
        );
      }
      this.onDiagnosticSample?.(diagData);
    }

    this.lastDispatchTime = now;
    this.isCommandInFlight = true;

    this.commandHandler(clampedX, clampedY)
      .catch(() => {
        // Enforce cooldown on error to protect network from hammering closed socket
        this.errorCooldownUntil = this.nowFn() + 1500;
        this.accumulatedDeltaX = 0;
        this.accumulatedDeltaY = 0;
      })
      .finally(() => {
        this.isCommandInFlight = false;
        // Coalescing continuation: if additional movement accumulated during in-flight dispatch
        // and throttle interval has elapsed, immediately fire the next step.
        if (
          this.isEngaged &&
          (Math.round(this.accumulatedDeltaX) !== 0 || Math.round(this.accumulatedDeltaY) !== 0)
        ) {
          if (this.nowFn() - this.lastDispatchTime >= this.throttleMs) {
            this.tryDispatchMovement();
          }
        }
      });
  }
}
