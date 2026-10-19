import { Scheduler } from '../../../application/services/TVConnectionManager';
import { TVConnectionError, TVTimeoutError } from '../../../domain/errors/TVConnectionError';
import { TVPairingError } from '../../../domain/errors/TVPairingError';
import { ICredentialStorage } from '../../../domain/interfaces/ICredentialStorage';
import { LGWebOSWebSocketClient, SSAPMessage } from './LGWebOSWebSocketClient';

const REGISTER_ID = 'register_0';

/**
 * Permissions requested at registration. The TV decides what is actually
 * granted (an unsigned manifest may receive fewer permissions), so every
 * feature must still be verified on a physical TV.
 */
export const REGISTRATION_MANIFEST = {
  manifestVersion: 1,
  appVersion: '1.0',
  permissions: [
    'LAUNCH',
    'CONTROL_AUDIO',
    'CONTROL_POWER',
    'CONTROL_INPUT_TV',
    'CONTROL_INPUT_TEXT',
    'CONTROL_MOUSE_AND_KEYBOARD',
    'CONTROL_INPUT_JOYSTICK',
    'READ_INPUT_DEVICE_LIST',
    'READ_CURRENT_CHANNEL',
    'READ_RUNNING_APPS',
    'READ_INSTALLED_APPS',
  ],
} as const;

export interface PairingCallbacks {
  /** Called when the TV shows its on-screen "allow this device" prompt. */
  onPrompt?: () => void;
}

export interface LGWebOSPairingOptions {
  pairingTimeoutMs?: number;
  scheduler?: Scheduler;
}

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * SSAP registration handshake. Reuses a stored client key when one exists and
 * persists a new/changed key through ICredentialStorage. Keys are never logged.
 */
export class LGWebOSPairingService {
  private readonly scheduler: Scheduler;
  private readonly pairingTimeoutMs: number;

  constructor(
    private readonly credentials: ICredentialStorage,
    options: LGWebOSPairingOptions = {},
  ) {
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.pairingTimeoutMs = options.pairingTimeoutMs ?? 60000;
  }

  /** Resolves once the TV has accepted this client ("registered"). */
  async register(
    client: LGWebOSWebSocketClient,
    deviceId: string,
    callbacks: PairingCallbacks = {},
  ): Promise<void> {
    if (!client.isOpen()) {
      throw client.getLastCloseError() ?? new TVConnectionError('Cannot pair: SSAP connection to TV is not open');
    }

    const storedKey = await this.credentials.get(deviceId);

    if (!client.isOpen()) {
      throw client.getLastCloseError() ?? new TVConnectionError('Connection to TV closed before registration could be sent');
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let promptSeen = false;
      let timer: unknown;
      const cleanups: Array<() => void> = [];

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        this.scheduler.clearTimeout(timer);
        cleanups.forEach(c => c());
        if (error) reject(error);
        else resolve();
      };

      const onRegistered = (message: SSAPMessage) => {
        const key = message.payload?.['client-key'];
        if (typeof key !== 'string' || key.length === 0) {
          finish(new TVPairingError('TV completed pairing without a client key'));
          return;
        }
        const persist = key === storedKey ? Promise.resolve() : this.credentials.set(deviceId, key);
        persist.then(
          () => finish(),
          e => finish(new TVPairingError('Could not store the pairing key securely', e)),
        );
      };

      cleanups.push(
        client.onMessage(message => {
          if (message.id !== REGISTER_ID || settled) return;
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.log(`[SmartRemote][Pairing] Received message type '${message.type}' for ${REGISTER_ID}`);
          }
          if (message.type === 'response') {
            if (message.payload?.pairingType === 'PROMPT') {
              promptSeen = true;
              if (typeof __DEV__ !== 'undefined' && __DEV__) {
                console.log('[SmartRemote][Pairing] TV displayed pairing prompt on screen');
              }
              callbacks.onPrompt?.();
            }
          } else if (message.type === 'registered') {
            if (typeof __DEV__ !== 'undefined' && __DEV__) {
              console.log('[SmartRemote][Pairing] TV accepted registration');
            }
            onRegistered(message);
          } else if (message.type === 'error') {
            if (typeof __DEV__ !== 'undefined' && __DEV__) {
              console.log(`[SmartRemote][Pairing] TV rejected registration: ${message.error ?? 'unknown'}`);
            }
            if (storedKey) {
              // Stale/rejected key, clear it so next attempt will prompt freshly
              this.credentials.remove(deviceId).catch(() => {});
            }
            finish(new TVPairingError(message.error ?? 'Pairing was rejected by the TV'));
          }
        }),
        client.onClose(error =>
          finish(
            new TVConnectionError(
              `Connection closed during pairing: ${error.message}`,
              'connection_failed',
              error,
            ),
          ),
        ),
      );

      timer = this.scheduler.setTimeout(
        () =>
          finish(
            promptSeen
              ? new TVPairingError('Pairing was not accepted on the TV in time', new TVTimeoutError())
              : new TVTimeoutError('The TV did not respond to registration'),
          ),
        this.pairingTimeoutMs,
      );

      try {
        const payload: Record<string, unknown> = {
          forcePairing: false,
          pairingType: 'PROMPT',
          manifest: REGISTRATION_MANIFEST,
        };
        if (storedKey) {
          payload['client-key'] = storedKey;
        }
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(
            `[SmartRemote][Pairing] Sending register command (hasStoredKey: ${Boolean(storedKey)})`,
          );
        }
        client.sendRaw({ type: 'register', id: REGISTER_ID, payload });
      } catch (e) {
        finish(e instanceof Error ? e : new TVConnectionError('Could not send registration'));
      }
    });
  }
}
