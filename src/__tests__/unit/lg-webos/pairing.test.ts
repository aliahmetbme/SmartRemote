import { TVConnectionError, TVTimeoutError } from '../../../domain/errors/TVConnectionError';
import { TVPairingError } from '../../../domain/errors/TVPairingError';
import { ICredentialStorage } from '../../../domain/interfaces/ICredentialStorage';
import { LGWebOSPairingService } from '../../../infrastructure/adapters/lg-webos/LGWebOSPairingService';
import { LGWebOSWebSocketClient } from '../../../infrastructure/adapters/lg-webos/LGWebOSWebSocketClient';
import { InMemoryCredentialStorage } from '../../../infrastructure/storage/InMemoryCredentialStorage';
import { FakeWebOSServer, FakeWebOSServerOptions } from '../../../testing/FakeWebOSServer';

async function open(options?: FakeWebOSServerOptions) {
  const server = new FakeWebOSServer(options);
  const client = new LGWebOSWebSocketClient(server.factory);
  await client.open('ws://192.168.0.20:3000');
  return { server, client };
}

describe('LGWebOSPairingService', () => {
  it('pairs on first connection, signals the prompt, and stores the client key', async () => {
    const { client } = await open();
    const storage = new InMemoryCredentialStorage();
    const onPrompt = jest.fn();
    await new LGWebOSPairingService(storage).register(client, 'tv-1', { onPrompt });
    expect(onPrompt).toHaveBeenCalledTimes(1);
    expect(await storage.get('tv-1')).toBe('client-key-123');
  });

  it('does not send a client key on first pairing, and sends a manifest', async () => {
    const { client, server } = await open();
    await new LGWebOSPairingService(new InMemoryCredentialStorage()).register(client, 'tv-1');
    expect(server.registrations[0]['client-key']).toBeUndefined();
    expect(server.registrations[0].manifest).toMatchObject({ manifestVersion: 1 });
  });

  it('reuses a stored key and skips the prompt', async () => {
    const { client, server } = await open();
    const storage = new InMemoryCredentialStorage();
    await storage.set('tv-1', 'client-key-123');
    const onPrompt = jest.fn();
    await new LGWebOSPairingService(storage).register(client, 'tv-1', { onPrompt });
    expect(server.registrations[0]['client-key']).toBe('client-key-123');
    expect(onPrompt).not.toHaveBeenCalled();
  });

  it('replaces a stale key when the TV issues a new one', async () => {
    const { client } = await open();
    const storage = new InMemoryCredentialStorage();
    await storage.set('tv-1', 'old-key');
    await new LGWebOSPairingService(storage).register(client, 'tv-1');
    expect(await storage.get('tv-1')).toBe('client-key-123');
  });

  it('fails with TVPairingError when the user denies and stores nothing', async () => {
    const { client } = await open({ denyPairing: true });
    const storage = new InMemoryCredentialStorage();
    await expect(new LGWebOSPairingService(storage).register(client, 'tv-1')).rejects.toBeInstanceOf(
      TVPairingError,
    );
    expect(await storage.get('tv-1')).toBeNull();
  });

  it('clears a stale stored key when the TV rejects registration', async () => {
    const { client } = await open({ denyPairing: true });
    const storage = new InMemoryCredentialStorage();
    await storage.set('tv-1', 'invalid-old-key');
    await expect(new LGWebOSPairingService(storage).register(client, 'tv-1')).rejects.toBeInstanceOf(
      TVPairingError,
    );
    expect(await storage.get('tv-1')).toBeNull();
  });

  it('fails when the TV registers without a client key', async () => {
    const { client, server } = await open({ manualPairing: true });
    const result = new LGWebOSPairingService(new InMemoryCredentialStorage())
      .register(client, 'tv-1')
      .catch((e: unknown) => e);
    await new Promise<void>(r => setImmediate(() => r()));
    server.ssapSockets()[0].receive({ type: 'registered', id: 'register_0', payload: {} });
    expect(await result).toBeInstanceOf(TVPairingError);
  });

  it('surfaces credential-storage failures as pairing errors', async () => {
    const { client } = await open();
    const failing: ICredentialStorage = {
      get: async () => null,
      set: async () => {
        throw new Error('keychain locked');
      },
      remove: async () => undefined,
    };
    await expect(new LGWebOSPairingService(failing).register(client, 'tv-1')).rejects.toBeInstanceOf(
      TVPairingError,
    );
  });

  it('fails if the connection closes during pairing', async () => {
    const { client, server } = await open({ manualPairing: true });
    const result = new LGWebOSPairingService(new InMemoryCredentialStorage())
      .register(client, 'tv-1')
      .catch((e: unknown) => e);
    await new Promise<void>(r => setImmediate(() => r()));
    server.dropAll();
    expect(await result).toBeInstanceOf(TVConnectionError);
  });

  it('fails fast if the connection is not open before register is called', async () => {
    const { client } = await open();
    client.close();
    await expect(
      new LGWebOSPairingService(new InMemoryCredentialStorage()).register(client, 'tv-1'),
    ).rejects.toThrow('Cannot pair: SSAP connection to TV is not open');
  });

  it('fails fast if the connection closes during credentials lookup before sendRaw is called', async () => {
    const { client, server } = await open();
    const storage: ICredentialStorage = {
      get: async () => {
        // Socket drops while credentials are being read
        server.dropAll('Stream end encountered');
        return null;
      },
      set: async () => {},
      remove: async () => {},
    };

    await expect(
      new LGWebOSPairingService(storage).register(client, 'tv-1'),
    ).rejects.toThrow('Connection to the TV closed (code: 1006, reason: "Stream end encountered")');
  });

  describe('timeouts', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('times out as TVPairingError when the prompt is never accepted', async () => {
      const { client } = await open({ manualPairing: true });
      const result = new LGWebOSPairingService(new InMemoryCredentialStorage(), { pairingTimeoutMs: 5000 })
        .register(client, 'tv-1')
        .catch((e: unknown) => e);
      await jest.advanceTimersByTimeAsync(10);
      await jest.advanceTimersByTimeAsync(5000);
      expect(await result).toBeInstanceOf(TVPairingError);
    });

    it('times out as TVTimeoutError when the TV never answers registration', async () => {
      const { client } = await open({ silent: true });
      const result = new LGWebOSPairingService(new InMemoryCredentialStorage(), { pairingTimeoutMs: 5000 })
        .register(client, 'tv-1')
        .catch((e: unknown) => e);
      await jest.advanceTimersByTimeAsync(5000);
      expect(await result).toBeInstanceOf(TVTimeoutError);
    });
  });
});
