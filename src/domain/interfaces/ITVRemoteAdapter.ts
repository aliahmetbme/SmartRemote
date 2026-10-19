import { TVCapabilities } from '../entities/TVCapabilities';
import { TVDevice } from '../entities/TVDevice';
import { NavigationDirection, RemoteKey } from '../enums/RemoteKey';
import { TVConnectionState } from '../enums/TVConnectionState';

export type ConnectionStateListener = (state: TVConnectionState, error?: Error) => void;
export type Unsubscribe = () => void;

/**
 * Protocol-independent contract every TV adapter implements.
 *
 * `connect` resolves only when the TV is READY for commands (transport up and
 * pairing complete). While running it may report `Connecting`/`Pairing`
 * through `onConnectionStateChange`. Unexpected drops are reported as
 * `Disconnected` or `Error`.
 */
export interface ITVRemoteAdapter {
  connect(device: TVDevice): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionState(): TVConnectionState;
  /** Authoritative capabilities for this TV. */
  getCapabilities(): TVCapabilities;
  onConnectionStateChange(listener: ConnectionStateListener): Unsubscribe;

  sendKey(key: RemoteKey): Promise<void>;
  volumeUp(): Promise<void>;
  volumeDown(): Promise<void>;
  mute(): Promise<void>;
  channelUp(): Promise<void>;
  channelDown(): Promise<void>;
  navigate(direction: NavigationDirection): Promise<void>;
  select(): Promise<void>;
  back(): Promise<void>;
  home(): Promise<void>;
  powerOff(): Promise<void>;
}

// Optional, capability-specific interfaces. Adapters implement only what
// the protocol genuinely supports; callers must check capability + guard.

export interface IPowerOnAdapter {
  powerOn(): Promise<void>;
}
export interface IVolumeSetAdapter {
  setVolume(value: number): Promise<void>;
}
export interface IAppLaunchAdapter {
  launchApp(appId: string): Promise<void>;
}
export interface IInputSwitchAdapter {
  openInput(inputId: string): Promise<void>;
}
export interface IPointerAdapter {
  movePointer(deltaX: number, deltaY: number): Promise<void>;
}
export interface ITextInputAdapter {
  sendText(text: string): Promise<void>;
}

const has = (a: object, method: string): boolean =>
  typeof (a as Record<string, unknown>)[method] === 'function';

export const supportsPowerOn = (a: ITVRemoteAdapter): a is ITVRemoteAdapter & IPowerOnAdapter =>
  has(a, 'powerOn');
export const supportsSetVolume = (a: ITVRemoteAdapter): a is ITVRemoteAdapter & IVolumeSetAdapter =>
  has(a, 'setVolume');
export const supportsAppLaunch = (a: ITVRemoteAdapter): a is ITVRemoteAdapter & IAppLaunchAdapter =>
  has(a, 'launchApp');
export const supportsInputSwitch = (
  a: ITVRemoteAdapter,
): a is ITVRemoteAdapter & IInputSwitchAdapter => has(a, 'openInput');
export const supportsPointer = (a: ITVRemoteAdapter): a is ITVRemoteAdapter & IPointerAdapter =>
  has(a, 'movePointer');
export const supportsTextInput = (a: ITVRemoteAdapter): a is ITVRemoteAdapter & ITextInputAdapter =>
  has(a, 'sendText');
