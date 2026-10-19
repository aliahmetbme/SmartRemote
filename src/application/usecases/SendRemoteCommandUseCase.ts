import { canAttemptCapability, TVCapability } from '../../domain/entities/TVCapabilities';
import { NavigationDirection, RemoteKey } from '../../domain/enums/RemoteKey';
import { TVUnsupportedOperationError } from '../../domain/errors/TVUnsupportedOperationError';
import {
  supportsAppLaunch,
  supportsInputSwitch,
  supportsPointer,
  supportsPowerOn,
  supportsSetVolume,
  supportsTextInput,
} from '../../domain/interfaces/ITVRemoteAdapter';
import { TVConnectionManager } from '../services/TVConnectionManager';

export type RemoteCommand =
  | { type: 'key'; key: RemoteKey }
  | { type: 'volumeUp' }
  | { type: 'volumeDown' }
  | { type: 'mute' }
  | { type: 'channelUp' }
  | { type: 'channelDown' }
  | { type: 'navigate'; direction: NavigationDirection }
  | { type: 'select' }
  | { type: 'back' }
  | { type: 'home' }
  | { type: 'powerOff' }
  | { type: 'powerOn' }
  | { type: 'setVolume'; value: number }
  | { type: 'launchApp'; appId: string }
  | { type: 'openInput'; inputId: string }
  | { type: 'movePointer'; deltaX: number; deltaY: number }
  | { type: 'sendText'; text: string };

const KEY_CAPABILITY: Record<RemoteKey, TVCapability> = {
  [RemoteKey.Up]: 'navigation',
  [RemoteKey.Down]: 'navigation',
  [RemoteKey.Left]: 'navigation',
  [RemoteKey.Right]: 'navigation',
  [RemoteKey.Ok]: 'navigation',
  [RemoteKey.Back]: 'navigation',
  [RemoteKey.Home]: 'navigation',
  [RemoteKey.VolumeUp]: 'volumeControl',
  [RemoteKey.VolumeDown]: 'volumeControl',
  [RemoteKey.Mute]: 'muteControl',
  [RemoteKey.ChannelUp]: 'channelControl',
  [RemoteKey.ChannelDown]: 'channelControl',
  [RemoteKey.Power]: 'powerOff',
};

function requiredCapability(command: RemoteCommand): TVCapability {
  switch (command.type) {
    case 'key':
      return KEY_CAPABILITY[command.key];
    case 'volumeUp':
    case 'volumeDown':
    case 'setVolume':
      return 'volumeControl';
    case 'mute':
      return 'muteControl';
    case 'channelUp':
    case 'channelDown':
      return 'channelControl';
    case 'navigate':
    case 'select':
    case 'back':
    case 'home':
      return 'navigation';
    case 'powerOff':
      return 'powerOff';
    case 'powerOn':
      return 'powerOn';
    case 'launchApp':
      return 'appLaunching';
    case 'openInput':
      return 'inputSwitching';
    case 'movePointer':
      return 'pointerControl';
    case 'sendText':
      return 'keyboardInput';
  }
}

/**
 * Forwards a command to the active adapter after checking the capability
 * AND that the adapter implements the optional interface. Never fakes success.
 */
export class SendRemoteCommandUseCase {
  constructor(private readonly manager: TVConnectionManager) {}

  async execute(command: RemoteCommand): Promise<void> {
    const adapter = this.manager.getReadyAdapter();
    if (!canAttemptCapability(adapter.getCapabilities(), requiredCapability(command))) {
      throw new TVUnsupportedOperationError(command.type, 'capability not available on this TV');
    }
    const unsupported = () => new TVUnsupportedOperationError(command.type, 'adapter lacks support');

    switch (command.type) {
      case 'key':
        return adapter.sendKey(command.key);
      case 'volumeUp':
        return adapter.volumeUp();
      case 'volumeDown':
        return adapter.volumeDown();
      case 'mute':
        return adapter.mute();
      case 'channelUp':
        return adapter.channelUp();
      case 'channelDown':
        return adapter.channelDown();
      case 'navigate':
        return adapter.navigate(command.direction);
      case 'select':
        return adapter.select();
      case 'back':
        return adapter.back();
      case 'home':
        return adapter.home();
      case 'powerOff':
        return adapter.powerOff();
      case 'powerOn':
        if (!supportsPowerOn(adapter)) throw unsupported();
        return adapter.powerOn();
      case 'setVolume':
        if (!supportsSetVolume(adapter)) throw unsupported();
        return adapter.setVolume(command.value);
      case 'launchApp':
        if (!supportsAppLaunch(adapter)) throw unsupported();
        return adapter.launchApp(command.appId);
      case 'openInput':
        if (!supportsInputSwitch(adapter)) throw unsupported();
        return adapter.openInput(command.inputId);
      case 'movePointer':
        if (!supportsPointer(adapter)) throw unsupported();
        return adapter.movePointer(command.deltaX, command.deltaY);
      case 'sendText':
        if (!supportsTextInput(adapter)) throw unsupported();
        return adapter.sendText(command.text);
    }
  }
}
