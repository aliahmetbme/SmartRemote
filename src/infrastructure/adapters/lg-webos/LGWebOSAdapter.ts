import { Scheduler } from '../../../application/services/TVConnectionManager';
import {
  createCapabilities,
  NO_CAPABILITIES,
  TVCapabilities,
  TVCapability,
} from '../../../domain/entities/TVCapabilities';
import { TVDevice } from '../../../domain/entities/TVDevice';
import { NavigationDirection, RemoteKey } from '../../../domain/enums/RemoteKey';
import { TVConnectionState } from '../../../domain/enums/TVConnectionState';
import { TVPlatform } from '../../../domain/enums/TVPlatform';
import { TVProtocol } from '../../../domain/enums/TVProtocol';
import { TVAuthorizationError } from '../../../domain/errors/TVAuthorizationError';
import { TVConnectionError } from '../../../domain/errors/TVConnectionError';
import { TVUnsupportedOperationError } from '../../../domain/errors/TVUnsupportedOperationError';
import { ICredentialStorage } from '../../../domain/interfaces/ICredentialStorage';
import {
  ConnectionStateListener,
  IAppLaunchAdapter,
  IInputSwitchAdapter,
  IPointerAdapter,
  ITextInputAdapter,
  ITVRemoteAdapter,
  IVolumeSetAdapter,
  Unsubscribe,
} from '../../../domain/interfaces/ITVRemoteAdapter';
import {
  deriveCapabilities,
  LGWebOSCommand,
  LGWebOSCommandMapper,
  parseServiceNames,
  SSAP_URI,
} from './LGWebOSCommandMapper';
import { LGTVCertificateTrustManager } from './LGTVCertificateTrustManager';
import { LGWebOSPairingService } from './LGWebOSPairingService';
import { LGWebOSPointerClient } from './LGWebOSPointerClient';
import { LGWebOSRequestError, LGWebOSWebSocketClient } from './LGWebOSWebSocketClient';
import { defaultWebSocketFactory, WebSocketFactory } from './WebSocketTransport';

export interface LGWebOSEndpoint {
  scheme: 'ws' | 'wss';
  port: number;
}

/**
 * Plain `ws://3000` is tried first because React Native cannot trust the TV's
 * self-signed certificate on `wss://3001`. Security implication: on `ws://` the
 * pairing key crosses the local network unencrypted. A host-scoped certificate
 * trust (native) is required before relying on wss for newer firmware.
 */
export const DEFAULT_LG_ENDPOINTS: readonly LGWebOSEndpoint[] = [
  { scheme: 'wss', port: 3001 },
  { scheme: 'ws', port: 3000 },
];

export interface LGWebOSAdapterDependencies {
  credentialStorage: ICredentialStorage;
  webSocketFactory?: WebSocketFactory;
  scheduler?: Scheduler;
  endpoints?: readonly LGWebOSEndpoint[];
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
  pairingTimeoutMs?: number;
  trustManager?: LGTVCertificateTrustManager;
}

const HOST_PATTERN = /^[A-Za-z0-9.-]+$/;

