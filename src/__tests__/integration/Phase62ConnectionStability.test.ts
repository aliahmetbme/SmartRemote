import { TVConnectionManager } from '../../application/services/TVConnectionManager';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { TVBrand } from '../../domain/enums/TVBrand';
import { TVPlatform } from '../../domain/enums/TVPlatform';
import { TVProtocol } from '../../domain/enums/TVProtocol';
import { TVDevice } from '../../domain/entities/TVDevice';
import { UNKNOWN_CAPABILITIES } from '../../domain/entities/TVCapabilities';
import { PairingStatus } from '../../domain/enums/PairingStatus';
import {
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  LGWebOSAdapter,
} from '../../infrastructure/adapters/lg-webos/LGWebOSAdapter';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';
import { TVConnectionError } from '../../domain/errors/TVConnectionError';
import { IWebSocketCloseEvent, IWebSocketTransport } from '../../infrastructure/adapters/lg-webos/WebSocketTransport';
import { ConnectionDiagnosticsTracker } from '../../infrastructure/diagnostics/ConnectionDiagnostics';

const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

class ControlledWebSocketTransport implements IWebSocketTransport {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: IWebSocketCloseEvent) => void) | null = null;
  sentMessages: string[] = [];
  pingCount = 0;
  pingBehavior: 'success' | 'fail' | 'hang' = 'success';

  send(data: string): void {
    this.sentMessages.push(data);
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'register') {
        Promise.resolve().then(() => {
          this.simulateMessage({
            type: 'registered',
            id: parsed.id || 'register_0',
            payload: { 'client-key': 'test-client-key' },
          });
        });
      } else if (parsed.uri === 'ssap://api/getServiceList') {
        Promise.resolve().then(() => {
          this.simulateMessage({
            type: 'response',
            id: parsed.id,
            payload: { services: [{ name: 'audio' }, { name: 'tv' }, { name: 'system' }] },
          });
        });
      } else if (parsed.uri === 'ssap://audio/volumeUp') {
        Promise.resolve().then(() => {
          this.simulateMessage({
            type: 'response',
            id: parsed.id,
            payload: { returnValue: true },
          });
        });
      } else if (parsed.uri === 'ssap://com.webos.service.networkinput/getPointerInputSocket') {
        Promise.resolve().then(() => {
          this.simulateMessage({
            type: 'error',
            id: parsed.id,
            error: '404',
          });
        });
      } else if (parsed.uri === 'ssap://com.webos.service.connectionmanager/getinfo') {
        Promise.resolve().then(() => {
          this.simulateMessage({
            type: 'response',
            id: parsed.id,
            payload: {
              wifi: { ipAddress: '192.168.1.120', macAddress: 'AA:BB:CC:DD:EE:FF', state: 'connected' },
            },
          });
        });
      }
    } catch {
      // non-json frame
    }
  }

  close(code = 1000, reason = ''): void {
    this.onclose?.({ code, reason });
  }

  async ping(): Promise<void> {
    this.pingCount += 1;
    if (this.pingBehavior === 'fail') {
      throw new Error('Ping failed (no pong from TV)');
    }
    if (this.pingBehavior === 'hang') {
      return new Promise(() => {}); // never resolves to trigger timeout
    }
  }

  simulateOpen(): void {
    this.onopen?.();
  }

  simulateMessage(data: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose(code = 1006, reason = 'Connection dropped', domain = 'NSPOSIXErrorDomain', errorCode = 57): void {
    this.onclose?.({ code, reason, domain, errorCode });
  }
}

