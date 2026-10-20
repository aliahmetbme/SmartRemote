export interface DeviceAttitude {
  pitch: number;
  roll: number;
  yaw: number;
}

export interface DeviceRotationRate {
  x: number;
  y: number;
  z: number;
}

export interface DeviceGravity {
  x: number;
  y: number;
  z: number;
}

export interface DeviceMotionSample {
  attitude: DeviceAttitude;
  rotationRate: DeviceRotationRate;
  gravity?: DeviceGravity;
  timestamp: number;
}

export type MotionSampleListener = (sample: DeviceMotionSample) => void;

export interface IMotionSensorService {
  /** Checks if device motion (gyroscope/attitude sensor fusion) is available on this platform. */
  isAvailable(): Promise<boolean>;

  /**
   * Starts publishing device motion events at the requested interval.
   * @param intervalMs Desired update interval in milliseconds (typically 16-25ms = 40-60Hz).
   * @param onSample Callback invoked with every sensor sample.
   */
  start(intervalMs: number, onSample: MotionSampleListener): Promise<void>;

  /** Stops sensor sampling and cleans up native subscriptions. */
  stop(): Promise<void>;

  /** Whether the sensor service is currently actively sampling. */
  isTracking(): boolean;
}
