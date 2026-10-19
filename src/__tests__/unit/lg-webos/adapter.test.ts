import { TVConnectionManager } from '../../../application/services/TVConnectionManager';
import { SendRemoteCommandUseCase } from '../../../application/usecases/SendRemoteCommandUseCase';
import { NavigationDirection, RemoteKey } from '../../../domain/enums/RemoteKey';
import { TVConnectionState as S } from '../../../domain/enums/TVConnectionState';
import { TVConnectionError } from '../../../domain/errors/TVConnectionError';
import { TVPairingError } from '../../../domain/errors/TVPairingError';
import { TVUnsupportedOperationError } from '../../../domain/errors/TVUnsupportedOperationError';
import { supportsPowerOn } from '../../../domain/interfaces/ITVRemoteAdapter';
import { createContainer } from '../../../di/container';
import { LGTVCertificateTrustManager } from '../../../infrastructure/adapters/lg-webos/LGTVCertificateTrustManager';
import { LGWebOSAdapter } from '../../../infrastructure/adapters/lg-webos/LGWebOSAdapter';
import {
  createDefaultAdapterFactory,
  createLGWebOSRegistration,
  TVAdapterFactory,
} from '../../../infrastructure/factories/TVAdapterFactory';
import { InMemoryCredentialStorage } from '../../../infrastructure/storage/InMemoryCredentialStorage';
import { FakeWebOSServer, FakeWebOSServerOptions } from '../../../testing/FakeWebOSServer';
import { makeMockDevice, makeWebOSDevice } from '../../../testing/fixtures';

const device = makeWebOSDevice({ ipAddress: '192.168.0.20' });

function setup(options?: FakeWebOSServerOptions, credentialStorage = new InMemoryCredentialStorage()) {
  const server = new FakeWebOSServer(options);
  const adapter = new LGWebOSAdapter({ credentialStorage, webSocketFactory: server.factory });
  return { server, adapter, credentialStorage };
}

