import { ConnectTVUseCase } from '../../application/usecases/ConnectTVUseCase';
import { PairTVUseCase } from '../../application/usecases/PairTVUseCase';
import { RestoreLastTVUseCase } from '../../application/usecases/RestoreLastTVUseCase';
import { TVConnectionManager } from '../../application/services/TVConnectionManager';
import { PairingStatus } from '../../domain/enums/PairingStatus';
import { TVPairingError } from '../../domain/errors/TVPairingError';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';
import { LocalTVDeviceRepository } from '../../infrastructure/repositories/LocalTVDeviceRepository';
import { InMemoryKeyValueStorage } from '../../infrastructure/storage/InMemoryKeyValueStorage';
import { makeMockDevice } from '../../testing/fixtures';

describe('LocalTVDeviceRepository', () => {
  it('saves, upserts, and removes devices', async () => {
    const repo = new LocalTVDeviceRepository(new InMemoryKeyValueStorage());
    await repo.save(makeMockDevice({ name: 'A' }));
    await repo.save(makeMockDevice({ name: 'B' }));
    expect(await repo.getAll()).toHaveLength(1);
    expect((await repo.getById('mock-1'))?.name).toBe('B');
    await repo.setLastSelectedId('mock-1');
    await repo.remove('mock-1');
    expect(await repo.getAll()).toEqual([]);
    expect(await repo.getLastSelectedId()).toBeNull();
  });

  it('tolerates corrupted storage', async () => {
    const storage = new InMemoryKeyValueStorage();
    const repo = new LocalTVDeviceRepository(storage);
    await storage.setItem('smartremote.savedDevices.v1', '{not json');
    expect(await repo.getAll()).toEqual([]);
    await storage.setItem('smartremote.savedDevices.v1', JSON.stringify([{ foo: 1 }, makeMockDevice()]));
    expect(await repo.getAll()).toHaveLength(1);
  });

  it('persists only device metadata (no credential fields)', async () => {
    const storage = new InMemoryKeyValueStorage();
    const repo = new LocalTVDeviceRepository(storage);
    await repo.save(makeMockDevice());
    const raw = (await storage.getItem('smartremote.savedDevices.v1')) as string;
    expect(raw).not.toMatch(/pairingKey|clientKey|client-key|token|secret|password|credential/i);
  });
});

describe('connect / pair / restore use cases', () => {
  function build(adapter: MockTVAdapter) {
    const manager = new TVConnectionManager({ supports: () => true, create: () => adapter });
    const repo = new LocalTVDeviceRepository(new InMemoryKeyValueStorage());
    const connect = new ConnectTVUseCase(manager, repo, () => 1234);
    return { manager, repo, connect, pair: new PairTVUseCase(connect) };
  }

  it('persists device as paired and last-selected after a successful connect', async () => {
    const { repo, pair } = build(new MockTVAdapter({ requirePairing: true }));
    const result = await pair.execute(makeMockDevice());
    expect(result.pairingStatus).toBe(PairingStatus.Paired);
    expect((await repo.getById('mock-1'))?.lastConnectedAt).toBe(1234);
    expect(await repo.getLastSelectedId()).toBe('mock-1');
  });

  it('does not persist a device whose pairing failed', async () => {
    const { repo, pair } = build(new MockTVAdapter({ requirePairing: true, rejectPairing: true }));
    await expect(pair.execute(makeMockDevice())).rejects.toBeInstanceOf(TVPairingError);
    expect(await repo.getAll()).toEqual([]);
  });

  it('refuses to re-pair an already paired device', async () => {
    const { pair } = build(new MockTVAdapter());
    await expect(
      pair.execute(makeMockDevice({ pairingStatus: PairingStatus.Paired })),
    ).rejects.toBeInstanceOf(TVPairingError);
  });

  it('restores the last TV, or returns null when none is saved', async () => {
    const { manager, repo } = build(new MockTVAdapter());
    const restore = new RestoreLastTVUseCase(manager, repo);
    expect(await restore.execute()).toBeNull();
    await repo.save(makeMockDevice());
    await repo.setLastSelectedId('mock-1');
    expect((await restore.execute())?.id).toBe('mock-1');
    expect(manager.getState()).toBe('connected');
  });
});
