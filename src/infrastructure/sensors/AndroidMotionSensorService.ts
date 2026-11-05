import { NativeEventEmitter, NativeModules } from 'react-native';
import {
  DeviceMotionSample,
  IMotionSensorService,
  MotionSampleListener,
} from '../../domain/interfaces/IMotionSensorService';

interface NativeAndroidMotionModule {
  isAvailable(): Promise<boolean>;
  startMotionUpdates(intervalMs: number, sessionId: number): Promise<void>;
  stopMotionUpdates(): Promise<void>;
}

interface MotionEmitter {
  addListener(name: string, listener: (...args: unknown[]) => unknown): { remove(): void };
}

type MotionEvent = DeviceMotionSample & { sessionId: number };

function isValidSample(sample: MotionEvent): boolean {
  const { attitude, rotationRate, gravity, timestamp } = sample;
  return Boolean(attitude && rotationRate && gravity && timestamp > 0 &&
    [timestamp, attitude.pitch, attitude.roll, attitude.yaw,
      rotationRate.x, rotationRate.y, rotationRate.z, gravity.x, gravity.y, gravity.z]
      .every(Number.isFinite));
}

export class AndroidMotionSensorService implements IMotionSensorService {
  private generation = 0;
  private tracking = false;
  private subscriptions: { remove(): void }[] = [];
  private readonly interruptionListeners = new Set<() => void>();

  constructor(
    private readonly nativeModule: NativeAndroidMotionModule | null =
      NativeModules.AndroidMotionSensorModule ?? null,
    private readonly emitter: MotionEmitter | null =
      nativeModule ? new NativeEventEmitter(NativeModules.AndroidMotionSensorModule) : null,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      return (await this.nativeModule?.isAvailable()) === true;
    } catch {
      return false;
    }
  }

  async start(intervalMs: number, onSample: MotionSampleListener): Promise<void> {
    if (!this.nativeModule || !this.emitter) {
      throw new Error('Android Motion native module is unavailable');
    }

    const generation = this.clearSession();
    let lastTimestamp = 0;
    this.subscriptions = [
      this.emitter.addListener('onAndroidDeviceMotion', (...args: unknown[]) => {
        const sample = args[0] as MotionEvent | undefined;
        if (!this.tracking || generation !== this.generation || sample?.sessionId !== generation ||
            !isValidSample(sample) || sample.timestamp <= lastTimestamp) return;
        lastTimestamp = sample.timestamp;
        onSample(sample);
      }),
      this.emitter.addListener('onAndroidMotionInterrupted', (...args: unknown[]) => {
        const event = args[0] as { sessionId: number } | undefined;
        if (generation !== this.generation || event?.sessionId !== generation) return;
        this.clearSession();
        this.interruptionListeners.forEach(listener => listener());
      }),
    ];

    try {
      await this.nativeModule.startMotionUpdates(intervalMs, generation);
      if (generation !== this.generation) throw new Error('Android Motion start was interrupted');
      this.tracking = true;
    } catch (error) {
      if (generation === this.generation) this.clearSession();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const hadSession = this.subscriptions.length > 0;
    this.clearSession();
    if (hadSession) await this.nativeModule?.stopMotionUpdates();
  }

  isTracking(): boolean {
    return this.tracking;
  }

  onInterrupted(listener: () => void): () => void {
    this.interruptionListeners.add(listener);
    return () => { this.interruptionListeners.delete(listener); };
  }

  private clearSession(): number {
    this.tracking = false;
    this.subscriptions.forEach(subscription => subscription.remove());
    this.subscriptions = [];
    return ++this.generation;
  }
}
