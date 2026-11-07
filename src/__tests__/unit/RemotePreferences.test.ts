import { createContainer } from '../../di/container';
import { remoteActions } from '../../store/slices/remoteSlice';
import { InMemoryKeyValueStorage } from '../../infrastructure/storage/InMemoryKeyValueStorage';
import { REMOTE_PREFERENCES_KEY } from '../../di/bindRemotePreferences';

describe('Remote preference persistence', () => {
  it('persists automatic opt-out and sensitivity across container recreation', async () => {
    const storage = new InMemoryKeyValueStorage();
    const first = createContainer({ keyValueStorage: storage });
    await first.remotePreferences.ready;
    first.store.dispatch(
      remoteActions.motionPreferencesChanged({
        automaticMotion: false,
        sensitivity: 1.8,
        invertX: true,
        diagnosticMode: true,
      }),
    );
    await first.remotePreferences.flush();
    first.remotePreferences.dispose();
    first.disposeDiagnostics();
    const second = createContainer({ keyValueStorage: storage });
    await second.remotePreferences.ready;
    expect(second.store.getState().remote.motionPreferences).toEqual({
      automaticMotion: false,
      sensitivity: 1.8,
      invertX: true,
      invertY: false,
      diagnosticMode: false,
    });
    second.disposeDiagnostics();
    second.remotePreferences.dispose();
  });
  it('does not overwrite a stored opt-out when sensitivity is edited during hydration', async () => {
    let resolve!: (raw: string) => void;
    const storage = {
      getItem: () =>
        new Promise<string>(done => {
          resolve = done;
        }),
      setItem: jest.fn(async () => {}),
      removeItem: jest.fn(async () => {}),
    };
    const container = createContainer({ keyValueStorage: storage });
    container.store.dispatch(
      remoteActions.motionPreferencesChanged({ sensitivity: 2 }),
    );
    resolve(JSON.stringify({ automaticMotion: false, sensitivity: 1 }));
    await container.remotePreferences.flush();
    expect(
      container.store.getState().remote.motionPreferences?.automaticMotion,
    ).toBe(false);
    expect(
      container.store.getState().remote.motionPreferences?.sensitivity,
    ).toBe(2);
    container.disposeDiagnostics();
    container.remotePreferences.dispose();
  });
  it('fails closed for automatic motion if settings cannot be read and does not overwrite the stored value', async () => {
    const storage = {
      getItem: jest.fn(async () => {
        throw new Error('storage unavailable');
      }),
      setItem: jest.fn(async () => {}),
      removeItem: jest.fn(async () => {}),
    };
    const container = createContainer({ keyValueStorage: storage });
    await container.remotePreferences.flush();
    expect(
      container.store.getState().remote.motionPreferences?.automaticMotion,
    ).toBe(false);
    expect(container.store.getState().remote.preferencesStorageFailed).toBe(
      true,
    );
    expect(storage.setItem).not.toHaveBeenCalled();
    container.disposeDiagnostics();
    container.remotePreferences.dispose();
  });
  it('filters unknown stored fields and clamps sensitivity', async () => {
    const storage = new InMemoryKeyValueStorage();
    await storage.setItem(
      REMOTE_PREFERENCES_KEY,
      JSON.stringify({
        sensitivity: 20,
        automaticMotion: 'false',
        clientKey: 'secret',
      }),
    );
    const container = createContainer({ keyValueStorage: storage });
    await container.remotePreferences.ready;
    expect(
      container.store.getState().remote.motionPreferences?.sensitivity,
    ).toBe(3);
    expect(
      JSON.stringify(container.store.getState().remote.motionPreferences),
    ).not.toContain('secret');
    container.disposeDiagnostics();
    container.remotePreferences.dispose();
  });
});
