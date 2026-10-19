import { NavigationDirection, RemoteKey } from '../../../domain/enums/RemoteKey';
import { TVConnectionError } from '../../../domain/errors/TVConnectionError';
import {
  deriveCapabilities,
  LGWebOSCommandMapper as M,
  parseServiceNames,
} from '../../../infrastructure/adapters/lg-webos/LGWebOSCommandMapper';
import { LGWebOSPointerClient } from '../../../infrastructure/adapters/lg-webos/LGWebOSPointerClient';
import { FakeWebOSServer, POINTER_PATH } from '../../../testing/FakeWebOSServer';

describe('LGWebOSCommandMapper', () => {
  it('maps SSAP operations', () => {
    expect(M.volumeUp()).toEqual({ kind: 'ssap', uri: 'ssap://audio/volumeUp', payload: undefined });
    expect(M.channelDown()).toMatchObject({ uri: 'ssap://tv/channelDown' });
    expect(M.powerOff()).toMatchObject({ uri: 'ssap://system/turnOff' });
    expect(M.setMute(true)).toMatchObject({ uri: 'ssap://audio/setMute', payload: { mute: true } });
    expect(M.launchApp('netflix')).toMatchObject({ uri: 'ssap://system.launcher/launch', payload: { id: 'netflix' } });
    expect(M.openInput('HDMI_1')).toMatchObject({ uri: 'ssap://tv/switchInput', payload: { inputId: 'HDMI_1' } });
  });

  it('maps navigation to pointer buttons', () => {
    expect(M.navigate(NavigationDirection.Left)).toEqual({ kind: 'pointer-button', name: 'LEFT' });
    expect(M.select()).toEqual({ kind: 'pointer-button', name: 'ENTER' });
    expect(M.back()).toEqual({ kind: 'pointer-button', name: 'BACK' });
    expect(M.home()).toEqual({ kind: 'pointer-button', name: 'HOME' });
  });

  it('maps generic keys and leaves Mute for adapter-level toggling', () => {
    expect(M.key(RemoteKey.Ok)).toEqual({ kind: 'pointer-button', name: 'ENTER' });
    expect(M.key(RemoteKey.VolumeDown)).toMatchObject({ uri: 'ssap://audio/volumeDown' });
    expect(M.key(RemoteKey.Mute)).toBeNull();
  });

  it('validates arguments', () => {
    expect(() => M.setVolume(101)).toThrow(RangeError);
    expect(() => M.setVolume(1.5)).toThrow(RangeError);
    expect(() => M.launchApp('')).toThrow(RangeError);
    expect(M.setVolume(30)).toMatchObject({ payload: { volume: 30 } });
  });

  it('derives capabilities from reported services, not model names', () => {
    const caps = deriveCapabilities(['audio', 'com.webos.service.ime'], true);
    expect(caps).toMatchObject({
      volumeControl: 'supported',
      muteControl: 'supported',
      channelControl: 'unsupported',
      powerOff: 'unsupported',
      appLaunching: 'unsupported',
      keyboardInput: 'supported',
      navigation: 'supported',
      pointerControl: 'supported',
      powerOn: 'unsupported',
    });
  });

  it('marks unverified capabilities as unknown when service list is unavailable', () => {
    const caps = deriveCapabilities(null, false);
    expect(caps.powerOn).toBe('unsupported');
    expect(caps.navigation).toBe('unknown');
    expect(caps.pointerControl).toBe('unsupported');
    expect(caps.keyboardInput).toBe('unknown');
    expect(caps.volumeControl).toBe('unknown');
    expect(caps.channelControl).toBe('unknown');
  });

  it('parses service lists defensively', () => {
    expect(parseServiceNames({ services: [{ name: 'audio' }, { x: 1 }, 'bad'] })).toEqual(['audio']);
    expect(parseServiceNames({})).toBeNull();
  });
});

describe('LGWebOSPointerClient', () => {
  it('sends button, move and click frames in the network-input text format', async () => {
    const server = new FakeWebOSServer();
    const pointer = new LGWebOSPointerClient(server.factory);
    await pointer.connect(POINTER_PATH, '192.168.0.20');
    pointer.sendButton('HOME');
    pointer.move(10.4, -3.6);
    pointer.click();
    expect(server.pointerFrames).toEqual([
      'type:button\nname:HOME\n\n',
      'type:move\ndx:10\ndy:-4\ndown:0\n\n',
      'type:click\n\n',
    ]);
  });

  it('refuses socket paths pointing at a different host or scheme', async () => {
    const pointer = new LGWebOSPointerClient(new FakeWebOSServer().factory);
    await expect(pointer.connect('ws://10.0.0.5:3000/x.sock', '192.168.0.20')).rejects.toBeInstanceOf(TVConnectionError);
    await expect(pointer.connect('http://192.168.0.20/x', '192.168.0.20')).rejects.toBeInstanceOf(TVConnectionError);
  });

  it('rejects non-finite deltas and writes while closed', async () => {
    const server = new FakeWebOSServer();
    const pointer = new LGWebOSPointerClient(server.factory);
    expect(() => pointer.click()).toThrow(TVConnectionError);
    await pointer.connect(POINTER_PATH, '192.168.0.20');
    expect(() => pointer.move(NaN, 0)).toThrow(RangeError);
  });

  it('notifies on unexpected close', async () => {
    const server = new FakeWebOSServer();
    const pointer = new LGWebOSPointerClient(server.factory);
    await pointer.connect(POINTER_PATH, '192.168.0.20');
    const onClose = jest.fn();
    pointer.onClose(onClose);
    server.dropAll();
    expect(onClose).toHaveBeenCalled();
    expect(pointer.isOpen()).toBe(false);
  });
});
