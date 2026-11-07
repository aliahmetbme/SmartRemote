import { AppState } from 'react-native';
import {
  classifyConnectionFailure,
  isRetryableConnectionFailure,
} from '../../domain/entities/ConnectionDiagnostic';
import {
  TVConnectionError,
  TVTimeoutError,
} from '../../domain/errors/TVConnectionError';
import { TVPairingError } from '../../domain/errors/TVPairingError';
import { createContainer } from '../../di/container';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';
import { makeMockDevice } from '../../testing/fixtures';
import { NETWORK_STATUS_BUDGET_MS } from '../../di/bindConnectionDiagnostics';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';

const flush = async () => {
  for (let i = 0; i < 25; ++i) await Promise.resolve();
};
describe('Evidence-based connection diagnostics', () => {
  let listeners: Set<(state: 'active' | 'background') => void>;
  const dispose: (() => void)[] = [];
  beforeEach(() => {
    jest.useFakeTimers();
    listeners = new Set();
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_name, callback) => {
        listeners.add(callback);
        return {
          remove: () => {
            listeners.delete(callback);
          },
        };
      });
  });
  afterEach(() => {
    dispose.splice(0).forEach(fn => fn());
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  const setup = (
    adapter: MockTVAdapter,
    readNetworkStatus = jest.fn(async () => ({
      wifi: null as boolean | null,
      localTransport: null as boolean | null,
    })),
  ) => {
    const container = createContainer({
      adapterFactory: { create: () => adapter, supports: () => true },
      readNetworkStatus,
    });
    dispose.push(
      container.disposeDiagnostics,
      container.remotePreferences.dispose,
    );
    return container;
  };
  it.each([
    'CONNECTION_REFUSED',
    'TV_UNREACHABLE',
    'DNS_FAILURE',
    'TLS_TRUST_FAILURE',
  ] as const)(
    'preserves allowlisted structured native evidence: %s',
    category => {
      const error = new TVConnectionError(
        'raw secret IP clientKey',
        'connection_failed',
        { diagnosticCode: category, message: 'secret' },
      );
      expect(classifyConnectionFailure(error).category).toBe(category);
      expect(JSON.stringify(classifyConnectionFailure(error))).not.toMatch(
        /secret|clientKey|raw/,
      );
    },
  );
  it.each([
    [-1001, 'CONNECTION_TIMEOUT'],
    [-1004, 'TV_UNREACHABLE'],
    [-1202, 'TLS_TRUST_FAILURE'],
  ])(
    'uses iOS native error code %s without parsing descriptions',
    (code, category) => {
      expect(
        classifyConnectionFailure({ domain: 'NSURLErrorDomain', code })
          .category,
      ).toBe(category);
    },
  );
  it('does not infer power state, stale IP, Wi-Fi or permission denial from messages', () => {
    for (const message of [
      'TV off',
      'permission denied',
      'Wi-Fi unavailable',
      'IP changed',
      'SSL certificate',
    ]) {
      expect(classifyConnectionFailure(new Error(message)).category).toBe(
        'UNKNOWN',
      );
    }
    expect(classifyConnectionFailure(new TVTimeoutError()).category).toBe(
      'CONNECTION_TIMEOUT',
    );
    expect(
      classifyConnectionFailure(new TVTimeoutError()).evidence,
    ).not.toMatch(/off|stale|permission/);
  });
  it('distinguishes explicit rejected registration from generic pairing/storage failure', () => {
    expect(
      classifyConnectionFailure(
        new TVPairingError('rejected', undefined, 'rejected'),
      ).category,
    ).toBe('PAIRING_REJECTED');
    expect(
      classifyConnectionFailure(new TVPairingError('storage failed')).category,
    ).toBe('PAIRING_FAILED');
    expect(
      isRetryableConnectionFailure(
        new TVConnectionError('security', 'tls_trust_failure'),
      ),
    ).toBe(false);
  });
  it('healthy reachable connection performs no diagnostic OS request', async () => {
    const read = jest.fn(async () => ({ wifi: true, localTransport: true }));
    const container = setup(new MockTVAdapter(), read);
    await container.useCases.connectTV.execute(makeMockDevice());
    expect(read).not.toHaveBeenCalled();
    expect(container.store.getState().connection.diagnostic).toBeNull();
  });
  it('reports no local transport only when OS evidence supplies it', async () => {
    const read = jest.fn(async () => ({ wifi: false, localTransport: false }));
    const container = setup(
      new MockTVAdapter({ connectError: new Error('unknown') }),
      read,
    );
    await expect(
      container.useCases.connectTV.execute(makeMockDevice()),
    ).rejects.toThrow();
    await flush();
    expect(container.store.getState().connection.diagnostic).toMatchObject({
      category: 'NETWORK_UNAVAILABLE',
      confidence: 'confirmed',
      network: { wifi: false, localTransport: false },
    });
  });
  it('keeps causes unknown when local permission cannot be detected', async () => {
    const container = setup(
      new MockTVAdapter({
        connectError: new Error('Local network permission denied'),
      }),
    );
    await expect(
      container.useCases.connectTV.execute(makeMockDevice()),
    ).rejects.toThrow();
    await flush();
    expect(container.store.getState().connection.diagnostic?.category).toBe(
      'UNKNOWN',
    );
  });
  it('bounds unavailable OS diagnostics without changing the connection failure', async () => {
    const read = jest.fn(
      () =>
        new Promise<{ wifi: boolean | null; localTransport: boolean | null }>(
          () => {},
        ),
    );
    const container = setup(
      new MockTVAdapter({ connectError: new TVTimeoutError() }),
      read,
    );
    await expect(
      container.useCases.connectTV.execute(makeMockDevice()),
    ).rejects.toThrow();
    jest.advanceTimersByTime(NETWORK_STATUS_BUDGET_MS);
    await flush();
    expect(container.store.getState().connection.diagnostic?.category).toBe(
      'CONNECTION_TIMEOUT',
    );
    expect(
      container.store.getState().connection.diagnostic?.network.wifi,
    ).toBeNull();
  });
  it.each(['background', 'switch', 'success'] as const)(
    'ignores a pending OS diagnostic after %s',
    async interruption => {
      let resolve!: (status: {
        wifi: boolean;
        localTransport: boolean;
      }) => void;
      const read = jest.fn(
        () =>
          new Promise<{ wifi: boolean; localTransport: boolean }>(done => {
            resolve = done;
          }),
      );
      let adapter = new MockTVAdapter({ connectError: new TVTimeoutError() });
      const container = createContainer({
        adapterFactory: { create: () => adapter, supports: () => true },
        readNetworkStatus: read,
      });
      dispose.push(
        container.disposeDiagnostics,
        container.remotePreferences.dispose,
      );
      await expect(
        container.useCases.connectTV.execute(makeMockDevice()),
      ).rejects.toThrow();
      adapter = new MockTVAdapter();
      if (interruption === 'background')
        listeners.forEach(listener => listener('background'));
      else
        await container.useCases.connectTV.execute(
          makeMockDevice({ id: interruption === 'switch' ? 'new' : 'mock-1' }),
        );
      const before = container.store.getState().connection.diagnostic;
      resolve({ wifi: false, localTransport: false });
      await flush();
      expect(container.store.getState().connection.diagnostic).toEqual(before);
      if (interruption !== 'background') expect(before).toBeNull();
    },
  );
  it('automatic retry retains evidence, uses one OS read and stops for non-retryable TLS failure', async () => {
    const first = new MockTVAdapter();
    const second = new MockTVAdapter({
      connectError: new TVConnectionError(
        'verification failed',
        'tls_trust_failure',
      ),
    });
    const read = jest.fn(async () => ({ wifi: true, localTransport: true }));
    let count = 0;
    const container = createContainer({
      adapterFactory: {
        create: () => (++count === 1 ? first : second),
        supports: () => true,
      },
      readNetworkStatus: read,
    });
    dispose.push(
      container.disposeDiagnostics,
      container.remotePreferences.dispose,
    );
    await container.useCases.connectTV.execute(makeMockDevice());
    first.simulateConnectionLoss();
    await flush();
    expect(container.store.getState().connection.diagnostic?.category).toBe(
      'CONNECTION_LOST',
    );
    jest.advanceTimersByTime(1000);
    await flush();
    expect(container.connectionManager.getState()).toBe(
      TVConnectionState.Error,
    );
    expect(container.store.getState().connection.diagnostic?.category).toBe(
      'TLS_TRUST_FAILURE',
    );
    expect(read).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(30000);
    await flush();
    expect(count).toBe(2);
    await container.connectionManager.handleAppForeground();
    expect(count).toBe(2);
  });
  it('disconnect cancels pending automatic retries without a competing recovery loop', async () => {
    const adapter = new MockTVAdapter();
    const factory = { create: jest.fn(() => adapter), supports: () => true };
    const container = createContainer({ adapterFactory: factory });
    dispose.push(
      container.disposeDiagnostics,
      container.remotePreferences.dispose,
    );
    await container.useCases.connectTV.execute(makeMockDevice());
    adapter.simulateConnectionLoss();
    await flush();
    await container.connectionManager.disconnect();
    jest.advanceTimersByTime(30000);
    await flush();
    expect(factory.create).toHaveBeenCalledTimes(1);
  });
});
