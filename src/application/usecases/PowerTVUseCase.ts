import { TVDevice } from '../../domain/entities/TVDevice';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { TVConnectionError } from '../../domain/errors/TVConnectionError';
import { isValidMacAddress } from '../../domain/utils/macValidator';
import { TVConnectionManager } from '../services/TVConnectionManager';
import { SendRemoteCommandUseCase } from './SendRemoteCommandUseCase';
import { WakeTVExecutionOptions, WakeTVResult, WakeTVUseCase } from './WakeTVUseCase';

export type PowerTVAction = 'powerOff' | 'wake' | 'macRequired';

export interface PowerTVResult {
  action: PowerTVAction;
  success: boolean;
  restored?: boolean;
  device?: TVDevice | null;
  error?: Error;
  wakeResult?: WakeTVResult;
}

export interface PowerTVOptions extends WakeTVExecutionOptions {
  isConnected?: boolean;
}

/**
 * Single owner of TV Power action logic:
 * - When Connected: sends SSAP power-off command.
 * - When Disconnected / Error / Connecting / Reconnecting:
 *   - If valid MAC is available: initiates explicit Wake-on-LAN and coordinates connection restoration.
 *   - If MAC is missing/invalid: prompts for MAC address configuration.
 */
export class PowerTVUseCase {
  constructor(
    private readonly connectionManager: TVConnectionManager,
    private readonly sendRemoteCommand: SendRemoteCommandUseCase,
    private readonly wakeTV: WakeTVUseCase,
  ) {}

  async execute(device?: TVDevice | null, options: PowerTVOptions = {}): Promise<PowerTVResult> {
    const targetDevice = device || this.connectionManager.getDevice() || null;
    const isConnected =
      options.isConnected ??
      (this.connectionManager.getState() === TVConnectionState.Connected);

    // 1. If TV is currently connected, execute SSAP powerOff
    if (isConnected) {
      await this.sendRemoteCommand.execute({ type: 'powerOff' });
      return {
        action: 'powerOff',
        success: true,
        device: targetDevice,
      };
    }

    if (!targetDevice) {
      throw new TVConnectionError('No TV device selected', 'no_device');
    }

    // 2. TV is not connected (Disconnected, Error, Connecting, or Reconnecting).
    // Validate MAC address before sending packet.
    if (!targetDevice.macAddress || !isValidMacAddress(targetDevice.macAddress)) {
      return {
        action: 'macRequired',
        success: false,
        device: targetDevice,
        error: new TVConnectionError(
          'A valid TV MAC address is required to power on using Wake-on-LAN',
          'missing_mac',
        ),
      };
    }

    // 3. User explicit Power On: delegate to WakeTVUseCase.
    // WakeTVUseCase coordinates with TVConnectionManager (prepareForWake / finishWake)
    // so any stale pre-wake connection attempt is cancelled and cannot race.
    const wakeResult = await this.wakeTV.execute(targetDevice, options);
    return {
      action: 'wake',
      success: wakeResult.success,
      restored: wakeResult.restored,
      device: targetDevice,
      wakeResult,
      error: wakeResult.error,
    };
  }
}