export class LGWebOSAdapter
  implements
    ITVRemoteAdapter,
    IVolumeSetAdapter,
    IAppLaunchAdapter,
    IInputSwitchAdapter,
    IPointerAdapter,
    ITextInputAdapter
{
  private readonly socketFactory: WebSocketFactory;
  private readonly endpoints: readonly LGWebOSEndpoint[];
  private readonly trustManager: LGTVCertificateTrustManager;
  private readonly listeners = new Set<ConnectionStateListener>();
  private state = TVConnectionState.Disconnected;
  private capabilities: TVCapabilities = { ...NO_CAPABILITIES };

  private client: LGWebOSWebSocketClient | null = null;
  private pointer: LGWebOSPointerClient | null = null;
  private pointerOpening: Promise<LGWebOSPointerClient> | null = null;
  private host = '';
  /** Incremented on every connect/disconnect so stale async work can detect cancellation. */
  private attempt = 0;

  constructor(private readonly deps: LGWebOSAdapterDependencies) {
    this.socketFactory = deps.webSocketFactory ?? defaultWebSocketFactory;
    this.endpoints = deps.endpoints ?? DEFAULT_LG_ENDPOINTS;
    this.trustManager = deps.trustManager ?? new LGTVCertificateTrustManager(deps.credentialStorage);
  }

  // ---- lifecycle ----

  async connect(device: TVDevice): Promise<void> {
    if (device.protocol !== TVProtocol.LGWebOSSSAP || device.platform !== TVPlatform.WebOS) {
      throw new TVUnsupportedOperationError('connect', 'device is not an LG webOS TV');
    }
    if (!HOST_PATTERN.test(device.ipAddress)) {
      throw new TVConnectionError('Invalid TV address');
    }
    await this.teardown();
    const attempt = ++this.attempt;
    this.host = device.ipAddress;
    this.setState(TVConnectionState.Connecting);

    try {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(`[SmartRemote][Connect] Stage 1/5: Opening SSAP transport connection to ${device.ipAddress}...`);
      }
      const client = await this.openFirstReachable(device.ipAddress, attempt);
      this.client = client;
      client.onClose(error => this.handleConnectionLost(client, error));
      this.assertCurrent(attempt);

      if (!client.isOpen()) {
        const closeError = client.getLastCloseError();
        throw (
          closeError ??
          new TVConnectionError(
            `Connection to TV at ${device.ipAddress} closed immediately after handshake`,
            'connection_failed',
          )
        );
      }

      // Stage 2: Verify native certificate trust & detect changes if secure TLS was used
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(`[SmartRemote][Connect] Stage 2/5: Verifying TLS certificate trust for ${device.ipAddress}...`);
      }
      const lastTLS = await this.trustManager.getLastStatus();
      if (lastTLS) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(
            `[SmartRemote][Connect] TLS Status for ${device.ipAddress}: success=${lastTLS.validationSuccess}, leaf='${lastTLS.leafSummary}', fp='${lastTLS.leafFingerprint?.slice(0, 12)}...', err=${lastTLS.errorDomain}:${lastTLS.errorCode} (${lastTLS.errorDescription})`,
          );
        }
        if (!lastTLS.validationSuccess && (lastTLS.errorCode !== 0 || lastTLS.errorDescription)) {
          throw new TVConnectionError(
            `TLS certificate validation failed for ${device.ipAddress}: ${lastTLS.errorDescription || 'Untrusted certificate'} [${lastTLS.errorDomain || 'Security'} code ${lastTLS.errorCode}]`,
            'connection_failed',
          );
        }
        if (lastTLS.leafFingerprint) {
          const trustResult = await this.trustManager.verifyTrust(device.id, lastTLS);
          if (trustResult.certificateChanged) {
            throw new TVConnectionError(
              `The TV security certificate at ${device.ipAddress} has changed (new fingerprint: ${trustResult.fingerprint.slice(0, 12)}...). Connection blocked for security.`,
              'connection_failed',
            );
          }
        }
      }

      // Stage 3: SSAP Registration / Pairing
      if (!client.isOpen()) {
        const closeError = client.getLastCloseError();
        throw (
          closeError ??
          new TVConnectionError(
            `Connection to TV at ${device.ipAddress} closed before registration could start`,
            'connection_failed',
          )
        );
      }
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(`[SmartRemote][Connect] Stage 3/5: Registering/pairing with TV at ${device.ipAddress}...`);
      }
      await this.pairing().register(client, device.id, {
        onPrompt: () => {
          if (attempt === this.attempt) this.setState(TVConnectionState.Pairing);
        },
      });
      this.assertCurrent(attempt);

      // Stage 4: Service Discovery and Pointer Initialization
      if (!client.isOpen()) {
        const closeError = client.getLastCloseError();
        throw (
          closeError ??
          new TVConnectionError(
            `Connection to TV at ${device.ipAddress} closed after pairing`,
            'connection_failed',
          )
        );
      }
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(`[SmartRemote][Connect] Stage 4/5: Fetching services and pointer support for ${device.ipAddress}...`);
      }
      const services = await this.fetchServices(client);
      this.assertCurrent(attempt);
      const pointerAvailable = await this.tryOpenPointer(client);
      this.assertCurrent(attempt);

      // Stage 5: Connected & Ready
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(`[SmartRemote][Connect] Stage 5/5: Connected successfully to ${device.name} (${device.ipAddress})`);
      }
      this.capabilities = deriveCapabilities(services, pointerAvailable);
      this.setState(TVConnectionState.Connected);
    } catch (e) {
      const cancelled = attempt !== this.attempt;
      if (!cancelled) {
        await this.teardown();
        this.setState(TVConnectionState.Error, e as Error);
      }
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    this.attempt += 1;
    await this.teardown();
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

  // ---- generic remote operations ----

  sendKey(key: RemoteKey): Promise<void> {
    if (key === RemoteKey.Mute) {
      return this.mute();
    }
    const command = LGWebOSCommandMapper.key(key);
    if (!command) {
      return Promise.reject(new TVUnsupportedOperationError(`sendKey(${key})`));
    }
    return this.execute(command, `sendKey(${key})`, keyCapability(key));
  }
  volumeUp() {
    return this.execute(LGWebOSCommandMapper.volumeUp(), 'volumeUp', 'volumeControl');
  }
  volumeDown() {
    return this.execute(LGWebOSCommandMapper.volumeDown(), 'volumeDown', 'volumeControl');
  }
  channelUp() {
    return this.execute(LGWebOSCommandMapper.channelUp(), 'channelUp', 'channelControl');
  }
  channelDown() {
    return this.execute(LGWebOSCommandMapper.channelDown(), 'channelDown', 'channelControl');
  }
  navigate(direction: NavigationDirection) {
    return this.execute(LGWebOSCommandMapper.navigate(direction), 'navigate', 'navigation');
  }
  select() {
    return this.execute(LGWebOSCommandMapper.select(), 'select', 'navigation');
  }
  back() {
    return this.execute(LGWebOSCommandMapper.back(), 'back', 'navigation');
  }
  home() {
    return this.execute(LGWebOSCommandMapper.home(), 'home', 'navigation');
  }
  powerOff() {
    return this.execute(LGWebOSCommandMapper.powerOff(), 'powerOff', 'powerOff');
  }

  /** Toggles mute: reads current state from the TV, then sets the opposite. */
  async mute(): Promise<void> {
    this.requireReady('mute', 'muteControl');
    try {
      const status = await this.request(LGWebOSCommandMapper.audioStatus(), 'mute');
      if (typeof status.mute !== 'boolean') {
        throw new TVConnectionError('TV returned an unexpected audio status');
      }
      await this.request(LGWebOSCommandMapper.setMute(!status.mute), 'mute');
      if (this.capabilities.muteControl === 'unknown') {
        this.capabilities = { ...this.capabilities, muteControl: 'supported' };
      }
    } catch (err) {
      if (err instanceof TVUnsupportedOperationError) {
        this.capabilities = { ...this.capabilities, muteControl: 'unsupported' };
      }
      throw err;
    }
  }

  // ---- optional capabilities ----

  async setVolume(value: number) {
    return await this.execute(LGWebOSCommandMapper.setVolume(value), 'setVolume', 'volumeControl');
  }
  async launchApp(appId: string) {
    return await this.execute(LGWebOSCommandMapper.launchApp(appId), 'launchApp', 'appLaunching');
  }
  async openInput(inputId: string) {
    return await this.execute(LGWebOSCommandMapper.openInput(inputId), 'openInput', 'inputSwitching');
  }
  async sendText(text: string) {
    return await this.execute(LGWebOSCommandMapper.sendText(text), 'sendText', 'keyboardInput');
  }

  async movePointer(deltaX: number, deltaY: number): Promise<void> {
    this.requireReady('movePointer', 'pointerControl');
    try {
      (await this.ensurePointer()).move(deltaX, deltaY);
      if (this.capabilities.pointerControl === 'unknown') {
        this.capabilities = { ...this.capabilities, pointerControl: 'supported' };
      }
    } catch (e) {
      const translated = this.translate(e, 'movePointer');
      if (translated instanceof TVUnsupportedOperationError) {
        this.capabilities = { ...this.capabilities, pointerControl: 'unsupported' };
      }
      throw translated;
    }
  }

  // ---- internals ----

  private pairing(): LGWebOSPairingService {
    return new LGWebOSPairingService(this.deps.credentialStorage, {
      pairingTimeoutMs: this.deps.pairingTimeoutMs,
      scheduler: this.deps.scheduler,
    });
  }

  private newClient(): LGWebOSWebSocketClient {
    return new LGWebOSWebSocketClient(this.socketFactory, {
      connectTimeoutMs: this.deps.connectTimeoutMs,
      requestTimeoutMs: this.deps.requestTimeoutMs,
      scheduler: this.deps.scheduler,
    });
  }

  private async openFirstReachable(host: string, attempt: number): Promise<LGWebOSWebSocketClient> {
    let lastError: unknown;
    const failures: string[] = [];

    for (const endpoint of this.endpoints) {
      this.assertCurrent(attempt);
      const targetUrl = `${endpoint.scheme}://${host}:${endpoint.port}`;
      const client = this.newClient();
      try {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(`[SmartRemote][LGWebOSAdapter] Attempting connection to ${targetUrl}`);
        }
        await client.open(targetUrl);
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(`[SmartRemote][LGWebOSAdapter] Successfully connected to ${targetUrl}`);
        }
        return client;
      } catch (e) {
        lastError = e;
        const msg = e instanceof Error ? e.message : String(e);
        let detail = msg;
        if (endpoint.scheme === 'wss') {
          const tlsStatus = await this.trustManager.getLastStatus();
          if (tlsStatus && (tlsStatus.errorDomain || tlsStatus.errorCode !== 0)) {
            detail = `${msg} [TLS: ${tlsStatus.errorDomain} code ${tlsStatus.errorCode}: ${tlsStatus.errorDescription}]`;
          }
        }
        failures.push(`${endpoint.scheme}:${endpoint.port} (${detail})`);
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(`[SmartRemote][LGWebOSAdapter] Endpoint ${targetUrl} failed: ${detail}`);
        }
      }
    }

    const failureSummary = failures.length > 0 ? ` [${failures.join('; ')}]` : '';
    throw new TVConnectionError(
      `Could not open a connection to the TV${failureSummary} (is it on, on the same network, and "LG Connect Apps" enabled?)`,
      'connection_failed',
      lastError,
    );
  }

  private async fetchServices(client: LGWebOSWebSocketClient): Promise<string[] | null> {
    try {
      return parseServiceNames(await client.request(SSAP_URI.serviceList));
    } catch (e) {
      if (!client.isOpen()) throw e; // connection died; not a "feature missing" case
      return null;
    }
  }

  private async tryOpenPointer(client: LGWebOSWebSocketClient): Promise<boolean> {
    try {
      await this.openPointer(client);
      return true;
    } catch {
      return false;
    }
  }

  private async openPointer(client: LGWebOSWebSocketClient): Promise<LGWebOSPointerClient> {
    const payload = await client.request(SSAP_URI.pointerSocket);
    const path = payload.socketPath;
    if (typeof path !== 'string') {
      throw new TVConnectionError('TV did not return a pointer socket');
    }
    this.pointer?.close();
    const pointer = new LGWebOSPointerClient(this.socketFactory, {
      connectTimeoutMs: this.deps.connectTimeoutMs,
      scheduler: this.deps.scheduler,
    });
    await pointer.connect(path, this.host);
    this.pointer = pointer;
    return pointer;
  }

  private ensurePointer(): Promise<LGWebOSPointerClient> {
    if (this.pointer?.isOpen()) {
      return Promise.resolve(this.pointer);
    }
    const client = this.client;
    if (!client) {
      return Promise.reject(new TVConnectionError('TV is not connected'));
    }
    if (!this.pointerOpening) {
      this.pointerOpening = this.openPointer(client).finally(() => {
        this.pointerOpening = null;
      });
    }
    return this.pointerOpening;
  }

  private requireReady(operation: string, capability: TVCapability): void {
    if (this.state !== TVConnectionState.Connected || !this.client) {
      throw new TVConnectionError('TV is not connected');
    }
    if (this.capabilities[capability] === 'unsupported') {
      throw new TVUnsupportedOperationError(operation, `${capability} not available on this TV`);
    }
  }

  private async execute(
    command: LGWebOSCommand,
    operation: string,
    capability: TVCapability,
  ): Promise<void> {
    this.requireReady(operation, capability);
    if (command.kind === 'ssap') {
      try {
        await this.request(command, operation);
        if (this.capabilities[capability] === 'unknown') {
          this.capabilities = { ...this.capabilities, [capability]: 'supported' };
        }
      } catch (err) {
        if (err instanceof TVUnsupportedOperationError) {
          this.capabilities = { ...this.capabilities, [capability]: 'unsupported' };
        }
        throw err;
      }
      return;
    }
    try {
      (await this.ensurePointer()).sendButton(command.name);
      if (this.capabilities[capability] === 'unknown') {
        this.capabilities = { ...this.capabilities, [capability]: 'supported' };
      }
    } catch (e) {
      const translated = this.translate(e, operation);
      if (translated instanceof TVUnsupportedOperationError) {
        this.capabilities = { ...this.capabilities, [capability]: 'unsupported' };
      }
      throw translated;
    }
  }

  private async request(
    command: LGWebOSCommand,
    operation: string,
  ): Promise<Record<string, unknown>> {
    if (command.kind !== 'ssap' || !this.client) {
      throw new TVConnectionError('TV is not connected');
    }
    try {
      return await this.client.request(command.uri, command.payload);
    } catch (e) {
      throw this.translate(e, operation);
    }
  }

  /** Maps TV-reported errors to domain errors. 404 indicates unsupported operation, while 401 is authorization failure. */
  private translate(error: unknown, operation: string): Error {
    if (error instanceof LGWebOSRequestError) {
      if (error.statusCode === 404) {
        return new TVUnsupportedOperationError(operation, 'the TV does not provide this service');
      }
      if (error.statusCode === 401) {
        return new TVAuthorizationError(`TV denied authorization for ${operation}: ${error.message}`, error);
      }
      return new TVConnectionError(`TV rejected ${operation}: ${error.message}`, 'connection_failed', error);
    }
    return error instanceof Error ? error : new TVConnectionError(`${operation} failed`);
  }

  private handleConnectionLost(client: LGWebOSWebSocketClient, error: Error): void {
    if (client !== this.client) {
      return;
    }
    if (this.state === TVConnectionState.Connected) {
      this.pointer?.close();
      this.pointer = null;
      this.client = null;
      this.setState(TVConnectionState.Error, error);
    } else if (
      this.state === TVConnectionState.Connecting ||
      this.state === TVConnectionState.Pairing
    ) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(`[SmartRemote][Connect] Socket closed during connect/pairing: ${error.message}`);
      }
    }
  }

  private assertCurrent(attempt: number): void {
    if (attempt !== this.attempt) {
      throw new TVConnectionError('Connection cancelled', 'cancelled');
    }
  }

  private async teardown(): Promise<void> {
    this.pointer?.close();
    this.pointer = null;
    this.pointerOpening = null;
    const client = this.client;
    this.client = null; // cleared first so the close notification is not mistaken for a connection loss
    client?.close();
    this.capabilities = createCapabilities();
  }

  private setState(state: TVConnectionState, error?: Error): void {
    if (state === this.state && !error) return;
    this.state = state;
    this.listeners.forEach(l => l(state, error));
  }
}

function keyCapability(key: RemoteKey): TVCapability {
  switch (key) {
    case RemoteKey.VolumeUp:
    case RemoteKey.VolumeDown:
      return 'volumeControl';
    case RemoteKey.Mute:
      return 'muteControl';
    case RemoteKey.ChannelUp:
    case RemoteKey.ChannelDown:
      return 'channelControl';
    case RemoteKey.Power:
      return 'powerOff';
    default:
      return 'navigation';
  }
}
