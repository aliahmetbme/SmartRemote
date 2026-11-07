import type { AppStore } from '../store';
import {
  remoteActions,
  defaultMotionPreferences,
  type MotionPreferences,
} from '../store/slices/remoteSlice';
import type { IKeyValueStorage } from '../infrastructure/storage/IKeyValueStorage';
export const REMOTE_PREFERENCES_KEY = 'smartremote.remote-preferences.v1';

/** Independent hydration: never delays TV restoration. Serial writes preserve the latest preference. */
export function bindRemotePreferences(
  store: AppStore,
  storage: IKeyValueStorage,
) {
  let loading = true;
  let queue = Promise.resolve();
  let hydrating = false;
  const pending: Partial<MotionPreferences> = {};
  let dirty = false;
  let previous = store.getState().remote.motionPreferences;
  const persist = () => {
    const prefs =
      store.getState().remote.motionPreferences ?? defaultMotionPreferences;
    const values = {
      automaticMotion: prefs.automaticMotion,
      sensitivity: prefs.sensitivity,
      invertX: prefs.invertX,
      invertY: prefs.invertY,
    };
    const data = JSON.stringify(values);
    queue = queue
      .then(() => storage.setItem(REMOTE_PREFERENCES_KEY, data))
      .then(
        () => {
          store.dispatch(remoteActions.preferencesStorageFailed(false));
        },
        () => {
          store.dispatch(remoteActions.preferencesStorageFailed(true));
        },
      );
  };
  const unsubscribe = store.subscribe(() => {
    const next = store.getState().remote.motionPreferences;
    if (next === previous) return;
    if (loading && !hydrating) {
      dirty = true;
      for (const key of [
        'automaticMotion',
        'sensitivity',
        'invertX',
        'invertY',
        'diagnosticMode',
      ] as const) {
        if (next?.[key] !== (previous ?? defaultMotionPreferences)[key])
          Object.assign(pending, { [key]: next?.[key] });
      }
    }
    previous = next;
    if (!loading) persist();
  });
  const ready = storage
    .getItem(REMOTE_PREFERENCES_KEY)
    .then(raw => {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      const values: Partial<MotionPreferences> = {};
      if (parsed && typeof parsed === 'object') {
        const source = parsed as Record<string, unknown>;
        for (const key of ['automaticMotion', 'invertX', 'invertY'] as const) {
          if (typeof source[key] === 'boolean') values[key] = source[key];
        }
        if (
          typeof source.sensitivity === 'number' &&
          Number.isFinite(source.sensitivity)
        ) {
          values.sensitivity = Math.max(
            0.4,
            Math.min(3, Number(source.sensitivity.toFixed(1))),
          );
        }
      }
      hydrating = true;
      store.dispatch(
        remoteActions.preferencesHydrated({ ...values, ...pending }),
      );
      hydrating = false;
    })
    .catch(() => {
      store.dispatch(remoteActions.preferencesStorageFailed(true));
      hydrating = true;
      store.dispatch(
        remoteActions.preferencesHydrated({
          automaticMotion: false,
          ...pending,
        }),
      );
      hydrating = false;
    })
    .then(() => {
      loading = false;
      if (dirty) persist();
    });
  return {
    ready,
    flush: async () => {
      await ready;
      await queue;
    },
    dispose: unsubscribe,
  };
}