describe('Phase 6.2 — iOS WebSocket Connection Stability Suite', () => {
  const testDevice: TVDevice = {
    id: 'lg-qned-70a6a',
    name: 'LG 65QNED70A6A',
    ipAddress: '192.168.1.139',
    brand: TVBrand.LG,
    platform: TVPlatform.WebOS,
    protocol: TVProtocol.LGWebOSSSAP,
    capabilities: UNKNOWN_CAPABILITIES,
    pairingStatus: PairingStatus.Paired,
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('1. Long-Lived SSAP Session & Keepalive Heartbeat', () => {
    it('starts heartbeat ping after reaching Connected state and keeps session alive', async () => {
      let activeTransport: ControlledWebSocketTransport | null = null;

      const adapter = new LGWebOSAdapter({
        credentialStorage: {
          get: jest.fn().mockResolvedValue('test-client-key'),
          set: jest.fn().mockResolvedValue(undefined),
          remove: jest.fn().mockResolvedValue(undefined),
        },
        webSocketFactory: () => {
          activeTransport = new ControlledWebSocketTransport();
          Promise.resolve().then(() => activeTransport?.simulateOpen());
          return activeTransport;
        },
      });

      const connectPromise = adapter.connect(testDevice);
      await flush();
      await connectPromise;

      expect(adapter.getConnectionState()).toBe(TVConnectionState.Connected);
      expect(activeTransport).not.toBeNull();

      // Advance past first heartbeat interval (15s)
      jest.advanceTimersByTime(DEFAULT_HEARTBEAT_INTERVAL_MS + 50);
      await flush();
      expect(activeTransport!.pingCount).toBe(1);

      // Advance again for second heartbeat (30s)
      jest.advanceTimersByTime(DEFAULT_HEARTBEAT_INTERVAL_MS + 50);
      await flush();
      expect(activeTransport!.pingCount).toBe(2);
      expect(adapter.getConnectionState()).toBe(TVConnectionState.Connected);

      await adapter.disconnect();
      expect(adapter.getConnectionState()).toBe(TVConnectionState.Disconnected);
    });

    it('tolerates a single delayed or failed heartbeat ping without disconnecting (bounded tolerance)', async () => {
      let activeTransport: ControlledWebSocketTransport | null = null;

      const adapter = new LGWebOSAdapter({
        credentialStorage: {
          get: jest.fn().mockResolvedValue('test-client-key'),
          set: jest.fn().mockResolvedValue(undefined),
          remove: jest.fn().mockResolvedValue(undefined),
        },
        webSocketFactory: () => {
          activeTransport = new ControlledWebSocketTransport();
          Promise.resolve().then(() => activeTransport?.simulateOpen());
          return activeTransport;
        },
      });

      const connectPromise = adapter.connect(testDevice);
      await flush();
      await connectPromise;

      expect(adapter.getConnectionState()).toBe(TVConnectionState.Connected);

      // Make the first ping fail
      activeTransport!.pingBehavior = 'fail';
      jest.advanceTimersByTime(DEFAULT_HEARTBEAT_INTERVAL_MS + 50);
      await flush();

      // Bounded tolerance: 1 failure is tolerated without breaking connection
      expect(adapter.getConnectionState()).toBe(TVConnectionState.Connected);

      // Next ping succeeds
      activeTransport!.pingBehavior = 'success';
      jest.advanceTimersByTime(DEFAULT_HEARTBEAT_INTERVAL_MS + 50);
      await flush();

      expect(adapter.getConnectionState()).toBe(TVConnectionState.Connected);
      await adapter.disconnect();
    });

    it('triggers clean disconnect after exceeding maximum consecutive heartbeat failures', async () => {
      let activeTransport: ControlledWebSocketTransport | null = null;

      const adapter = new LGWebOSAdapter({
        credentialStorage: {
          get: jest.fn().mockResolvedValue('test-client-key'),
          set: jest.fn().mockResolvedValue(undefined),
          remove: jest.fn().mockResolvedValue(undefined),
        },
        webSocketFactory: () => {
          activeTransport = new ControlledWebSocketTransport();
          Promise.resolve().then(() => activeTransport?.simulateOpen());
          return activeTransport;
        },
      });

      const connectPromise = adapter.connect(testDevice);
      await flush();
      await connectPromise;

      expect(adapter.getConnectionState()).toBe(TVConnectionState.Connected);

      // Consistent ping failures
      activeTransport!.pingBehavior = 'fail';

      // Failure 1: tolerated
      jest.advanceTimersByTime(DEFAULT_HEARTBEAT_INTERVAL_MS + 50);
      await flush();
      expect(adapter.getConnectionState()).toBe(TVConnectionState.Connected);

      // Failure 2 (reaches MAX_CONSECUTIVE_HEARTBEAT_FAILURES = 2): disconnects
      jest.advanceTimersByTime(DEFAULT_HEARTBEAT_INTERVAL_MS + 50);
      await flush();
      expect(adapter.getConnectionState()).toBe(TVConnectionState.Error);

      await adapter.disconnect();
    });

    it('executes remote commands successfully after multiple idle heartbeat intervals', async () => {
      let activeTransport: ControlledWebSocketTransport | null = null;

      const adapter = new LGWebOSAdapter({
        credentialStorage: {
          get: jest.fn().mockResolvedValue('test-client-key'),
          set: jest.fn().mockResolvedValue(undefined),
          remove: jest.fn().mockResolvedValue(undefined),
        },
        webSocketFactory: () => {
          activeTransport = new ControlledWebSocketTransport();
          Promise.resolve().then(() => activeTransport?.simulateOpen());
          return activeTransport;
        },
      });

      const connectPromise = adapter.connect(testDevice);
      await flush();
      await connectPromise;

      // Simulate 60 seconds of idle time (4 heartbeat pings)
      for (let i = 0; i < 4; i++) {
        jest.advanceTimersByTime(DEFAULT_HEARTBEAT_INTERVAL_MS);
        await flush();
      }
      expect(activeTransport!.pingCount).toBe(4);
      expect(adapter.getConnectionState()).toBe(TVConnectionState.Connected);

      // Now send a remote command after idle
      await adapter.volumeUp();
      await adapter.disconnect();
    });
  });

  describe('2. AppState Lifecycle (Background & Foreground)', () => {
    it('pauses heartbeat when app moves to background and resumes upon foreground', async () => {
      const mockAdapter = new MockTVAdapter();
      const manager = new TVConnectionManager({
        supports: () => true,
        create: () => mockAdapter,
      });

      await manager.connect(testDevice);
      expect(manager.getState()).toBe(TVConnectionState.Connected);
      expect(mockAdapter.heartbeatPaused).toBe(false);

      // App moves to background
      manager.handleAppBackground();
      expect(mockAdapter.heartbeatPaused).toBe(true);

      // App returns to foreground with healthy socket
      mockAdapter.checkLivenessResult = true;
      await manager.handleAppForeground();
      expect(mockAdapter.heartbeatPaused).toBe(false);
      expect(manager.getState()).toBe(TVConnectionState.Connected);

      await manager.disconnect();
    });

    it('detects dead socket on foreground and automatically initiates reconnection', async () => {
      let adapterCreatedCount = 0;

      const manager = new TVConnectionManager({
        supports: () => true,
        create: () => {
          adapterCreatedCount++;
          return new MockTVAdapter();
        },
      });

      await manager.connect(testDevice);
      expect(manager.getState()).toBe(TVConnectionState.Connected);

      // App moves to background
      manager.handleAppBackground();

      // Active adapter loses connection while in background
      const activeAdapter = manager.getReadyAdapter() as MockTVAdapter;
      activeAdapter.checkLivenessResult = false;
      activeAdapter.simulateConnectionLoss();

      // Upon returning to foreground
      await manager.handleAppForeground();
      await flush();

      // Automatically recovered session with a fresh adapter
      expect(manager.getState()).toBe(TVConnectionState.Connected);
      expect(adapterCreatedCount).toBeGreaterThanOrEqual(2);

      await manager.disconnect();
    });

    it('cancels pending reconnection attempts when moving to background', async () => {
      const goodAdapter = new MockTVAdapter();
      const manager = new TVConnectionManager(
        {
          supports: () => true,
          create: () => goodAdapter,
        },
        {
          reconnect: { baseDelayMs: 5000, maxDelayMs: 30000, maxAttempts: 5 },
        },
      );

      await manager.connect(testDevice);
      goodAdapter.simulateConnectionLoss();
      expect(manager.getState()).toBe(TVConnectionState.Reconnecting);

      // Moving to background cancels retries and transitions to Disconnected
      manager.handleAppBackground();
      await flush();

      expect(manager.getState()).toBe(TVConnectionState.Disconnected);
    });
  });

  describe('3. Connection Lifecycle & Guard Protections', () => {
    it('prevents duplicate concurrent reconnect storms by returning existing inFlight promise', async () => {
      let connectCount = 0;
      let gateResolve: () => void = () => {};
      const gatePromise = new Promise<void>(res => {
        gateResolve = res;
      });

      const manager = new TVConnectionManager({
        supports: () => true,
        create: () => {
          connectCount++;
          return new MockTVAdapter({
            connectGate: gatePromise,
          });
        },
      });

      const p1 = manager.connect(testDevice);
      const p2 = manager.connect(testDevice);
      const p3 = manager.connect(testDevice);

      expect(p1).toBe(p2);
      expect(p1).toBe(p3);

      gateResolve();
      await flush();
      await p1;

      expect(connectCount).toBe(1);
      expect(manager.getState()).toBe(TVConnectionState.Connected);

      await manager.disconnect();
    });

    it('ensures pointer socket closure does not tear down healthy SSAP connection', async () => {
      let pointerTransport: ControlledWebSocketTransport | null = null;
      let ssapTransport: ControlledWebSocketTransport | null = null;

      const adapter = new LGWebOSAdapter({
        credentialStorage: {
          get: jest.fn().mockResolvedValue('test-client-key'),
          set: jest.fn().mockResolvedValue(undefined),
          remove: jest.fn().mockResolvedValue(undefined),
        },
        webSocketFactory: url => {
          const transport = new ControlledWebSocketTransport();
          if (url.includes('3001') || url.includes('3000')) {
            ssapTransport = transport;
          } else {
            pointerTransport = transport;
          }
          Promise.resolve().then(() => transport.simulateOpen());
          return transport;
        },
      });

      const connectPromise = adapter.connect(testDevice);
      await flush();
      await connectPromise;

      expect(adapter.getConnectionState()).toBe(TVConnectionState.Connected);

      // Simulate pointer socket closing
      if (pointerTransport) {
        (pointerTransport as ControlledWebSocketTransport).simulateClose(1000, 'Normal pointer closure');
      }

      // SSAP session must remain Connected and healthy
      expect(ssapTransport).toBeDefined();
      expect(adapter.getConnectionState()).toBe(TVConnectionState.Connected);

      await adapter.disconnect();
    });

    it('records structured connection diagnostics on session termination without sensitive credentials', async () => {
      const tracker = ConnectionDiagnosticsTracker.getInstance();

      const goodAdapter = new MockTVAdapter();
      const manager = new TVConnectionManager({
        supports: () => true,
        create: () => goodAdapter,
      });

      await manager.connect(testDevice);
      expect(manager.getState()).toBe(TVConnectionState.Connected);

      // Intentional disconnect
      await manager.disconnect();
      expect(manager.getState()).toBe(TVConnectionState.Disconnected);

      // Verify records are clean of credentials
      const records = tracker.getRecords();
      records.forEach(r => {
        expect(JSON.stringify(r)).not.toContain('test-client-key');
        expect(JSON.stringify(r)).not.toContain('pairing');
      });
    });

    it('stops reconnecting when maxAttempts is reached against a powered-off TV', async () => {
      const firstAdapter = new MockTVAdapter();
      // Setup an active connection first using queue
      let attempt = 0;
      const queueManager = new TVConnectionManager(
        {
          supports: () => true,
          create: () => {
            attempt++;
            if (attempt === 1) return firstAdapter;
            return new MockTVAdapter({ connectError: new TVConnectionError('TV Powered Off') });
          },
        },
        {
          reconnect: { baseDelayMs: 100, maxDelayMs: 500, maxAttempts: 3 },
        },
      );

      await queueManager.connect(testDevice);
      expect(queueManager.getState()).toBe(TVConnectionState.Connected);

      // TV goes offline (simulates connection loss)
      firstAdapter.simulateConnectionLoss();
      expect(queueManager.getState()).toBe(TVConnectionState.Reconnecting);

      // Attempt 1 retry
      jest.advanceTimersByTime(100);
      await flush();

      // Attempt 2 retry (delay = 200ms)
      jest.advanceTimersByTime(200);
      await flush();

      // Attempt 3 retry (delay = 400ms)
      jest.advanceTimersByTime(400);
      await flush();

      // After 3 failed attempts, enters Error and stops retrying
      expect(queueManager.getState()).toBe(TVConnectionState.Error);
    });
  });
});
