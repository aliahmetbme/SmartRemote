import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PairingStatus } from '../../domain/enums/PairingStatus';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';

export interface SerializableError {
  code: string;
  message: string;
}

export interface ConnectionSliceState {
  status: TVConnectionState;
  pairingStatus: PairingStatus;
  error: SerializableError | null;
  lastConnectedDeviceId: string | null;
}

export const initialConnectionState: ConnectionSliceState = {
  status: TVConnectionState.Disconnected,
  pairingStatus: PairingStatus.Unpaired,
  error: null,
  lastConnectedDeviceId: null,
};

const connectionSlice = createSlice({
  name: 'connection',
  initialState: initialConnectionState,
  reducers: {
    statusChanged(state, action: PayloadAction<TVConnectionState>) {
      state.status = action.payload;
    },
    pairingStatusChanged(state, action: PayloadAction<PairingStatus>) {
      state.pairingStatus = action.payload;
    },
    errorSet(state, action: PayloadAction<SerializableError | null>) {
      state.error = action.payload;
    },
    lastConnectedDeviceSet(state, action: PayloadAction<string | null>) {
      state.lastConnectedDeviceId = action.payload;
    },
  },
});

export const connectionActions = connectionSlice.actions;
export default connectionSlice.reducer;
