import { NativeModules, Platform } from 'react-native';
import {
  createWebSocketFactory, LGNativeWebSocketTransport,
} from '../../../infrastructure/adapters/lg-webos/WebSocketTransport';
import { ManualIPDiscoveryStrategy } from '../../../infrastructure/discovery/discovery-strategies/ManualIPDiscoveryStrategy';

// Bridge tests validate routing/lifecycle only; Kotlin JVM tests validate certificate policy.
describe('Android secure LG transport', () => {
  const originalOS = Platform.OS;
  let events: Record<string, (e: any) => void>;
  let removed: jest.Mock;
  let native: any;
  let emitter: any;
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    events = {};
    removed = jest.fn();
    emitter = { addListener: jest.fn((name, cb) => { events[name] = cb; return { remove: removed }; }) };
    native = { connect: jest.fn(), send: jest.fn(), close: jest.fn(),
      getTLSStatus: jest.fn().mockResolvedValue({ domain: '192.168.1.10', validationSuccess: true, leafFingerprint: 'fixture' }),
      addListener: jest.fn(), removeListeners: jest.fn() };
    jest.useFakeTimers();
  });
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
    delete NativeModules.LGAndroidWebSocketModule;
    jest.clearAllTimers(); jest.useRealTimers();
  });
  it('automatically selects the Android bridge with socket-scoped TLS status', async () => {
    NativeModules.LGAndroidWebSocketModule = native;
    const socket = createWebSocketFactory(undefined, emitter)('wss://192.168.1.10:3001') as LGNativeWebSocketTransport;
    expect(native.connect).toHaveBeenCalledWith(socket.getSocketId(), 'wss://192.168.1.10:3001');
    expect(await socket.getTLSStatus()).toMatchObject({ validationSuccess: true });
    expect(native.getTLSStatus).toHaveBeenCalledWith(socket.getSocketId());
    expect(socket.ping).toBeUndefined();
    socket.close(); expect(removed).toHaveBeenCalledTimes(4);
  });
  it.each(['ws://192.168.1.10:3000', 'ws://192.168.1.10:9876/pointer'])('blocks plaintext downgrade: %s', url => {
    expect(() => createWebSocketFactory(native, emitter)(url)).toThrow('plaintext');
    expect(native.connect).not.toHaveBeenCalled();
  });
  it('fails closed if the secure Android module is missing', () => {
    expect(() => createWebSocketFactory(null)('wss://192.168.1.10:3001')).toThrow('unavailable');
  });
  it('isolates socket generations and cleans up failure events', () => {
    const factory = createWebSocketFactory(native, emitter);
    const first = factory('wss://192.168.1.10:3001') as LGNativeWebSocketTransport;
    const opened = jest.fn(); const failed = jest.fn(); const closed = jest.fn();
    first.onopen = opened; first.onerror = failed; first.onclose = closed;
    events.onLGWebSocketOpen({ id: first.getSocketId() + 1 }); expect(opened).not.toHaveBeenCalled();
    events.onLGWebSocketOpen({ id: first.getSocketId() }); expect(opened).toHaveBeenCalledTimes(1);
    events.onLGWebSocketError({ id: first.getSocketId(), message: 'TLS rejected' });
    events.onLGWebSocketClosed({ id: first.getSocketId(), code: 1006 });
    expect(failed).toHaveBeenCalledTimes(1); expect(closed).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledTimes(4);
    events.onLGWebSocketOpen({ id: first.getSocketId() }); expect(opened).toHaveBeenCalledTimes(1);
    const next = factory('wss://192.168.1.10:3001') as LGNativeWebSocketTransport;
    expect(next.getSocketId()).not.toBe(first.getSocketId()); next.close();
  });
  it('manual IP uses WSS exclusively and releases the probing socket', async () => {
    NativeModules.LGAndroidWebSocketModule = native;
    native.connect.mockImplementation((id: number) => {
      // RN emitter tests are separate; a successful probe is triggered through the module emitter.
      native.id = id;
    });
    const strategy = new ManualIPDiscoveryStrategy();
    const pending = strategy.probe('192.168.1.10', { timeoutMs: 100 });
    expect(native.connect).toHaveBeenCalledWith(expect.any(Number), 'wss://192.168.1.10:3001');
    const result = pending.catch(error => error);
    jest.advanceTimersByTime(100);
    expect(await result).toMatchObject({ code: 'unsupported_device' });
    expect(native.close).toHaveBeenCalledWith(native.id, 1000, '');
    expect(native.connect).toHaveBeenCalledTimes(1);
  });
});
