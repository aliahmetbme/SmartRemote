import { createCapabilities, TVCapabilities } from '../../../domain/entities/TVCapabilities';
import { NavigationDirection, RemoteKey } from '../../../domain/enums/RemoteKey';

export type PointerButton = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'ENTER' | 'BACK' | 'HOME';

export type LGWebOSCommand =
  | { kind: 'ssap'; uri: string; payload?: Record<string, unknown> }
  | { kind: 'pointer-button'; name: PointerButton };

export const SSAP_URI = {
  volumeUp: 'ssap://audio/volumeUp',
  volumeDown: 'ssap://audio/volumeDown',
  setVolume: 'ssap://audio/setVolume',
  setMute: 'ssap://audio/setMute',
  audioStatus: 'ssap://audio/getStatus',
  channelUp: 'ssap://tv/channelUp',
  channelDown: 'ssap://tv/channelDown',
  switchInput: 'ssap://tv/switchInput',
  powerOff: 'ssap://system/turnOff',
  launchApp: 'ssap://system.launcher/launch',
  insertText: 'ssap://com.webos.service.ime/insertText',
  serviceList: 'ssap://api/getServiceList',
  pointerSocket: 'ssap://com.webos.service.networkinput/getPointerInputSocket',
} as const;

const ssap = (uri: string, payload?: Record<string, unknown>): LGWebOSCommand => ({
  kind: 'ssap',
  uri,
  payload,
});
const button = (name: PointerButton): LGWebOSCommand => ({ kind: 'pointer-button', name });

const DIRECTION_BUTTON: Record<NavigationDirection, PointerButton> = {
  [NavigationDirection.Up]: 'UP',
  [NavigationDirection.Down]: 'DOWN',
  [NavigationDirection.Left]: 'LEFT',
  [NavigationDirection.Right]: 'RIGHT',
};

/**
 * Translates generic remote actions into LG webOS operations.
 * Directional/OK/Back/Home go through the pointer (network input) socket;
 * everything else is an SSAP request.
 */
export const LGWebOSCommandMapper = {
  volumeUp: () => ssap(SSAP_URI.volumeUp),
  volumeDown: () => ssap(SSAP_URI.volumeDown),
  channelUp: () => ssap(SSAP_URI.channelUp),
  channelDown: () => ssap(SSAP_URI.channelDown),
  powerOff: () => ssap(SSAP_URI.powerOff),
  navigate: (direction: NavigationDirection) => button(DIRECTION_BUTTON[direction]),
  select: () => button('ENTER'),
  back: () => button('BACK'),
  home: () => button('HOME'),
  setMute: (mute: boolean) => ssap(SSAP_URI.setMute, { mute }),
  audioStatus: () => ssap(SSAP_URI.audioStatus),

  setVolume(value: number): LGWebOSCommand {
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      throw new RangeError('Volume must be an integer between 0 and 100');
    }
    return ssap(SSAP_URI.setVolume, { volume: value });
  },
  launchApp(appId: string): LGWebOSCommand {
    if (!appId) throw new RangeError('appId is required');
    return ssap(SSAP_URI.launchApp, { id: appId });
  },
  openInput(inputId: string): LGWebOSCommand {
    if (!inputId) throw new RangeError('inputId is required');
    return ssap(SSAP_URI.switchInput, { inputId });
  },
  sendText(text: string): LGWebOSCommand {
    return ssap(SSAP_URI.insertText, { text, replace: 0 });
  },

  /** Generic key → command. Returns null for keys that need adapter-level handling (Mute is a toggle). */
  key(key: RemoteKey): LGWebOSCommand | null {
    switch (key) {
      case RemoteKey.Up:
        return button('UP');
      case RemoteKey.Down:
        return button('DOWN');
      case RemoteKey.Left:
        return button('LEFT');
      case RemoteKey.Right:
        return button('RIGHT');
      case RemoteKey.Ok:
        return button('ENTER');
      case RemoteKey.Back:
        return button('BACK');
      case RemoteKey.Home:
        return button('HOME');
      case RemoteKey.VolumeUp:
        return ssap(SSAP_URI.volumeUp);
      case RemoteKey.VolumeDown:
        return ssap(SSAP_URI.volumeDown);
      case RemoteKey.ChannelUp:
        return ssap(SSAP_URI.channelUp);
      case RemoteKey.ChannelDown:
        return ssap(SSAP_URI.channelDown);
      case RemoteKey.Power:
        return ssap(SSAP_URI.powerOff);
      case RemoteKey.Mute:
        return null;
    }
  },
};

/** Extracts service names from an `api/getServiceList` payload; null if the shape is unexpected. */
export function parseServiceNames(payload: Record<string, unknown>): string[] | null {
  const services = payload.services;
  if (!Array.isArray(services)) {
    return null;
  }
  return services
    .map(s => (typeof s === 'object' && s !== null ? (s as { name?: unknown }).name : undefined))
    .filter((n): n is string => typeof n === 'string');
}

/**
 * Capabilities derived from what the TV reports, never from the model name.
 * If the service list is unavailable, capabilities are marked as 'unknown' rather
 * than falsely advertising support, allowing them to be attempted safely.
 * Power-on is always unsupported: it requires Wake-on-LAN.
 */
export function deriveCapabilities(
  services: string[] | null,
  pointerAvailable: boolean,
): TVCapabilities {
  if (services === null) {
    return createCapabilities({
      volumeControl: 'unknown',
      muteControl: 'unknown',
      channelControl: 'unknown',
      inputSwitching: 'unknown',
      powerOff: 'unknown',
      appLaunching: 'unknown',
      keyboardInput: 'unknown',
      navigation: pointerAvailable ? 'supported' : 'unknown',
      pointerControl: pointerAvailable ? 'supported' : 'unsupported',
      powerOn: 'unsupported',
    });
  }

  const names = new Set(services);
  return createCapabilities({
    volumeControl: names.has('audio') ? 'supported' : 'unsupported',
    muteControl: names.has('audio') ? 'supported' : 'unsupported',
    channelControl: names.has('tv') ? 'supported' : 'unsupported',
    inputSwitching: names.has('tv') ? 'supported' : 'unsupported',
    powerOff: names.has('system') ? 'supported' : 'unsupported',
    appLaunching: names.has('system.launcher') ? 'supported' : 'unsupported',
    keyboardInput: names.has('com.webos.service.ime') ? 'supported' : 'unsupported',
    navigation: pointerAvailable ? 'supported' : 'unsupported',
    pointerControl: pointerAvailable ? 'supported' : 'unsupported',
    powerOn: 'unsupported',
  });
}