describe('LGWebOSAdapter connection', () => {
  it('connects, pairs, stores the key, and reports capabilities', async () => {
    const { adapter, credentialStorage } = setup();
    const states: S[] = [];
    adapter.onConnectionStateChange(s => states.push(s));
    await adapter.connect(device);
    expect(states).toEqual([S.Connecting, S.Pairing, S.Connected]);
    expect(await credentialStorage.get(device.id)).toBe('client-key-123');
    expect(adapter.getCapabilities()).toMatchObject({
      volumeControl: 'supported',
      channelControl: 'supported',
      navigation: 'supported',
      pointerControl: 'supported',
      powerOff: 'supported',
      keyboardInput: 'supported',
      powerOn: 'unsupported',
    });
  });

  it('skips the pairing state when a key is already stored', async () => {
    const storage = new InMemoryCredentialStorage();
    await storage.set(device.id, 'client-key-123');
    const { adapter } = setup(undefined, storage);
    const states: S[] = [];
    adapter.onConnectionStateChange(s => states.push(s));
    await adapter.connect(device);
    expect(states).toEqual([S.Connecting, S.Connected]);
  });

  it('falls back from wss:3001 to ws:3000', async () => {
    const { adapter, server } = setup({ reachable: url => url.startsWith('ws://') });
    await adapter.connect(device);
    expect(server.opened[0]).toBe('wss://192.168.0.20:3001');
    expect(server.opened[1]).toBe('ws://192.168.0.20:3000');
    expect(adapter.getConnectionState()).toBe(S.Connected);
  });

  it('fails with a connection error when no endpoint is reachable and reports endpoint diagnostics', async () => {
    const { adapter } = setup({ reachable: () => false });
    let thrownError: unknown;
    try {
      await adapter.connect(device);
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeInstanceOf(TVConnectionError);
    expect((thrownError as Error).message).toContain('ws:3000');
    expect((thrownError as Error).message).toContain('wss:3001');
    expect(adapter.getConnectionState()).toBe(S.Error);
  });

  it('connects directly when only wss:3001 endpoint is configured', async () => {
    const server = new FakeWebOSServer();
    const adapter = new LGWebOSAdapter({
      credentialStorage: new InMemoryCredentialStorage(),
      webSocketFactory: server.factory,
      endpoints: [{ scheme: 'wss', port: 3001 }],
    });
    await adapter.connect(device);
    expect(server.opened[0]).toBe('wss://192.168.0.20:3001');
    expect(adapter.getConnectionState()).toBe(S.Connected);
  });

  it('rejects connection if certificate fingerprint has changed', async () => {
    const storage = new InMemoryCredentialStorage();
    await storage.set(`tls_fp_${device.id}`, 'OLD_FINGERPRINT_123');

    const fakeTrustManager = new LGTVCertificateTrustManager(storage, {
      getLastTLSStatus: async () => ({
        domain: device.ipAddress,
        validationSuccess: true,
        leafSummary: 'LGE TV SSG',
        leafFingerprint: 'NEW_FINGERPRINT_456',
        errorDomain: '',
        errorCode: 0,
        errorDescription: '',
      }),
    });

    const server = new FakeWebOSServer();
    const adapter = new LGWebOSAdapter({
      credentialStorage: storage,
      webSocketFactory: server.factory,
      trustManager: fakeTrustManager,
    });

    await expect(adapter.connect(device)).rejects.toThrow('certificate at 192.168.0.20 has changed');
    expect(adapter.getConnectionState()).toBe(S.Error);
  });

  it('enriches endpoint failure message with native TLS error domain and code when available', async () => {
    const storage = new InMemoryCredentialStorage();
    const fakeTrustManager = new LGTVCertificateTrustManager(storage, {
      getLastTLSStatus: async () => ({
        domain: device.ipAddress,
        validationSuccess: false,
        leafSummary: 'LGE TV SSG',
        leafFingerprint: '',
        errorDomain: 'NSURLErrorDomain',
        errorCode: -1202,
        errorDescription: 'The certificate for this server is invalid.',
      }),
    });

    const server = new FakeWebOSServer({ reachable: () => false });
    const adapter = new LGWebOSAdapter({
      credentialStorage: storage,
      webSocketFactory: server.factory,
      trustManager: fakeTrustManager,
    });

    let error: unknown;
    try {
      await adapter.connect(device);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TVConnectionError);
    expect((error as Error).message).toContain('NSURLErrorDomain code -1202');
  });

  it('fails fast with a descriptive TLS error if native TLS validation failed, rather than masking it with "SSAP socket is not open"', async () => {
    const storage = new InMemoryCredentialStorage();
    const fakeTrustManager = new LGTVCertificateTrustManager(storage, {
      getLastTLSStatus: async () => ({
        domain: device.ipAddress,
        validationSuccess: false,
        leafSummary: 'Untrusted Server',
        leafFingerprint: 'FP123',
        errorDomain: 'NSOSStatusErrorDomain',
        errorCode: -25318,
        errorDescription: 'The attempt to create a certificate chain failed.',
      }),
    });

    const server = new FakeWebOSServer();
    const adapter = new LGWebOSAdapter({
      credentialStorage: storage,
      webSocketFactory: server.factory,
      trustManager: fakeTrustManager,
    });

    let error: unknown;
    try {
      await adapter.connect(device);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TVConnectionError);
    expect((error as Error).message).toContain('TLS certificate validation failed for 192.168.0.20');
    expect((error as Error).message).toContain('The attempt to create a certificate chain failed');
    expect((error as Error).message).not.toContain('SSAP socket is not open');
    expect(adapter.getConnectionState()).toBe(S.Error);
  });

  it('fails fast if the socket closes before registration begins rather than masking it', async () => {
    const server = new FakeWebOSServer();
    const storage = new InMemoryCredentialStorage();
    const adapter = new LGWebOSAdapter({
      credentialStorage: storage,
      webSocketFactory: server.factory,
      trustManager: new LGTVCertificateTrustManager(storage, {
        getLastTLSStatus: async () => {
          // Socket drops after transport open but before registration starts
          server.dropAll('Remote TV dropped connection');
          return {
            domain: device.ipAddress,
            validationSuccess: true,
            leafSummary: 'LGE TV SSG',
            leafFingerprint: '',
            errorDomain: '',
            errorCode: 0,
            errorDescription: '',
          };
        },
      }),
    });

    let error: unknown;
    try {
      await adapter.connect(device);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TVConnectionError);
    expect((error as Error).message).toContain('Remote TV dropped connection');
    expect(adapter.getConnectionState()).toBe(S.Error);
  });

  it('fails with a pairing error when denied and leaves no credential', async () => {
    const { adapter, credentialStorage } = setup({ denyPairing: true });
    await expect(adapter.connect(device)).rejects.toBeInstanceOf(TVPairingError);
    expect(adapter.getConnectionState()).toBe(S.Error);
    expect(await credentialStorage.get(device.id)).toBeNull();
  });

  it('refuses devices that are not LG webOS', async () => {
    const { adapter } = setup();
    await expect(adapter.connect(makeMockDevice())).rejects.toBeInstanceOf(TVUnsupportedOperationError);
  });

  it('rejects malformed host strings', async () => {
    const { adapter } = setup();
    await expect(adapter.connect({ ...device, ipAddress: '1.2.3.4/evil?x' })).rejects.toBeInstanceOf(TVConnectionError);
  });

  it('cancels cleanly when disconnected during pairing', async () => {
    const { adapter, server } = setup({ manualPairing: true });
    const pending = adapter.connect(device).catch((e: unknown) => e);
    await new Promise<void>(r => setImmediate(() => r()));
    await adapter.disconnect();
    expect(await pending).toBeDefined();
    expect(adapter.getConnectionState()).toBe(S.Disconnected);
    expect(server.sockets.size).toBe(0);
  });

  it('keeps the stored key after disconnect', async () => {
    const { adapter, credentialStorage } = setup();
    await adapter.connect(device);
    await adapter.disconnect();
    expect(await credentialStorage.get(device.id)).toBe('client-key-123');
    expect(adapter.getCapabilities().volumeControl).toBe('unsupported');
  });

  it('does not expose powerOn', () => {
    expect(supportsPowerOn(setup().adapter)).toBe(false);
  });

  it('reports connection loss as Error', async () => {
    const { adapter, server } = setup();
    await adapter.connect(device);
    const listener = jest.fn();
    adapter.onConnectionStateChange(listener);
    server.dropAll('tv off');
    expect(listener).toHaveBeenCalledWith(S.Error, expect.any(TVConnectionError));
  });
});

describe('LGWebOSAdapter commands', () => {
  it('sends the mapped SSAP requests', async () => {
    const { adapter, server } = setup();
    await adapter.connect(device);
    await adapter.volumeUp();
    await adapter.volumeDown();
    await adapter.channelUp();
    await adapter.channelDown();
    await adapter.powerOff();
    await adapter.setVolume(15);
    await adapter.launchApp('youtube.leanback.v4');
    await adapter.openInput('HDMI_2');
    await adapter.sendText('abc');
    await adapter.sendKey(RemoteKey.VolumeUp);
    const sent = server.requests.map(r => r.uri).filter(u => !u.includes('getServiceList') && !u.includes('getPointer'));
    expect(sent).toEqual([
      'ssap://audio/volumeUp',
      'ssap://audio/volumeDown',
      'ssap://tv/channelUp',
      'ssap://tv/channelDown',
      'ssap://system/turnOff',
      'ssap://audio/setVolume',
      'ssap://system.launcher/launch',
      'ssap://tv/switchInput',
      'ssap://com.webos.service.ime/insertText',
      'ssap://audio/volumeUp',
    ]);
    expect(server.requests.find(r => r.uri.endsWith('setVolume'))?.payload).toEqual({ volume: 15 });
  });

  it('sends navigation through the pointer socket, not SSAP', async () => {
    const { adapter, server } = setup();
    await adapter.connect(device);
    const before = server.requests.length;
    await adapter.navigate(NavigationDirection.Up);
    await adapter.select();
    await adapter.back();
    await adapter.home();
    await adapter.sendKey(RemoteKey.Right);
    await adapter.movePointer(5, 6);
    expect(server.requests.length).toBe(before);
    expect(server.pointerFrames).toEqual([
      'type:button\nname:UP\n\n',
      'type:button\nname:ENTER\n\n',
      'type:button\nname:BACK\n\n',
      'type:button\nname:HOME\n\n',
      'type:button\nname:RIGHT\n\n',
      'type:move\ndx:5\ndy:6\ndown:0\n\n',
    ]);
  });

  it('toggles mute based on the TV state', async () => {
    const { adapter, server } = setup({ muted: false });
    await adapter.connect(device);
    await adapter.mute();
    expect(server.muted).toBe(true);
    await adapter.sendKey(RemoteKey.Mute);
    expect(server.muted).toBe(false);
  });

  it('maps a 404 from the TV to TVUnsupportedOperationError', async () => {
    const { adapter } = setup({ unsupportedUris: ['ssap://tv/channelUp'] });
    await adapter.connect(device);
    await expect(adapter.channelUp()).rejects.toBeInstanceOf(TVUnsupportedOperationError);
  });

  it('refuses operations the TV did not report (no request is sent)', async () => {
    const { adapter, server } = setup({ services: ['audio'] });
    await adapter.connect(device);
    const before = server.requests.length;
    await expect(adapter.channelUp()).rejects.toBeInstanceOf(TVUnsupportedOperationError);
    await expect(adapter.launchApp('x')).rejects.toBeInstanceOf(TVUnsupportedOperationError);
    await expect(adapter.sendText('x')).rejects.toBeInstanceOf(TVUnsupportedOperationError);
    expect(server.requests.length).toBe(before);
  });

  it('disables navigation and pointer when the TV offers no pointer socket', async () => {
    const { adapter } = setup({ pointerSocketPath: null });
    await adapter.connect(device);
    expect(adapter.getCapabilities().navigation).toBe('unsupported');
    await expect(adapter.home()).rejects.toBeInstanceOf(TVUnsupportedOperationError);
    await expect(adapter.movePointer(1, 1)).rejects.toBeInstanceOf(TVUnsupportedOperationError);
    await expect(adapter.volumeUp()).resolves.toBeUndefined();
  });

  it('treats a pointer socket on another host as unavailable', async () => {
    const { adapter } = setup({ pointerSocketPath: 'ws://10.9.9.9:3000/netinput_pointer.sock' });
    await adapter.connect(device);
    expect(adapter.getCapabilities().navigation).toBe('unsupported');
  });

  it('reopens a dropped pointer socket on demand', async () => {
    const { adapter, server } = setup();
    await adapter.connect(device);
    server.pointerSockets()[0].drop();
    await adapter.home();
    expect(server.pointerFrames).toEqual(['type:button\nname:HOME\n\n']);
    expect(adapter.getConnectionState()).toBe(S.Connected);
  });

  it('rejects commands when not connected', async () => {
    const { adapter } = setup();
    await expect(adapter.volumeUp()).rejects.toBeInstanceOf(TVConnectionError);
  });

  it('rejects invalid arguments', async () => {
    const { adapter } = setup();
    await adapter.connect(device);
    await expect(adapter.setVolume(500)).rejects.toBeInstanceOf(RangeError);
  });
});

describe('integration with factory, manager and use cases', () => {
  it('is selected by the factory only when LG dependencies are supplied', () => {
    expect(createDefaultAdapterFactory().supports(device)).toBe(false);
    const factory = createDefaultAdapterFactory({
      lgWebOS: { credentialStorage: new InMemoryCredentialStorage() },
    });
    expect(factory.supports(device)).toBe(true);
    expect(factory.create(device)).toBeInstanceOf(LGWebOSAdapter);
    expect(factory.supports(makeMockDevice())).toBe(true);
  });

  it('works end to end through the container, including capability-gated commands', async () => {
    const server = new FakeWebOSServer();
    const adapterFactory = new TVAdapterFactory().register(
      createLGWebOSRegistration({
        credentialStorage: new InMemoryCredentialStorage(),
        webSocketFactory: server.factory,
      }),
    );
    const { useCases, store } = createContainer({ adapterFactory });
    await useCases.pairTV.execute(device);
    expect(store.getState().connection.status).toBe(S.Connected);
    expect(store.getState().tv.capabilities?.navigation).toBe('supported');
    await useCases.sendRemoteCommand.execute({ type: 'volumeUp' });
    await expect(useCases.sendRemoteCommand.execute({ type: 'powerOn' })).rejects.toBeInstanceOf(
      TVUnsupportedOperationError,
    );
  });

  describe('reconnection after the TV drops the connection', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('lets the connection manager reconnect with the stored key', async () => {
      const server = new FakeWebOSServer();
      const storage = new InMemoryCredentialStorage();
      const factory = createDefaultAdapterFactory({
        lgWebOS: { credentialStorage: storage, webSocketFactory: server.factory },
      });
      const manager = new TVConnectionManager(factory, {
        reconnect: { baseDelayMs: 1000, maxDelayMs: 1000, maxAttempts: 3 },
      });
      await manager.connect(device);
      server.dropAll('network blip');
      expect(manager.getState()).toBe(S.Reconnecting);

      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(10);
      expect(manager.getState()).toBe(S.Connected);
      expect(server.registrations[1]['client-key']).toBe('client-key-123');
      await new SendRemoteCommandUseCase(manager).execute({ type: 'volumeUp' });
    });
  });
});
