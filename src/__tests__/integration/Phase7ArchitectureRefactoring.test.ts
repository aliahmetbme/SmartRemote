import { ForgetTVUseCase } from '../../application/usecases/ForgetTVUseCase';
import { ProbeManualIPUseCase } from '../../application/usecases/ProbeManualIPUseCase';
import { DiscoveryManager } from '../../application/services/DiscoveryManager';
import { TVConnectionManager } from '../../application/services/TVConnectionManager';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { TVDevice } from '../../domain/entities/TVDevice';
import { LocalTVDeviceRepository } from '../../infrastructure/repositories/LocalTVDeviceRepository';
import { InMemoryKeyValueStorage } from '../../infrastructure/storage/InMemoryKeyValueStorage';
import { InMemoryCredentialStorage } from '../../infrastructure/storage/InMemoryCredentialStorage';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';
import { makeMockDevice } from '../../testing/fixtures';
import { IManualIPProber } from '../../domain/interfaces/IManualIPProber';
import { DiscoverTVsUseCase } from '../../application/usecases/DiscoverTVsUseCase';
import { ITVDiscoveryService } from '../../domain/interfaces/ITVDiscoveryService';
import { LGWebOSWebSocketClient } from '../../infrastructure/adapters/lg-webos/LGWebOSWebSocketClient';
import { IWebSocketTransport, IWebSocketCloseEvent } from '../../infrastructure/adapters/lg-webos/WebSocketTransport';
import { TVUnsupportedOperationError } from '../../domain/errors/TVUnsupportedOperationError';
import { isLocalIPv4Address } from '../../domain/utils/ipValidator';
import { RepositoryCorruptionError } from '../../domain/errors/RepositoryCorruptionError';

class TransportWithoutPing implements IWebSocketTransport {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: IWebSocketCloseEvent) => void) | null = null;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.onclose?.({ code: 1000, reason: 'closed' });
  }
}

