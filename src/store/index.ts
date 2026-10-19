import { combineReducers, configureStore } from '@reduxjs/toolkit';
import connectionReducer from './slices/connectionSlice';
import remoteReducer from './slices/remoteSlice';
import tvReducer from './slices/tvSlice';

const rootReducer = combineReducers({
  tv: tvReducer,
  connection: connectionReducer,
  remote: remoteReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

export function createAppStore(preloadedState?: Partial<RootState>) {
  return configureStore({ reducer: rootReducer, preloadedState });
}

export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore['dispatch'];
