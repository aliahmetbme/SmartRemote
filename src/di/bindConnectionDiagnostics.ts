import { AppState } from 'react-native';
import type { TVConnectionManager } from '../application/services/TVConnectionManager';
import { TVConnectionState } from '../domain/enums/TVConnectionState';
import {
  classifyConnectionFailure,
  type LocalNetworkStatus,
  type ConnectionDiagnostic,
} from '../domain/entities/ConnectionDiagnostic';
import type { AppStore } from '../store';
import { connectionActions } from '../store/slices/connectionSlice';

export const NETWORK_STATUS_BUDGET_MS = 500;
/** Failure-only, one OS snapshot per connection generation. Never creates sockets or retries. */
export function bindConnectionDiagnostics(
  manager: TVConnectionManager,
  store: AppStore,
  readNetwork: () => Promise<LocalNetworkStatus>,
) {
  let active =
    AppState.currentState !== 'background' &&
    AppState.currentState !== 'inactive';
  let alive = true;
  let epoch = 0;
  let checkedRevision = -1;
  let previousError: Error | null | undefined;
  let previousRevision = -1;
  let network: LocalNetworkStatus = { wifi: null, localTransport: null };
  let latest: ConnectionDiagnostic | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    ++epoch;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const publish = () => {
    store.dispatch(connectionActions.diagnosticChanged(latest));
  };
  const unsubscribe = manager.subscribe(snapshot => {
    const revision = manager.getOperationRevision();
    if (
      revision !== previousRevision ||
      snapshot.state === TVConnectionState.Connected
    ) {
      cancel();
      latest = null;
      previousError = undefined;
      network = { wifi: null, localTransport: null };
      previousRevision = revision;
      publish();
    }
    if (
      !active ||
      snapshot.state === TVConnectionState.Connected ||
      snapshot.state === TVConnectionState.Pairing ||
      snapshot.state === TVConnectionState.Connecting
    )
      return;
    if (
      snapshot.state !== TVConnectionState.Error &&
      snapshot.state !== TVConnectionState.Reconnecting
    )
      return;
    if (latest && previousError === snapshot.error) {
      latest = { ...latest, retryAttempt: snapshot.retryAttempt ?? 0 };
      publish();
      return;
    }
    previousError = snapshot.error;
    const classification = classifyConnectionFailure(
      snapshot.error,
      snapshot.state === TVConnectionState.Reconnecting,
    );
    latest = {
      ...classification,
      failedAt: Date.now(),
      deviceId: snapshot.device?.id ?? null,
      revision,
      retryAttempt: snapshot.retryAttempt ?? 0,
      network,
    };
    publish();
    if (checkedRevision === revision) return;
    checkedRevision = revision;
    const request = ++epoch;
    const current = () =>
      alive &&
      active &&
      request === epoch &&
      revision === manager.getOperationRevision() &&
      manager.getState() !== TVConnectionState.Connected &&
      manager.getDevice()?.id === latest?.deviceId;
    // Bounded OS read only. Late native results are ignored after any invalidation.
    const timeout = new Promise<null>(resolve => {
      timer = setTimeout(() => {
        timer = null;
        resolve(null);
      }, NETWORK_STATUS_BUDGET_MS);
    });
    let read: Promise<LocalNetworkStatus>;
    try {
      read = readNetwork();
    } catch {
      read = Promise.reject(new Error('Network status unavailable'));
    }
    Promise.race([read.catch(() => null), timeout]).then(result => {
      if (!current()) return;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (!result || !latest) return;
      network = result;
      const cause =
        latest.category === 'UNKNOWN' && result.localTransport === false
          ? {
              category: 'NETWORK_UNAVAILABLE' as const,
              confidence: 'confirmed' as const,
              evidence: 'OS reports no Wi-Fi or Ethernet transport',
            }
          : {};
      latest = { ...latest, ...cause, network };
      publish();
    });
  });
  const subscription = AppState.addEventListener('change', state => {
    active = state === 'active';
    if (!active) cancel();
  });
  return () => {
    alive = false;
    cancel();
    unsubscribe();
    subscription.remove();
  };
}
