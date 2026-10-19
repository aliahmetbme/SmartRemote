import { TVConnectionError, TVTimeoutError } from '../../../domain/errors/TVConnectionError';
import {
  LGWebOSRequestError,
  LGWebOSWebSocketClient,
  parseSSAPMessage,
} from '../../../infrastructure/adapters/lg-webos/LGWebOSWebSocketClient';
import { IWebSocketTransport } from '../../../infrastructure/adapters/lg-webos/WebSocketTransport';
import { FakeWebOSServer } from '../../../testing/FakeWebOSServer';

const URL = 'ws://192.168.0.20:3000';

describe('parseSSAPMessage', () => {
  it('accepts valid frames and rejects malformed ones', () => {
    expect(parseSSAPMessage('{"type":"response","id":"a","payload":{}}')).toMatchObject({ type: 'response' });
    expect(parseSSAPMessage('not json')).toBeNull();
    expect(parseSSAPMessage('[]')).toBeNull();
    expect(parseSSAPMessage('{"id":"a"}')).toBeNull();
    expect(parseSSAPMessage('{"type":"response","id":5}')).toBeNull();
    expect(parseSSAPMessage('{"type":"response","payload":"x"}')).toBeNull();
    expect(parseSSAPMessage(42)).toBeNull();
  });
});

