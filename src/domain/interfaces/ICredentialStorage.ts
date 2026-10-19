/** Secure storage for pairing keys and other secrets, keyed by device id. */
export interface ICredentialStorage {
  get(deviceId: string): Promise<string | null>;
  set(deviceId: string, credential: string): Promise<void>;
  remove(deviceId: string): Promise<void>;
}
