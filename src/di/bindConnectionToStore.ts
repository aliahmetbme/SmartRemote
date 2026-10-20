import { PairingStatus } from '../domain/enums/PairingStatus';
import { TVConnectionState } from '../domain/enums/TVConnectionState';
import { TVPairingError } from '../domain/errors/TVPairingError';
import { TVConnectionManager } from '../application/services/TVConnectionManager';
import type { AppDispatch } from '../store';
import { connectionActions } from '../store/slices/connectionSlice';
import { tvActions } from '../store/slices/tvSlice';

/** Mirrors manager snapshots into serializable Redux state. Returns an unsubscribe function. */
export function bindConnectionToStore(manager: TVConnectionManager, dispatch: AppDispatch) {
  return manager.subscribe(({ state, device, capabilities, error }) => {
    dispatch(connectionActions.statusChanged(state));
    dispatch(
      connectionActions.errorSet(error ? { code: errorCode(error), message: error.message } : null),
    );
    dispatch(tvActions.capabilitiesChanged(capabilities));

    if (state === TVConnectionState.Pairing) {
      dispatch(connectionActions.pairingStatusChanged(PairingStatus.Pairing));
    } else if (state === TVConnectionState.Connected) {
      dispatch(connectionActions.pairingStatusChanged(PairingStatus.Paired));
      dispatch(connectionActions.lastConnectedDeviceSet(device?.id ?? null));
      if (device) {
        dispatch(tvActions.deviceSelected(device.id));
        dispatch(tvActions.deviceSaved(device));
      }
    } else if (state === TVConnectionState.Error && error instanceof TVPairingError) {
      dispatch(connectionActions.pairingStatusChanged(PairingStatus.Failed));
    }
  });
}

function errorCode(error: Error): string {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : 'unknown';
}
