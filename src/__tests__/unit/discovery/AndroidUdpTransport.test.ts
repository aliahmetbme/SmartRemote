import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { NativeUdpSocketTransport } from '../../../infrastructure/discovery/transport/NativeUdpSocketTransport';

describe('Android native UDP discovery boundary', () => {
  const os = Platform.OS;
  let events: Record<string, (...args: any[]) => void>;
  let remove: jest.Mock;
  let native: any;
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    events = {}; remove = jest.fn();
    jest.spyOn(NativeEventEmitter.prototype, 'addListener').mockImplementation((name, listener) => {
      events[String(name)] = listener;
      return { remove };
    });
    native = { bind: jest.fn().mockResolvedValue(49152), send: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined), addListener: jest.fn(), removeListeners: jest.fn() };
    NativeModules.UdpSocketModule = native;
  });
  afterEach(() => {
    jest.restoreAllMocks(); delete NativeModules.UdpSocketModule;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  });
  it('reports missing native support without claiming discovery is available', () => {
    delete NativeModules.UdpSocketModule;
    expect(new NativeUdpSocketTransport().isAvailable()).toBe(false);
  });
  it('forwards Android datagrams and interruptions and releases both subscriptions', async () => {
    const transport = new NativeUdpSocketTransport();
    const received = jest.fn(); const failed = jest.fn();
    transport.onMessage(received); transport.onError(failed);
    expect(await transport.bind()).toBe(49152);
    events.onUdpMessage({ data: 'SSDP', address: '192.168.1.10', port: 1900 });
    expect(received).toHaveBeenCalledWith('SSDP', expect.objectContaining({ address: '192.168.1.10' }));
    events.onUdpError({ error: 'Wi-Fi disconnected' });
    expect(failed).toHaveBeenCalledWith(expect.objectContaining({ code: 'network_unavailable' }));
    await transport.close();
    expect(remove).toHaveBeenCalledTimes(2); expect(native.close).toHaveBeenCalledTimes(1);
    await expect(transport.send('query', 1900, '239.255.255.250')).rejects.toThrow('before binding');
  });
  it('cleans up listeners and gives actionable Wi-Fi guidance when binding fails', async () => {
    native.bind.mockRejectedValue(new Error('network permission denied'));
    const transport = new NativeUdpSocketTransport();
    await expect(transport.bind()).rejects.toMatchObject({ code: 'network_unavailable', message: expect.stringContaining('Settings') });
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
