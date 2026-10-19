import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { TVCapabilities } from '../../domain/entities/TVCapabilities';
import { TVDevice } from '../../domain/entities/TVDevice';
import { TVDiscoveryErrorCode } from '../../domain/errors/TVDiscoveryError';

export type DiscoveryStatus = 'idle' | 'scanning' | 'completed' | 'failed';

export interface TVDiscoveryErrorInfo {
  code: TVDiscoveryErrorCode | 'unknown';
  message: string;
}

export interface TVState {
  discoveredDevices: TVDevice[];
  selectedDeviceId: string | null;
  savedDevices: TVDevice[];
  /** Capabilities of the active TV, once connected. */
  capabilities: TVCapabilities | null;
  discoveryStatus: DiscoveryStatus;
  discoveryError: TVDiscoveryErrorInfo | null;
}

export const initialTVState: TVState = {
  discoveredDevices: [],
  selectedDeviceId: null,
  savedDevices: [],
  capabilities: null,
  discoveryStatus: 'idle',
  discoveryError: null,
};

const upsert = (list: TVDevice[], device: TVDevice) => {
  const i = list.findIndex(d => d.id === device.id);
  if (i >= 0) {
    list[i] = device;
  } else {
    list.push(device);
  }
};

const tvSlice = createSlice({
  name: 'tv',
  initialState: initialTVState,
  reducers: {
    discoveryStarted(state) {
      state.discoveredDevices = [];
      state.discoveryStatus = 'scanning';
      state.discoveryError = null;
    },
    deviceDiscovered(state, action: PayloadAction<TVDevice>) {
      upsert(state.discoveredDevices, action.payload);
    },
    discoveryCompleted(state) {
      state.discoveryStatus = 'completed';
      state.discoveryError = null;
    },
    discoveryFailed(state, action: PayloadAction<TVDiscoveryErrorInfo | undefined>) {
      state.discoveryStatus = 'failed';
      state.discoveryError = action.payload ?? {
        code: 'unknown',
        message: 'Device discovery failed. Please try again or use manual IP connection.',
      };
    },
    discoveryErrorDismissed(state) {
      state.discoveryError = null;
    },
    deviceSelected(state, action: PayloadAction<string | null>) {
      state.selectedDeviceId = action.payload;
    },
    savedDevicesLoaded(state, action: PayloadAction<TVDevice[]>) {
      state.savedDevices = action.payload;
    },
    deviceSaved(state, action: PayloadAction<TVDevice>) {
      upsert(state.savedDevices, action.payload);
    },
    deviceForgotten(state, action: PayloadAction<string>) {
      state.savedDevices = state.savedDevices.filter(d => d.id !== action.payload);
      if (state.selectedDeviceId === action.payload) {
        state.selectedDeviceId = null;
      }
    },
    capabilitiesChanged(state, action: PayloadAction<TVCapabilities | null>) {
      state.capabilities = action.payload;
    },
  },
});

export const tvActions = tvSlice.actions;
export default tvSlice.reducer;
