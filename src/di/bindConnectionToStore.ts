import { PairingStatus } from '../domain/enums/PairingStatus';
import { TVConnectionState } from '../domain/enums/TVConnectionState';
import { TVPairingError } from '../domain/errors/TVPairingError';
import { TVConnectionManager } from '../application/services/TVConnectionManager';
import { ITVDeviceRepository } from '../domain/interfaces/ITVDeviceRepository';
import type { AppDispatch } from '../store';
import { connectionActions } from '../store/slices/connectionSlice';
import { tvActions } from '../store/slices/tvSlice';

/** Mirrors manager snapshots into serializable Redux state. Returns an unsubscribe function. */
export function bindConnectionToStore(
  manager: TVConnectionManager,
  dispatch: AppDispatch,
  repository?: ITVDeviceRepository,
) {
  return manager.subscribe(({ state, device, capabilities, error }) => {
    dispatch(connectionActions.statusChanged(state));
    dispatch(
      connectionActions.errorSet(error ? { code: errorCode(error), message: error.message } : null),
    );
    dispatch(tvActions.capabilitiesChanged(capabilities));

    // Preserve selected device identity whenever manager has a targeted TV device
    if (device) {
      dispatch(tvActions.deviceSelected(device.id));
    }

    if (state === TVConnectionState.Pairing) {
      dispatch(connectionActions.pairingStatusChanged(PairingStatus.Pairing));
    } else if (state === TVConnectionState.Connected) {
      dispatch(connectionActions.pairingStatusChanged(PairingStatus.Paired));
      dispatch(connectionActions.lastConnectedDeviceSet(device?.id ?? null));
      if (device) {
        const updatedDevice = {
          ...device,
          pairingStatus: PairingStatus.Paired,
          capabilities: capabilities ?? device.capabilities,
          lastConnectedAt: Date.now(),
        };
        if (repository) {
          repository
            .save(updatedDevice)
            .then(() => {
              dispatch(tvActions.deviceSaved(updatedDevice));
            })
            .catch(err => {
              console.warn(
                '[SmartRemote][StoreBridge] Failed to persist connected device to repository:',
                err,
              );
            });
          repository.setLastSelectedId(device.id).catch(() => undefined);
        } else {
          dispatch(tvActions.deviceSaved(updatedDevice));
        }
      }
    } else if (state === TVConnectionState.Error && error instanceof TVPairingError) {
      dispatch(connectionActions.pairingStatusChanged(PairingStatus.Failed));
    }

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(
        `[SmartRemote][StoreBridge] State='${state}', device='${device?.id ?? 'none'}', caps=${Boolean(capabilities)}`,
      );
    }
  });
}

function errorCode(error: Error): string {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : 'unknown';
}

