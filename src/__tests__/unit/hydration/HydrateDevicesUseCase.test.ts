import { HydrateDevicesUseCase } from '../../../application/usecases/HydrateDevicesUseCase';
import { LocalTVDeviceRepository } from '../../../infrastructure/repositories/LocalTVDeviceRepository';
import { InMemoryKeyValueStorage } from '../../../infrastructure/storage/InMemoryKeyValueStorage';
import { makeMockDevice } from '../../../testing/fixtures';

describe('HydrateDevicesUseCase (Unit Tests)', () => {
  it('loads saved devices and restores last selected TV', async () => {
    const storage = new InMemoryKeyValueStorage();
    const repo = new LocalTVDeviceRepository(storage);
    const useCase = new HydrateDevicesUseCase(repo);

    const tv1 = makeMockDevice({ id: 'tv-1', name: 'Living Room TV' });
    const tv2 = makeMockDevice({ id: 'tv-2', name: 'Bedroom TV' });
    await repo.save(tv1);
    await repo.save(tv2);
    await repo.setLastSelectedId('tv-2');

    const result = await useCase.execute();

    expect(result.savedDevices).toHaveLength(2);
    expect(result.selectedDeviceId).toBe('tv-2');
    expect(result.selectedDevice?.id).toBe('tv-2');
  });

  it('falls back to first saved TV if lastSelectedId is not in storage', async () => {
    const storage = new InMemoryKeyValueStorage();
    const repo = new LocalTVDeviceRepository(storage);
    const useCase = new HydrateDevicesUseCase(repo);

    const tv1 = makeMockDevice({ id: 'tv-1', name: 'Living Room TV' });
    await repo.save(tv1);

    const result = await useCase.execute();

    expect(result.savedDevices).toHaveLength(1);
    expect(result.selectedDeviceId).toBe('tv-1');
    expect(result.selectedDevice?.id).toBe('tv-1');
  });

  it('returns null selectedDevice when repository is empty', async () => {
    const storage = new InMemoryKeyValueStorage();
    const repo = new LocalTVDeviceRepository(storage);
    const useCase = new HydrateDevicesUseCase(repo);

    const result = await useCase.execute();

    expect(result.savedDevices).toEqual([]);
    expect(result.selectedDeviceId).toBeNull();
    expect(result.selectedDevice).toBeNull();
  });

  it('coalesces multiple concurrent calls into a single in-flight storage read', async () => {
    const storage = new InMemoryKeyValueStorage();
    const repo = new LocalTVDeviceRepository(storage);
    const getAllSpy = jest.spyOn(repo, 'getAll');
    const useCase = new HydrateDevicesUseCase(repo);

    const tv1 = makeMockDevice({ id: 'tv-1' });
    await repo.save(tv1);
    getAllSpy.mockClear();

    // Trigger concurrent hydration calls
    const [res1, res2, res3] = await Promise.all([
      useCase.execute(),
      useCase.execute(),
      useCase.execute(),
    ]);

    expect(res1.savedDevices).toHaveLength(1);
    expect(res2.savedDevices).toHaveLength(1);
    expect(res3.savedDevices).toHaveLength(1);
    // getAll called exactly once across 3 concurrent calls
    expect(getAllSpy).toHaveBeenCalledTimes(1);
  });

  it('invalidates stale in-flight hydration when invalidate() is called during write', async () => {
    const storage = new InMemoryKeyValueStorage();
    const repo = new LocalTVDeviceRepository(storage);
    const useCase = new HydrateDevicesUseCase(repo);

    let resolveStorageRead: (value: any) => void = () => {};
    jest.spyOn(repo, 'getAll').mockImplementation(
      () =>
        new Promise(resolve => {
          resolveStorageRead = resolve;
        }),
    );

    const hydrationPromise = useCase.execute();

    // Simulate user forgetting a TV or updating a MAC while storage read was pending
    useCase.invalidate();

    // Resolve delayed storage read with stale data
    resolveStorageRead([makeMockDevice({ id: 'stale-tv' })]);

    const result = await hydrationPromise;
    expect(result.superseded).toBe(true);
    expect(result.savedDevices).toEqual([]);
  });

  it('allows fresh hydration execution after previous completion', async () => {
    const storage = new InMemoryKeyValueStorage();
    const repo = new LocalTVDeviceRepository(storage);
    const useCase = new HydrateDevicesUseCase(repo);

    const tv1 = makeMockDevice({ id: 'tv-1' });
    await repo.save(tv1);

    const res1 = await useCase.execute();
    expect(res1.savedDevices).toHaveLength(1);

    // Save another TV
    const tv2 = makeMockDevice({ id: 'tv-2' });
    await repo.save(tv2);

    // Execute fresh hydration
    const res2 = await useCase.execute();
    expect(res2.savedDevices).toHaveLength(2);
  });
});