describe('Phase 7 — Architecture Refactoring & Code Quality', () => {
  describe('Phase 7.1 & 7.3 — State Ownership, ForgetTVUseCase & Repository Integrity', () => {
    it('coordinates clean disconnect, repository deletion, and credential removal in ForgetTVUseCase', async () => {
      const storage = new InMemoryKeyValueStorage();
      const credentials = new InMemoryCredentialStorage();
      const repo = new LocalTVDeviceRepository(storage);

      const device = makeMockDevice({ id: 'tv-forget-1', name: 'Living Room' });
      await repo.save(device);
      await repo.setLastSelectedId(device.id);
      await credentials.set(device.id, 'secret-pairing-key');

      const mockAdapter = new MockTVAdapter();
      const manager = new TVConnectionManager({
        supports: () => true,
        create: () => mockAdapter,
      });

      await manager.connect(device);
      expect(manager.getState()).toBe(TVConnectionState.Connected);

      const useCase = new ForgetTVUseCase(repo, manager, credentials);
      const result = await useCase.execute('tv-forget-1');

      expect(result.disconnected).toBe(true);
      expect(result.credentialsRemoved).toBe(true);
      expect(result.deviceRemoved).toBe(true);

      // Verify repository is updated
      expect(await repo.getAll()).toHaveLength(0);
      expect(await repo.getLastSelectedId()).toBeNull();

      // Verify credentials are deleted
      expect(await credentials.get('tv-forget-1')).toBeNull();

      // Verify manager disconnected
      expect(manager.getState()).toBe(TVConnectionState.Disconnected);
    });

    it('tolerates partial failure in credential deletion without failing repository removal', async () => {
      const storage = new InMemoryKeyValueStorage();
      const repo = new LocalTVDeviceRepository(storage);
      const device = makeMockDevice({ id: 'tv-forget-2' });
      await repo.save(device);

      const failingCredentials = {
        get: jest.fn(),
        set: jest.fn(),
        remove: jest.fn().mockRejectedValue(new Error('Keychain locked')),
      };

      const manager = new TVConnectionManager({
        supports: () => true,
        create: () => new MockTVAdapter(),
      });

      const useCase = new ForgetTVUseCase(repo, manager, failingCredentials);
      const result = await useCase.execute('tv-forget-2');

      expect(result.deviceRemoved).toBe(true);
      expect(result.credentialsRemoved).toBe(false);
      expect(await repo.getAll()).toHaveLength(0);
    });

    it('throws RepositoryCorruptionError on invalid JSON and never overwrites corrupt data', async () => {
      const storage = new InMemoryKeyValueStorage();
      const repo = new LocalTVDeviceRepository(storage);
      const corruptData = '{"broken": json without closing brace';
      await storage.setItem('smartremote.savedDevices.v1', corruptData);

      await expect(repo.getAll()).rejects.toBeInstanceOf(RepositoryCorruptionError);
      await expect(repo.save(makeMockDevice())).rejects.toBeInstanceOf(RepositoryCorruptionError);
      await expect(repo.remove('any-id')).rejects.toBeInstanceOf(RepositoryCorruptionError);

      // The corrupt storage must NOT be overwritten with an empty array or single item
      expect(await storage.getItem('smartremote.savedDevices.v1')).toBe(corruptData);
    });
  });

  describe('Phase 7.2 — Clean Architecture Dependency Rules', () => {
    it('ProbeManualIPUseCase depends only on IManualIPProber abstraction', async () => {
      const mockProber: IManualIPProber = {
        probe: jest.fn().mockResolvedValue(makeMockDevice({ ipAddress: '192.168.1.100' })),
      };

      const useCase = new ProbeManualIPUseCase(mockProber);
      const dev = await useCase.execute('192.168.1.100');

      expect(mockProber.probe).toHaveBeenCalledWith('192.168.1.100', undefined);
      expect(dev.ipAddress).toBe('192.168.1.100');
    });

    it('DiscoveryManager emits framework-agnostic events without importing Redux', async () => {
      const dev = makeMockDevice({ id: 'disc-tv' });
      const discoveryService: ITVDiscoveryService = {
        discover: async options => {
          options?.onDeviceFound?.(dev);
          return [dev];
        },
      };

      const events: string[] = [];
      const discoveredDevices: TVDevice[] = [];

      const manager = new DiscoveryManager(new DiscoverTVsUseCase(discoveryService), {
        onDiscoveryStarted: () => events.push('started'),
        onDeviceDiscovered: d => discoveredDevices.push(d),
        onDiscoveryCompleted: () => events.push('completed'),
        onDiscoveryFailed: () => events.push('failed'),
      });

      const result = await manager.startDiscovery();
      expect(result).toHaveLength(1);
      expect(events).toEqual(['started', 'completed']);
      expect(discoveredDevices).toHaveLength(2); // once from onDeviceFound, once from loop
    });

    it('domain isLocalIPv4Address validates local private IPv4 and rejects public/invalid addresses', () => {
      expect(isLocalIPv4Address('192.168.1.1')).toBe(true);
      expect(isLocalIPv4Address('10.0.0.1')).toBe(true);
      expect(isLocalIPv4Address('172.16.0.5')).toBe(true);
      expect(isLocalIPv4Address('127.0.0.1')).toBe(true);
      expect(isLocalIPv4Address('169.254.1.1')).toBe(true);

      // Public or invalid addresses
      expect(isLocalIPv4Address('8.8.8.8')).toBe(false);
      expect(isLocalIPv4Address('1.1.1.1')).toBe(false);
      expect(isLocalIPv4Address('not-an-ip')).toBe(false);
      expect(isLocalIPv4Address('')).toBe(false);
    });
  });

  describe('Phase 7.4 — WebSocket & Heartbeat Contract', () => {
    it('throws TVUnsupportedOperationError when transport does not implement ping()', async () => {
      const transport = new TransportWithoutPing();
      const client = new LGWebOSWebSocketClient(() => transport);

      // Simulate open
      const openPromise = client.open('ws://127.0.0.1:3000');
      transport.onopen?.();
      await openPromise;

      expect(client.isPingSupported()).toBe(false);
      await expect(client.ping()).rejects.toBeInstanceOf(TVUnsupportedOperationError);

      client.close();
    });
  });
});
