import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import {
  DeviceMotionSample,
  IMotionSensorService,
  MotionSampleListener,
} from '../../domain/interfaces/IMotionSensorService';

interface NativeMotionModule {
  isAvailable(): Promise<boolean>;
  startMotionUpdates(intervalMs: number): Promise<void>;
  stopMotionUpdates(): Promise<void>;
}

export class CoreMotionSensorService implements IMotionSensorService {
  private tracking = false;
  private listenerSubscription: { remove: () => void } | null = null;
  private readonly nativeModule: NativeMotionModule | null;
  private readonly emitter: NativeEventEmitter | null;

  constructor(customNativeModule?: NativeMotionModule, customEmitter?: NativeEventEmitter) {
    if (customNativeModule) {
      this.nativeModule = customNativeModule;
      this.emitter = customEmitter ?? new NativeEventEmitter(customNativeModule as any);
    } else if (Platform.OS === 'ios' && NativeModules.MotionSensorModule) {
      this.nativeModule = NativeModules.MotionSensorModule as NativeMotionModule;
      this.emitter = new NativeEventEmitter(NativeModules.MotionSensorModule);
    } else {
      this.nativeModule = null;
      this.emitter = null;
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.nativeModule) {
      return false;
    }
    try {
      return await this.nativeModule.isAvailable();
    } catch {
      return false;
    }
  }

  async start(intervalMs: number, onSample: MotionSampleListener): Promise<void> {
    if (!this.nativeModule || !this.emitter) {
      throw new Error('CoreMotion is not available on this platform or native module is unlinked');
    }

    if (this.tracking) {
      await this.stop();
    }

    this.listenerSubscription = this.emitter.addListener(
      'onDeviceMotion',
      (...args: unknown[]) => {
        const rawSample = args[0] as DeviceMotionSample;
        if (this.tracking && onSample && rawSample) {
          onSample(rawSample);
        }
      },
    );

    try {
      await this.nativeModule.startMotionUpdates(intervalMs);
      this.tracking = true;
    } catch (e) {
      this.listenerSubscription.remove();
      this.listenerSubscription = null;
      this.tracking = false;
      throw e;
    }
  }

  async stop(): Promise<void> {
    if (this.listenerSubscription) {
      this.listenerSubscription.remove();
      this.listenerSubscription = null;
    }

    this.tracking = false;

    if (this.nativeModule) {
      try {
        await this.nativeModule.stopMotionUpdates();
      } catch {
        // Safe to ignore teardown error
      }
    }
  }

  isTracking(): boolean {
    return this.tracking;
  }
}
