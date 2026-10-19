import { CapabilityState, createCapabilities, TVCapabilities } from '../../../domain/entities/TVCapabilities';
import { TVDevice } from '../../../domain/entities/TVDevice';
import { NavigationDirection, RemoteKey } from '../../../domain/enums/RemoteKey';
import { TVConnectionState } from '../../../domain/enums/TVConnectionState';
import { TVConnectionError } from '../../../domain/errors/TVConnectionError';
import { TVPairingError } from '../../../domain/errors/TVPairingError';
import { TVUnsupportedOperationError } from '../../../domain/errors/TVUnsupportedOperationError';
import {
  ConnectionStateListener,
  IAppLaunchAdapter,
  IInputSwitchAdapter,
  IPointerAdapter,
  IPowerOnAdapter,
  ITextInputAdapter,
  ITVRemoteAdapter,
  IVolumeSetAdapter,
  Unsubscribe,
} from '../../../domain/interfaces/ITVRemoteAdapter';

export interface MockTVAdapterOptions {
  capabilities?: Partial<Record<keyof TVCapabilities, CapabilityState | boolean>>;
  /** Emit Pairing and require pairing to be accepted. */
  requirePairing?: boolean;
  /** Reject pairing with TVPairingError. */
  rejectPairing?: boolean;
  /** Fail connect() with this error. */
  connectError?: Error;
  /** If set, connect() waits for this promise (lets tests control timing / simulate hangs). */
  connectGate?: Promise<void>;
}

export interface MockCommandRecord {
  command: string;
  args: unknown[];
}

/** In-memory adapter for tests and development. Does no networking. */
export class MockTVAdapter
  implements
    ITVRemoteAdapter,
    IPowerOnAdapter,
    IVolumeSetAdapter,
    IAppLaunchAdapter,
    IInputSwitchAdapter,
    IPointerAdapter,
    ITextInputAdapter
{
  readonly commands: MockCommandRecord[] = [];
  private state = TVConnectionState.Disconnected;
  private readonly listeners = new Set<ConnectionStateListener>();
  private readonly capabilities: TVCapabilities;

  constructor(private readonly options: MockTVAdapterOptions = {}) {
    this.capabilities = createCapabilities(
      options.capabilities ?? {
        volumeControl: true,
        channelControl: true,
        muteControl: true,
        navigation: true,
        powerOff: true,
        appLaunching: true,
        inputSwitching: true,
        pointerControl: true,
      },
    );
  }

  async connect(_device: TVDevice): Promise<void> {
    this.setState(TVConnectionState.Connecting);
    if (this.options.connectGate) {
      await this.options.connectGate;
    }
    if (this.options.connectError) {
      this.setState(TVConnectionState.Error, this.options.connectError);
      throw this.options.connectError;
    }
    if (this.options.requirePairing) {
      this.setState(TVConnectionState.Pairing);
      if (this.options.rejectPairing) {
        const error = new TVPairingError('Pairing rejected on the TV');
        this.setState(TVConnectionState.Error, error);
        throw error;
      }
    }
    this.setState(TVConnectionState.Connected);
  }

  async disconnect(): Promise<void> {
    this.record('disconnect');
    this.setState(TVConnectionState.Disconnected);
  }

  getConnectionState(): TVConnectionState {
    return this.state;
  }

  getCapabilities(): TVCapabilities {
    return this.capabilities;
  }

  onConnectionStateChange(listener: ConnectionStateListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Test helper: simulate the TV dropping the connection. */
  simulateConnectionLoss(error?: Error): void {
    this.setState(TVConnectionState.Error, error ?? new TVConnectionError('Connection lost'));
  }

  sendKey(key: RemoteKey) {
    return this.run('sendKey', [key]);
  }
  volumeUp() {
    return this.run('volumeUp', [], 'volumeControl');
  }
  volumeDown() {
    return this.run('volumeDown', [], 'volumeControl');
  }
  mute() {
    return this.run('mute', [], 'muteControl');
  }
  channelUp() {
    return this.run('channelUp', [], 'channelControl');
  }
  channelDown() {
    return this.run('channelDown', [], 'channelControl');
  }
  navigate(direction: NavigationDirection) {
    return this.run('navigate', [direction], 'navigation');
  }
  select() {
    return this.run('select', [], 'navigation');
  }
  back() {
    return this.run('back', [], 'navigation');
  }
  home() {
    return this.run('home', [], 'navigation');
  }
  powerOff() {
    return this.run('powerOff', [], 'powerOff');
  }
  powerOn() {
    return this.run('powerOn', [], 'powerOn');
  }
  setVolume(value: number) {
    return this.run('setVolume', [value], 'volumeControl');
  }
  launchApp(appId: string) {
    return this.run('launchApp', [appId], 'appLaunching');
  }
  openInput(inputId: string) {
    return this.run('openInput', [inputId], 'inputSwitching');
  }
  movePointer(deltaX: number, deltaY: number) {
    return this.run('movePointer', [deltaX, deltaY], 'pointerControl');
  }
  sendText(text: string) {
    return this.run('sendText', [text], 'keyboardInput');
  }

  private async run(
    command: string,
    args: unknown[],
    capability?: keyof TVCapabilities,
  ): Promise<void> {
    if (this.state !== TVConnectionState.Connected) {
      throw new TVConnectionError('Mock TV is not connected');
    }
    if (capability && this.capabilities[capability] === 'unsupported') {
      throw new TVUnsupportedOperationError(command);
    }
    this.record(command, args);
  }

  private record(command: string, args: unknown[] = []): void {
    this.commands.push({ command, args });
  }

  private setState(state: TVConnectionState, error?: Error): void {
    this.state = state;
    this.listeners.forEach(l => l(state, error));
  }
}
