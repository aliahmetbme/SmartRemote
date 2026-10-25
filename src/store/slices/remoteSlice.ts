import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface RemoteState {
  volume: number | null;
  isMuted: boolean;
  activeInput: string | null;
}

export const initialRemoteState: RemoteState = {
  volume: null,
  isMuted: false,
  activeInput: null,
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
  },
});

export const remoteActions = remoteSlice.actions;
export default remoteSlice.reducer;
