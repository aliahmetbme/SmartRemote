import {
  createWebSocketFactory,
  isLGTVWebSocketUrl,
  LGNativeWebSocketTransport,
} from '../../../infrastructure/adapters/lg-webos/WebSocketTransport';

describe('WebSocketTransport & LGNativeWebSocketTransport', () => {
  const originalWebSocket = (globalThis as any).WebSocket;

  beforeAll(() => {
    // Mock global.WebSocket for Node/Jest environment
    (globalThis as any).WebSocket = class MockWebSocket {
      url: string;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onclose: ((event: { code?: number; reason?: string }) => void) | null = null;

      constructor(url: string) {
        this.url = url;
      }
      send(_data: string) {}
      close(_code?: number, _reason?: string) {}
    };
  });

  afterAll(() => {
    (globalThis as any).WebSocket = originalWebSocket;
  });

  describe('isLGTVWebSocketUrl', () => {
    it('identifies LG TV port 3001 secure endpoints', () => {
      expect(isLGTVWebSocketUrl('wss://192.168.1.139:3001')).toBe(true);
      expect(isLGTVWebSocketUrl('wss://10.0.0.5:3001/')).toBe(true);
    });

    it('identifies LG TV port 3000 unsecure endpoints', () => {
      expect(isLGTVWebSocketUrl('ws://192.168.1.139:3000')).toBe(true);
      expect(isLGTVWebSocketUrl('ws://192.168.1.139:3000/')).toBe(true);
    });

    it('identifies local network wss connections without explicit port', () => {
      expect(isLGTVWebSocketUrl('wss://192.168.1.139/pointer')).toBe(true);
      expect(isLGTVWebSocketUrl('wss://10.0.0.12/service')).toBe(true);
    });

    it('rejects public internet or non-LG URLs', () => {
      expect(isLGTVWebSocketUrl('wss://echo.websocket.org')).toBe(false);
      expect(isLGTVWebSocketUrl('ws://localhost:8081')).toBe(false);
      expect(isLGTVWebSocketUrl('https://google.com')).toBe(false);
      expect(isLGTVWebSocketUrl(null as unknown as string)).toBe(false);
    });
  });

  describe('createWebSocketFactory', () => {
    it('returns LGNativeWebSocketTransport when native module is present and URL is LG TV', () => {
      const mockNativeModule = {
        connect: jest.fn(),
        send: jest.fn(),
        close: jest.fn(),
        addListener: jest.fn(),
        removeListeners: jest.fn(),
      };

      const factory = createWebSocketFactory(mockNativeModule);
      const transport = factory('wss://192.168.1.139:3001');

      expect(transport).toBeInstanceOf(LGNativeWebSocketTransport);
      expect(mockNativeModule.connect).toHaveBeenCalledWith(
        expect.any(Number),
        'wss://192.168.1.139:3001',
      );
    });

    it('falls back to reactNativeWebSocketFactory when native module is absent', () => {
      const factory = createWebSocketFactory(null);
      const transport = factory('wss://192.168.1.139:3001');

      expect(transport).not.toBeInstanceOf(LGNativeWebSocketTransport);
    });

    it('falls back to reactNativeWebSocketFactory for non-LG URLs even if native module is present', () => {
      const mockNativeModule = {
        connect: jest.fn(),
        send: jest.fn(),
        close: jest.fn(),
        addListener: jest.fn(),
        removeListeners: jest.fn(),
      };

      const factory = createWebSocketFactory(mockNativeModule);
      const transport = factory('wss://echo.websocket.org');

      expect(transport).not.toBeInstanceOf(LGNativeWebSocketTransport);
      expect(mockNativeModule.connect).not.toHaveBeenCalled();
    });
  });

  describe('LGNativeWebSocketTransport lifecycle & events', () => {
    let mockNativeModule: any;
    let mockEmitter: any;
    let listeners: Record<string, ((event: any) => void)[]>;

    beforeEach(() => {
      listeners = {};
      mockEmitter = {
        addListener: jest.fn((event: string, cb: (e: any) => void) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(cb);
          return {
            remove: jest.fn(() => {
              const idx = listeners[event]?.indexOf(cb) ?? -1;
              if (idx >= 0) listeners[event].splice(idx, 1);
            }),
          };
        }),
      };
      mockNativeModule = {
        connect: jest.fn(),
        send: jest.fn(),
        close: jest.fn(),
      };
    });

    it('triggers onopen when native onLGWebSocketOpen event fires for matching socketId', () => {
      const transport = new LGNativeWebSocketTransport(
        'wss://192.168.1.139:3001',
        mockNativeModule,
        mockEmitter,
      );
      const socketId = transport.getSocketId();

      const onopen = jest.fn();
      transport.onopen = onopen;

      // Fire for wrong socketId -> should be ignored
      listeners.onLGWebSocketOpen?.forEach(cb => cb({ id: socketId + 999 }));
      expect(onopen).not.toHaveBeenCalled();

      // Fire for correct socketId
      listeners.onLGWebSocketOpen?.forEach(cb => cb({ id: socketId }));
      expect(onopen).toHaveBeenCalledTimes(1);
    });

    it('triggers onmessage when native onLGWebSocketMessage event fires', () => {
      const transport = new LGNativeWebSocketTransport(
        'wss://192.168.1.139:3001',
        mockNativeModule,
        mockEmitter,
      );
      const socketId = transport.getSocketId();

      const onmessage = jest.fn();
      transport.onmessage = onmessage;

      listeners.onLGWebSocketMessage?.forEach(cb =>
        cb({ id: socketId, data: '{"type":"response"}' }),
      );

      expect(onmessage).toHaveBeenCalledWith({ data: '{"type":"response"}' });
    });

    it('triggers onerror when native onLGWebSocketError event fires', () => {
      const transport = new LGNativeWebSocketTransport(
        'wss://192.168.1.139:3001',
        mockNativeModule,
        mockEmitter,
      );
      const socketId = transport.getSocketId();

      const onerror = jest.fn();
      transport.onerror = onerror;

      listeners.onLGWebSocketError?.forEach(cb =>
        cb({
          id: socketId,
          message: 'Stream end encountered',
          code: 1001,
          domain: 'NSURLErrorDomain',
        }),
      );

      expect(onerror).toHaveBeenCalledWith({
        message: 'Stream end encountered',
        code: 1001,
        domain: 'NSURLErrorDomain',
      });
    });

    it('triggers onclose and removes subscriptions when closed', () => {
      const transport = new LGNativeWebSocketTransport(
        'wss://192.168.1.139:3001',
        mockNativeModule,
        mockEmitter,
      );
      const socketId = transport.getSocketId();

      const onclose = jest.fn();
      transport.onclose = onclose;

      listeners.onLGWebSocketClosed?.forEach(cb =>
        cb({ id: socketId, code: 1001, reason: 'Stream end encountered' }),
      );

      expect(onclose).toHaveBeenCalledWith({
        code: 1001,
        reason: 'Stream end encountered',
      });

      // Subsequent messages should not trigger callbacks
      const onmessage = jest.fn();
      transport.onmessage = onmessage;
      listeners.onLGWebSocketMessage?.forEach(cb =>
        cb({ id: socketId, data: '{"test":1}' }),
      );
      expect(onmessage).not.toHaveBeenCalled();
    });

    it('sends data through native module', () => {
      const transport = new LGNativeWebSocketTransport(
        'wss://192.168.1.139:3001',
        mockNativeModule,
        mockEmitter,
      );
      const socketId = transport.getSocketId();

      transport.send('{"id":"1","type":"request"}');
      expect(mockNativeModule.send).toHaveBeenCalledWith(socketId, '{"id":"1","type":"request"}');
    });

    it('calls native close and dispatches onclose when close() is invoked', () => {
      const transport = new LGNativeWebSocketTransport(
        'wss://192.168.1.139:3001',
        mockNativeModule,
        mockEmitter,
      );
      const socketId = transport.getSocketId();

      const onclose = jest.fn();
      transport.onclose = onclose;

      transport.close(1000, 'Normal closure');
      expect(mockNativeModule.close).toHaveBeenCalledWith(socketId, 1000, 'Normal closure');
      expect(onclose).toHaveBeenCalledWith({ code: 1000, reason: 'Normal closure' });
    });

    it('handles missing native module gracefully with error and close dispatch', done => {
      const transport = new LGNativeWebSocketTransport('wss://192.168.1.139:3001', null);
      transport.onerror = error => {
        expect(error).toBeDefined();
      };
      transport.onclose = event => {
        expect(event.code).toBe(1006);
        done();
      };
    });
  });
});
