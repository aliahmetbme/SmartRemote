import { TVConnectionManager } from '../../application/services/TVConnectionManager';
import { TVConnectionState as S } from '../../domain/enums/TVConnectionState';
import { TVConnectionError, TVTimeoutError } from '../../domain/errors/TVConnectionError';
import { TVPairingError } from '../../domain/errors/TVPairingError';
import { TVUnsupportedOperationError } from '../../domain/errors/TVUnsupportedOperationError';
import { ITVAdapterFactory } from '../../domain/interfaces/ITVAdapterFactory';
import { MockTVAdapter, MockTVAdapterOptions } from '../../infrastructure/adapters/mock/MockTVAdapter';
import { makeMockDevice } from '../../testing/fixtures';

/** Factory handing out a pre-built queue of adapters, so tests control each attempt. */
function queueFactory(adapters: MockTVAdapter[]): ITVAdapterFactory & { created: MockTVAdapter[] } {
  const created: MockTVAdapter[] = [];
  return {
    created,
    supports: () => true,
    create: () => {
      const next = adapters.shift();
      if (!next) throw new TVUnsupportedOperationError('connect');
      created.push(next);
      return next;
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function gate() {
  let open!: () => void;
  const promise = new Promise<void>(r => {
    open = r;
  });
  return { promise, open };
}

const mk = (o?: MockTVAdapterOptions) => new MockTVAdapter(o);

describe('TVConnectionManager', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('connects and exposes capabilities only when ready', async () => {
    const manager = new TVConnectionManager(queueFactory([mk()]));
    await manager.connect(makeMockDevice());
    expect(manager.getState()).toBe(S.Connected);
    expect(manager.getSnapshot().capabilities?.volumeControl).toBe('supported');
    expect(manager.getReadyAdapter()).toBeDefined();
  });

  it('refuses to hand out an adapter when not connected', () => {
    const manager = new TVConnectionManager(queueFactory([]));
    expect(() => manager.getReadyAdapter()).toThrow(TVConnectionError);
  });

  it('goes through pairing before connected', async () => {
    const manager = new TVConnectionManager(queueFactory([mk({ requirePairing: true })]));
    const states: S[] = [];
    manager.subscribe(s => states.push(s.state));
    await manager.connect(makeMockDevice());
    expect(states.filter((s, i) => s !== states[i - 1])).toEqual([S.Connecting, S.Pairing, S.Connected]);
  });

  it('surfaces pairing errors and ends in Error state', async () => {
    const manager = new TVConnectionManager(
      queueFactory([mk({ requirePairing: true, rejectPairing: true })]),
    );
    await expect(manager.connect(makeMockDevice())).rejects.toBeInstanceOf(TVPairingError);
    expect(manager.getState()).toBe(S.Error);
    expect(manager.getSnapshot().error).toBeInstanceOf(TVPairingError);
  });

  it('times out a hanging connection and cleans up', async () => {
    const adapter = mk({ connectGate: new Promise<void>(() => undefined) });
    const manager = new TVConnectionManager(queueFactory([adapter]), { connectTimeoutMs: 5000 });
    const result = manager.connect(makeMockDevice()).catch((e: unknown) => e);
    await flush();
    jest.advanceTimersByTime(5000);
    expect(await result).toBeInstanceOf(TVTimeoutError);
    expect(manager.getState()).toBe(S.Error);
    expect(adapter.commands.some(c => c.command === 'disconnect')).toBe(true);
  });

  it('deduplicates concurrent connects to the same device', async () => {
    const g = gate();
    const factory = queueFactory([mk({ connectGate: g.promise })]);
    const manager = new TVConnectionManager(factory);
    const device = makeMockDevice();
    const a = manager.connect(device);
    await flush();
    const b = manager.connect(device);
    g.open();
    await Promise.all([a, b]);
    expect(factory.created).toHaveLength(1);
  });

  it('switching devices disconnects the previous one first and cancels in-flight attempts', async () => {
    const first = mk();
    const second = mk();
    const manager = new TVConnectionManager(queueFactory([first, second]));
    await manager.connect(makeMockDevice({ id: 'a' }));
    await manager.connect(makeMockDevice({ id: 'b' }));
    expect(first.getConnectionState()).toBe(S.Disconnected);
    expect(manager.getDevice()?.id).toBe('b');
    expect(manager.getState()).toBe(S.Connected);
  });

  it('cancels an in-flight connect on disconnect', async () => {
    const g = gate();
    const manager = new TVConnectionManager(queueFactory([mk({ connectGate: g.promise })]));
    const pending = manager.connect(makeMockDevice()).catch((e: unknown) => e);
    await flush();
    await manager.disconnect();
    expect(await pending).toMatchObject({ code: 'cancelled' });
    g.open();
    await flush();
    expect(manager.getState()).toBe(S.Disconnected);
  });

  it('reconnects with exponential backoff after connection loss', async () => {
    const first = mk();
    const failing = mk({ connectError: new TVConnectionError('nope') });
    const recovered = mk();
    const factory = queueFactory([first, failing, recovered]);
    const manager = new TVConnectionManager(factory, {
      reconnect: { baseDelayMs: 1000, maxDelayMs: 30000, maxAttempts: 5 },
    });
    await manager.connect(makeMockDevice());

    first.simulateConnectionLoss();
    expect(manager.getState()).toBe(S.Reconnecting);

    jest.advanceTimersByTime(999);
    expect(factory.created).toHaveLength(1);
    jest.advanceTimersByTime(1);
    await flush();
    expect(factory.created).toHaveLength(2); // failed attempt, still reconnecting
    expect(manager.getState()).toBe(S.Reconnecting);

    jest.advanceTimersByTime(1999);
    expect(factory.created).toHaveLength(2); // second delay is 2000ms
    jest.advanceTimersByTime(1);
    await flush();
    expect(manager.getState()).toBe(S.Connected);
  });

  it('stops after bounded attempts', async () => {
    const first = mk();
    const bad = () => mk({ connectError: new TVConnectionError('nope') });
    const manager = new TVConnectionManager(queueFactory([first, bad(), bad()]), {
      reconnect: { baseDelayMs: 100, maxDelayMs: 100, maxAttempts: 2 },
    });
    await manager.connect(makeMockDevice());
    first.simulateConnectionLoss();
    for (let i = 0; i < 3; i++) {
      jest.advanceTimersByTime(100);
      await flush();
    }
    expect(manager.getState()).toBe(S.Error);
  });

  it('does not retry after an explicit disconnect', async () => {
    const first = mk();
    const factory = queueFactory([first, mk()]);
    const manager = new TVConnectionManager(factory);
    await manager.connect(makeMockDevice());
    first.simulateConnectionLoss();
    await manager.disconnect();
    jest.advanceTimersByTime(60000);
    await flush();
    expect(factory.created).toHaveLength(1);
    expect(manager.getState()).toBe(S.Disconnected);
  });

  it('supports manual reconnect to the last device', async () => {
    const manager = new TVConnectionManager(queueFactory([mk(), mk()]));
    await manager.connect(makeMockDevice());
    await manager.disconnect();
    await manager.reconnect();
    expect(manager.getState()).toBe(S.Connected);
  });

  it('reconnect without a device fails clearly', async () => {
    const manager = new TVConnectionManager(queueFactory([]));
    await expect(manager.reconnect()).rejects.toMatchObject({ code: 'no_device' });
  });

  it('restores on foreground only if a session existed and was not user-disconnected', async () => {
    const first = mk();
    const factory = queueFactory([first, mk(), mk()]);
    const manager = new TVConnectionManager(factory, {
      reconnect: { baseDelayMs: 1000, maxDelayMs: 1000, maxAttempts: 3 },
    });
    await manager.connect(makeMockDevice());
    first.simulateConnectionLoss();
    manager.handleAppBackground();
    await flush();
    expect(manager.getState()).toBe(S.Disconnected);

    manager.handleAppForeground();
    await flush();
    expect(manager.getState()).toBe(S.Connected);

    await manager.disconnect();
    manager.handleAppForeground();
    await flush();
    expect(manager.getState()).toBe(S.Disconnected);
  });

  it('fails with Error state when no adapter supports the device', async () => {
    const manager = new TVConnectionManager(queueFactory([]));
    await expect(manager.connect(makeMockDevice())).rejects.toBeInstanceOf(
      TVUnsupportedOperationError,
    );
    expect(manager.getState()).toBe(S.Error);
  });
});
