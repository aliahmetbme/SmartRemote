import { isValidMacAddress } from '../domain/utils/macValidator';
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
  getState?: () => { tv: { selectedDeviceId: string | null } },
) {
  return manager.subscribe(({ state, device, capabilities, error }) => {
    dispatch(connectionActions.statusChanged(state));
    dispatch(
      connectionActions.errorSet(error ? { code: errorCode(error), message: error.message } : null),
    );
    dispatch(tvActions.capabilitiesChanged(capabilities));

    // Preserve selected device identity without overwriting a newer user selection
    if (device) {
      const currentSelectedId = getState ? getState().tv.selectedDeviceId : null;
      if (!currentSelectedId || currentSelectedId === device.id) {
        dispatch(tvActions.deviceSelected(device.id));
      }
    }

    if (state === TVConnectionState.Pairing) {
      dispatch(connectionActions.pairingStatusChanged(PairingStatus.Pairing));
    } else if (state === TVConnectionState.Connected) {
      dispatch(connectionActions.pairingStatusChanged(PairingStatus.Paired));
      dispatch(connectionActions.lastConnectedDeviceSet(device?.id ?? null));
      if (device) {
        if (repository) {
          const revision = manager.getOperationRevision();
          const isCurrent = () => manager.getOperationRevision() === revision &&
            manager.getState() === TVConnectionState.Connected &&
            manager.getDevice()?.id === device.id &&
            (!getState || getState().tv.selectedDeviceId === device.id);
          repository
            .getById(device.id)
            .then(existing => {
              if (!isCurrent()) return;
              const macAddress = isValidMacAddress(existing?.macAddress) ? existing?.macAddress : device.macAddress;
              const mergedDevice = {
                ...(existing ?? device),
                ...device,
                macAddress,
                pairingStatus: PairingStatus.Paired,
                capabilities: capabilities ?? existing?.capabilities ?? device.capabilities,
                lastConnectedAt: Date.now(),
              };
              return repository.save(mergedDevice, { preserveStoredMac: true, isCurrent }).then(async () => {
                if (!isCurrent()) return;
                await repository.setLastSelectedId(device.id, isCurrent);
                const saved = await repository.getById(device.id);
                if (saved && isCurrent()) dispatch(tvActions.deviceSaved(saved));
              });
            })
            .catch(err => {
              console.warn(
                '[SmartRemote][StoreBridge] Failed to persist connected device to repository:',
                err,
              );
            });
        } else {
          const updatedDevice = {
            ...device,
            pairingStatus: PairingStatus.Paired,
            capabilities: capabilities ?? device.capabilities,
            lastConnectedAt: Date.now(),
          };
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

