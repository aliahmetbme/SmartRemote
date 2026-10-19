import { IKeyValueStorage } from './IKeyValueStorage';

export interface IAsyncStorageBridge {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function getDefaultAsyncStorage(): IAsyncStorageBridge {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    return AsyncStorage.default ?? AsyncStorage;
  } catch {
    throw new Error('AsyncStorage is not available in the current runtime environment');
  }
}

/**
 * Production implementation of IKeyValueStorage backed by @react-native-async-storage/async-storage.
 * Used for non-sensitive data such as saved TV device metadata and last selected ID.
 */
export class AsyncStorageKeyValueStorage implements IKeyValueStorage {
  private readonly storage: IAsyncStorageBridge;

  constructor(storageBridge?: IAsyncStorageBridge) {
    this.storage = storageBridge ?? getDefaultAsyncStorage();
  }

  getItem(key: string): Promise<string | null> {
    return this.storage.getItem(key);
  }

  setItem(key: string, value: string): Promise<void> {
    return this.storage.setItem(key, value);
  }

  removeItem(key: string): Promise<void> {
    return this.storage.removeItem(key);
  }
}
