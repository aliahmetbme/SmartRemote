import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface MotionPreferences {
  automaticMotion?: boolean;
  sensitivity: number;
  invertX: boolean;
  invertY: boolean;
  diagnosticMode: boolean;
}
export const defaultMotionPreferences: MotionPreferences = {
  automaticMotion: true, sensitivity: 1, invertX: false, invertY: false, diagnosticMode: false,
};

export interface RemoteState {
  preferencesReady?: boolean;
  preferencesStorageFailed?: boolean;
  motionPreferences?: MotionPreferences;
  motionDiagnosticData?: import('../../presentation/controllers/MotionPointerController').MotionDiagnosticData | null;
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
    preferencesHydrated(state, action: PayloadAction<Partial<MotionPreferences>>) {
      state.motionPreferences = { ...defaultMotionPreferences, ...action.payload };
      state.preferencesReady = true;
    },
    preferencesStorageFailed(state, action: PayloadAction<boolean>) { state.preferencesStorageFailed = action.payload; },
    motionPreferencesChanged(state, action: PayloadAction<Partial<MotionPreferences>>) {
      const next = { ...defaultMotionPreferences, ...state.motionPreferences, ...action.payload };
      next.sensitivity = Math.max(0.4, Math.min(3, Number(next.sensitivity.toFixed(1))));
      state.motionPreferences = next;
    },
    motionDiagnosticSampled(state, action: PayloadAction<RemoteState['motionDiagnosticData']>) {
      state.motionDiagnosticData = action.payload;
    },
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
