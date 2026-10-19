import { makeMockDevice } from '../../../testing/fixtures';
import { TVConnectionManager } from '../../../application/services/TVConnectionManager';
import { ProbeManualIPUseCase } from '../../../application/usecases/ProbeManualIPUseCase';
import { RestoreLastTVUseCase } from '../../../application/usecases/RestoreLastTVUseCase';
import { StartupRestorationUseCase } from '../../../application/usecases/StartupRestorationUseCase';
import { ManualIPDiscoveryStrategy } from '../../../infrastructure/discovery/discovery-strategies/ManualIPDiscoveryStrategy';
import { LocalTVDeviceRepository } from '../../../infrastructure/repositories/LocalTVDeviceRepository';
import { InMemoryKeyValueStorage } from '../../../infrastructure/storage/InMemoryKeyValueStorage';
import { MockTVAdapter } from '../../../infrastructure/adapters/mock/MockTVAdapter';

describe('StartupRestorationUseCase and ProbeManualIPUseCase', () => {
  it('restores the last connected TV on startup', async () => {
    const adapter = new MockTVAdapter();
    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => adapter,
    });
    const repo = new LocalTVDeviceRepository(new InMemoryKeyValueStorage());
    const restoreLastTV = new RestoreLastTVUseCase(manager, repo);
    const startup = new StartupRestorationUseCase(repo, restoreLastTV);

    const tv = makeMockDevice({ id: 'saved-1', name: 'Saved TV' });
    await repo.save(tv);
    await repo.setLastSelectedId('saved-1');

    const result = await startup.execute();
    expect(result.savedDevices).toHaveLength(1);
    expect(result.restoredDevice?.id).toBe('saved-1');
    expect(result.error).toBeUndefined();
    expect(manager.getState()).toBe('connected');
  });

  it('safely captures restoration failure without crashing startup', async () => {
    const failingAdapter = new MockTVAdapter({
      connectError: new Error('TV offline or powered off'),
    });
    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => failingAdapter,
    });
    const repo = new LocalTVDeviceRepository(new InMemoryKeyValueStorage());
    const restoreLastTV = new RestoreLastTVUseCase(manager, repo);
    const startup = new StartupRestorationUseCase(repo, restoreLastTV);

    const tv = makeMockDevice({ id: 'offline-1' });
    await repo.save(tv);
    await repo.setLastSelectedId('offline-1');

    const result = await startup.execute();
    expect(result.savedDevices).toHaveLength(1);
    expect(result.restoredDevice).toBeNull();
    expect(result.error?.message).toContain('TV offline');
    expect(manager.getState()).toBe('error');
  });

  it('returns empty when no previous device was saved', async () => {
    const manager = new TVConnectionManager({
      supports: () => true,
      create: () => new MockTVAdapter(),
    });
    const repo = new LocalTVDeviceRepository(new InMemoryKeyValueStorage());
    const startup = new StartupRestorationUseCase(repo, new RestoreLastTVUseCase(manager, repo));

    const result = await startup.execute();
    expect(result.savedDevices).toEqual([]);
    expect(result.restoredDevice).toBeNull();
  });

  it('ProbeManualIPUseCase delegates to ManualIPDiscoveryStrategy', async () => {
    const prober = jest.fn().mockResolvedValue(true);
    const strategy = new ManualIPDiscoveryStrategy({ prober });
    const useCase = new ProbeManualIPUseCase(strategy);

    const device = await useCase.execute('192.168.1.55');
    expect(device.ipAddress).toBe('192.168.1.55');
  });
});
