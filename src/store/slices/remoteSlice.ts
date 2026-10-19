import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type RemoteMode = 'buttons' | 'touchpad';

export interface RemoteState {
  volume: number | null;
  isMuted: boolean;
  activeInput: string | null;
  selectedRemoteMode: RemoteMode;
}

export const initialRemoteState: RemoteState = {
  volume: null,
  isMuted: false,
  activeInput: null,
  selectedRemoteMode: 'buttons',
};

const remoteSlice = createSlice({
  name: 'remote',
  initialState: initialRemoteState,
  reducers: {
    volumeChanged(state, action: PayloadAction<number | null>) {
      state.volume = action.payload;
    },
    muteChanged(state, action: PayloadAction<boolean>) {
      state.isMuted = action.payload;
    },
    activeInputChanged(state, action: PayloadAction<string | null>) {
      state.activeInput = action.payload;
    },
    remoteModeSelected(state, action: PayloadAction<RemoteMode>) {
      state.selectedRemoteMode = action.payload;
    },
  },
});

export const remoteActions = remoteSlice.actions;
export default remoteSlice.reducer;
