import { NativeModules } from 'react-native';
import { ITVWakeService, WakeOptions, WakeResult } from '../../domain/interfaces/ITVWakeService';
import { canonicalizeMacAddress, isValidMacAddress } from '../../domain/utils/macValidator';
import { TVConnectionError } from '../../domain/errors/TVConnectionError';

export interface IWakeOnLanNativeModule {
  isAvailable(): Promise<boolean>;
  sendMagicPacket(
    macAddress: string,
    options?: {
      port?: number;
      broadcastAddress?: string;
      repeatCount?: number;
      delayMs?: number;
    },
  ): Promise<{
    success: boolean;
    packetsSent: number;
    destinations: string[];
  }>;
}

export class WakeOnLanService implements ITVWakeService {
  private readonly nativeModule: IWakeOnLanNativeModule | null;

  constructor(customNativeModule?: IWakeOnLanNativeModule) {
    this.nativeModule =
      customNativeModule ??
      ((NativeModules?.WakeOnLanModule as IWakeOnLanNativeModule) || null);
  }

  async isSupported(): Promise<boolean> {
    if (!this.nativeModule) {
      return false;
    }
    try {
      return await this.nativeModule.isAvailable();
    } catch {
      return false;
    }
  }

  async wake(macAddress: string, options: WakeOptions = {}): Promise<WakeResult> {
    if (!isValidMacAddress(macAddress)) {
      throw new TVConnectionError(
        `Invalid MAC address format: "${macAddress}"`,
        'invalid_mac',
      );
    }
    const canonicalMac = canonicalizeMacAddress(macAddress);

    if (!this.nativeModule) {
      throw new TVConnectionError(
        'Wake-on-LAN is not supported on this platform/runtime',
        'unsupported_platform',
      );
    }

    try {
      const res = await this.nativeModule.sendMagicPacket(canonicalMac, {
        port: options.port ?? 9,
        broadcastAddress: options.broadcastAddress,
        repeatCount: options.repeatCount ?? 3,
        delayMs: options.delayMs ?? 50,
      });

      return {
        success: Boolean(res.success),
        packetsSent: res.packetsSent ?? 0,
        destinations: res.destinations ?? [],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new TVConnectionError(`Wake-on-LAN transmission failed: ${msg}`, 'wol_failed', e);
    }
  }
}
