import { Platform } from 'react-native';
import { createContainer } from '../../di/container';
import { createDefaultAdapterFactory } from '../../infrastructure/factories/TVAdapterFactory';
import { InMemoryCredentialStorage } from '../../infrastructure/storage/InMemoryCredentialStorage';
import { FakeWebOSServer } from '../../testing/FakeWebOSServer';
import { makeWebOSDevice } from '../../testing/fixtures';
import { NavigationDirection } from '../../domain/enums/RemoteKey';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { DiscoveryManager } from '../../application/services/DiscoveryManager';
import { DiscoverTVsUseCase } from '../../application/usecases/DiscoverTVsUseCase';

// All TV communication here is simulated. No Android TLS or physical LG claim is made.
describe('Android shared remote foundation', () => {
  const os = Platform.OS;
  beforeEach(() => Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' }));
  afterEach(() => Object.defineProperty(Platform, 'OS', { configurable: true, value: os }));

  it('uses WSS-only SSAP defaults, pairs, executes core controls and reconnects with saved credentials', async () => {
    const server = new FakeWebOSServer({ pointerSocketPath: 'wss://192.168.0.20:3001/resources/netinput_pointer.sock' });
    const credentials = new InMemoryCredentialStorage();
    const factory = createDefaultAdapterFactory({ lgWebOS: { credentialStorage: credentials, webSocketFactory: server.factory } });
    const container = createContainer({ adapterFactory: factory, credentialStorage: credentials });
    const device = makeWebOSDevice({ ipAddress: '192.168.0.20' });
    try {
      await container.useCases.connectTV.execute(device);
      expect(container.connectionManager.getState()).toBe(TVConnectionState.Connected);
      expect(server.opened.every(url => url.startsWith('wss://'))).toBe(true);
      const send = container.useCases.sendRemoteCommand;
      for (const direction of Object.values(NavigationDirection)) await send.execute({ type: 'navigate', direction });
      for (const type of ['home', 'back', 'select', 'volumeUp', 'volumeDown', 'mute', 'channelUp', 'channelDown'] as const) {
        await send.execute({ type });
      }
      await send.execute({ type: 'digit', digit: 4 });
      await send.execute({ type: 'digit', digit: 2 });
      await send.execute({ type: 'movePointer', deltaX: 8, deltaY: -5 });
      for (const appId of ['youtube.leanback.v4', 'netflix', 'amazon']) await send.execute({ type: 'launchApp', appId });
      await send.execute({ type: 'openInput', inputId: 'HDMI_2' });
      expect(server.pointerFrames).toEqual(expect.arrayContaining([
        'type:button\nname:UP\n\n', 'type:button\nname:DOWN\n\n',
        'type:button\nname:LEFT\n\n', 'type:button\nname:RIGHT\n\n',
        'type:button\nname:ENTER\n\n', 'type:button\nname:HOME\n\n',
        'type:button\nname:BACK\n\n', 'type:move\ndx:8\ndy:-5\ndown:0\n\n',
      ]));
      expect(server.pointerFrames.filter(frame => /name:[0-9]/.test(frame))).toEqual([
        'type:button\nname:4\n\n', 'type:button\nname:2\n\n',
      ]);
      expect(server.requests.map(r => r.uri)).toEqual(expect.arrayContaining([
        'ssap://audio/volumeUp', 'ssap://audio/volumeDown', 'ssap://audio/setMute',
        'ssap://tv/channelUp', 'ssap://tv/channelDown', 'ssap://tv/switchInput',
      ]));
      await send.execute({ type: 'powerOff' });
      expect(server.requests.some(r => r.uri === 'ssap://system/turnOff')).toBe(true);
      await container.connectionManager.disconnect();
      await container.useCases.connectTV.execute(device);
      expect(server.registrations[1]['client-key']).toBe(server.clientKey);
      expect(await container.deviceRepository.getById(device.id)).toMatchObject({ id: device.id });
    } finally { await container.connectionManager.disconnect(); }
  });

  it('does not try plaintext when the Android WSS endpoint fails', async () => {
    const server = new FakeWebOSServer({ reachable: () => false });
    const factory = createDefaultAdapterFactory({ lgWebOS: {
      credentialStorage: new InMemoryCredentialStorage(), webSocketFactory: server.factory,
    } });
    await expect(factory.create(makeWebOSDevice()).connect(makeWebOSDevice())).rejects.toThrow('Could not open');
    expect(server.opened).toHaveLength(1);
    expect(server.opened[0]).toMatch(/^wss:/);
  });

  it('does not let an old discovery completion overwrite a newer scan', async () => {
    const resolves: Array<(devices: ReturnType<typeof makeWebOSDevice>[]) => void> = [];
    const service = { discover: jest.fn(() => new Promise<ReturnType<typeof makeWebOSDevice>[]>(resolve => resolves.push(resolve))) };
    const found = jest.fn();
    const manager = new DiscoveryManager(new DiscoverTVsUseCase(service), { onDeviceDiscovered: found });
    const old = manager.startDiscovery();
    const current = manager.startDiscovery();
    resolves[0]([makeWebOSDevice()]); await old;
    expect(manager.getIsScanning()).toBe(true); expect(found).not.toHaveBeenCalled();
    resolves[1]([]); await current;
    expect(manager.getIsScanning()).toBe(false);
  });
});