describe('LGWebOSWebSocketClient', () => {
  it('opens and correlates responses by id', async () => {
    const server = new FakeWebOSServer();
    const client = new LGWebOSWebSocketClient(server.factory);
    await client.open(URL);
    const [a, b] = await Promise.all([
      client.request('ssap://audio/getStatus'),
      client.request('ssap://audio/volumeUp'),
    ]);
    expect(a).toMatchObject({ returnValue: true, mute: false });
    expect(b).toMatchObject({ returnValue: true });
    expect(server.requests.map(r => r.uri)).toEqual(['ssap://audio/getStatus', 'ssap://audio/volumeUp']);
  });

  it('fails to open when the TV is unreachable', async () => {
    const server = new FakeWebOSServer({ reachable: () => false });
    const client = new LGWebOSWebSocketClient(server.factory);
    await expect(client.open(URL)).rejects.toBeInstanceOf(TVConnectionError);
    expect(client.isOpen()).toBe(false);
  });

  it('captures close code and reason in error when socket closes before opening', async () => {
    const client = new LGWebOSWebSocketClient(() => {
      const socket: IWebSocketTransport = {
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        send: jest.fn(),
        close: jest.fn(),
      };
      setImmediate(() => {
        socket.onclose?.({ code: 1006, reason: 'Connection reset' });
      });
      return socket;
    });

    let thrownError: unknown;
    try {
      await client.open(URL);
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeInstanceOf(TVConnectionError);
    expect((thrownError as Error).message).toContain('code: 1006');
    expect((thrownError as Error).message).toContain('reason: Connection reset');
    expect((thrownError as Error).message).toContain(URL);
  });

  it('captures error event message when onerror fires before opening', async () => {
    const client = new LGWebOSWebSocketClient(() => {
      const socket: IWebSocketTransport = {
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        send: jest.fn(),
        close: jest.fn(),
      };
      setImmediate(() => {
        socket.onerror?.({ message: 'SSL handshake failed' });
      });
      return socket;
    });

    let thrownError: unknown;
    try {
      await client.open(URL);
    } catch (e) {
      thrownError = e;
    }
    expect(thrownError).toBeInstanceOf(TVConnectionError);
    expect((thrownError as Error).message).toContain('SSL handshake failed');
    expect((thrownError as Error).message).toContain(URL);
  });

  it('reports factory exceptions as connection errors', async () => {
    const client = new LGWebOSWebSocketClient(() => {
      throw new Error('boom');
    });
    await expect(client.open(URL)).rejects.toBeInstanceOf(TVConnectionError);
  });

  it('rejects requests when not open', async () => {
    const client = new LGWebOSWebSocketClient(new FakeWebOSServer().factory);
    await expect(client.request('ssap://x')).rejects.toBeInstanceOf(TVConnectionError);
  });

  it('maps TV error frames to LGWebOSRequestError with a status code', async () => {
    const server = new FakeWebOSServer({ unsupportedUris: ['ssap://tv/channelUp'] });
    const client = new LGWebOSWebSocketClient(server.factory);
    await client.open(URL);
    await expect(client.request('ssap://tv/channelUp')).rejects.toMatchObject({
      name: 'LGWebOSRequestError',
      statusCode: 404,
    });
  });

  it('treats returnValue:false as a failure', async () => {
    const server = new FakeWebOSServer({ silent: true });
    const client = new LGWebOSWebSocketClient(server.factory);
    await client.open(URL);
    const pending = client.request('ssap://x');
    await Promise.resolve();
    await Promise.resolve();
    server.ssapSockets()[0].receive({
      type: 'response',
      id: 'req_1',
      payload: { returnValue: false, errorText: '401 insufficient permissions' },
    });
    await expect(pending).rejects.toBeInstanceOf(LGWebOSRequestError);
  });

  it('ignores malformed and unknown-id frames', async () => {
    const server = new FakeWebOSServer();
    const client = new LGWebOSWebSocketClient(server.factory);
    await client.open(URL);
    const socket = server.ssapSockets()[0];
    socket.receiveRaw('garbage');
    socket.receive({ type: 'response', id: 'nope', payload: {} });
    await expect(client.request('ssap://audio/volumeUp')).resolves.toBeDefined();
  });

  describe('timeouts and closing', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('times out an open that never completes', async () => {
      const client = new LGWebOSWebSocketClient(
        () => ({ onopen: null, onmessage: null, onerror: null, onclose: null, send: jest.fn(), close: jest.fn() }),
        { connectTimeoutMs: 1000 },
      );
      const result = client.open(URL).catch((e: unknown) => e);
      jest.advanceTimersByTime(1000);
      expect(await result).toBeInstanceOf(TVTimeoutError);
    });

    it('times out an unanswered request', async () => {
      const server = new FakeWebOSServer({ silent: true });
      const client = new LGWebOSWebSocketClient(server.factory, { requestTimeoutMs: 2000 });
      const opened = client.open(URL);
      await Promise.resolve();
      await opened;
      const result = client.request('ssap://audio/volumeUp').catch((e: unknown) => e);
      jest.advanceTimersByTime(2000);
      expect(await result).toBeInstanceOf(TVTimeoutError);
    });
  });

  it('rejects in-flight requests and notifies listeners when the TV drops the connection', async () => {
    const server = new FakeWebOSServer({ silent: true });
    const client = new LGWebOSWebSocketClient(server.factory);
    await client.open(URL);
    const onClose = jest.fn();
    client.onClose(onClose);
    const pending = client.request('ssap://audio/volumeUp').catch((e: unknown) => e);
    server.dropAll('gone');
    expect(await pending).toBeInstanceOf(TVConnectionError);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(client.isOpen()).toBe(false);
  });

  it('notifies close listeners with a cancelled error on an intentional close()', async () => {
    const server = new FakeWebOSServer({ silent: true });
    const client = new LGWebOSWebSocketClient(server.factory);
    await client.open(URL);
    const onClose = jest.fn();
    client.onClose(onClose);
    const pending = client.request('ssap://x').catch((e: unknown) => e);
    client.close();
    expect(await pending).toMatchObject({ code: 'cancelled' });
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ code: 'cancelled' }));
  });

  it('enriches SSAP socket is not open error with close code and reason in sendRaw() when socket closed after open', async () => {
    const fakeSocket: IWebSocketTransport = {
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      send: jest.fn(),
      close: jest.fn(),
    };
    const client = new LGWebOSWebSocketClient(() => {
      setImmediate(() => {
        fakeSocket.onopen?.();
      });
      return fakeSocket;
    });

    await client.open(URL);
    expect(client.isOpen()).toBe(true);

    // Socket drops remotely with code 1006
    fakeSocket.onclose?.({ code: 1006, reason: 'Abnormal closure' });
    expect(client.isOpen()).toBe(false);

    expect(() => {
      client.sendRaw({ type: 'register' });
    }).toThrow('SSAP socket is not open (Connection to the TV closed (code: 1006, reason: "Abnormal closure"))');
  });

  it('enriches SSAP socket is not open error with close code and reason in request() when socket closed after open', async () => {
    const fakeSocket: IWebSocketTransport = {
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      send: jest.fn(),
      close: jest.fn(),
    };
    const client = new LGWebOSWebSocketClient(() => {
      setImmediate(() => {
        fakeSocket.onopen?.();
      });
      return fakeSocket;
    });

    await client.open(URL);
    fakeSocket.onclose?.({ code: 1001, reason: 'Stream end encountered' });

    await expect(client.request('ssap://system/info')).rejects.toThrow(
      'SSAP socket is not open (Connection to the TV closed (code: 1001, reason: "Stream end encountered"))',
    );
  });
});
