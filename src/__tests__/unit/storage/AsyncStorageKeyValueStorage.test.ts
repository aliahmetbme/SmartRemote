import { makeWebOSDevice } from '../../../testing/fixtures';
import { LocalTVDeviceRepository } from '../../../infrastructure/repositories/LocalTVDeviceRepository';
import {
  AsyncStorageKeyValueStorage,
  IAsyncStorageBridge,
} from '../../../infrastructure/storage/AsyncStorageKeyValueStorage';

describe('AsyncStorageKeyValueStorage', () => {
  it('delegates getItem, setItem, and removeItem to the underlying storage bridge', async () => {
    const memory = new Map<string, string>();

    const mockBridge: IAsyncStorageBridge = {
      getItem: async key => memory.get(key) ?? null,
      setItem: async (key, val) => {
        memory.set(key, val);
      },
      removeItem: async key => {
        memory.delete(key);
      },
    };

    const storage = new AsyncStorageKeyValueStorage(mockBridge);
    const repo = new LocalTVDeviceRepository(storage);

    const tv = makeWebOSDevice({ id: 'persisted-tv', name: 'Living Room' });

    await repo.save(tv);
    await repo.setLastSelectedId(tv.id);

    expect(await repo.getById('persisted-tv')).toMatchObject({
      id: 'persisted-tv',
      name: 'Living Room',
    });
    expect(await repo.getLastSelectedId()).toBe('persisted-tv');

    await repo.remove('persisted-tv');
    expect(await repo.getById('persisted-tv')).toBeNull();
    expect(await repo.getLastSelectedId()).toBeNull();
  });
});
