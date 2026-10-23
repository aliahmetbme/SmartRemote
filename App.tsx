import React, { useEffect, useMemo } from 'react';
import { AppState, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { AppContainer, createProductionContainer } from './src/di/container';
import { ContainerProvider } from './src/presentation/context/ContainerContext';
import { AppNavigator } from './src/presentation/navigation/AppNavigator';

import { tvActions } from './src/store/slices/tvSlice';

export interface AppProps {
  container?: AppContainer;
}

function App({ container }: AppProps) {
  const activeContainer = useMemo(() => container ?? createProductionContainer(), [container]);

  useEffect(() => {
    // Stage 1: Immediate repository hydration (independent of network)
    Promise.all([
      activeContainer.deviceRepository.getAll(),
      activeContainer.deviceRepository.getLastSelectedId(),
    ])
      .then(([saved, lastSelected]) => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(
            `[SmartRemote][Startup] Hydrated ${saved.length} device(s) from storage, lastSelectedId='${lastSelected}'`,
          );
        }
        activeContainer.store.dispatch(tvActions.savedDevicesLoaded(saved));
        if (lastSelected) {
          activeContainer.store.dispatch(tvActions.deviceSelected(lastSelected));
        } else if (saved.length > 0) {
          activeContainer.store.dispatch(tvActions.deviceSelected(saved[0].id));
        }
      })
      .catch(err => {
        console.warn('[SmartRemote][Startup] Failed to load saved devices from repository', err);
      });

    // Stage 2: Network restoration of last active session
    activeContainer.useCases.startupRestoration
      .execute()
      .then(result => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(
            `[SmartRemote][Startup] Restoration completed: restored='${result.restoredDevice?.id ?? 'none'}', savedCount=${result.savedDevices.length}, error='${result.error?.message ?? 'none'}'`,
          );
        }
        if (result.savedDevices.length > 0) {
          activeContainer.store.dispatch(tvActions.savedDevicesLoaded(result.savedDevices));
        }
        if (result.restoredDevice) {
          activeContainer.store.dispatch(tvActions.deviceSelected(result.restoredDevice.id));
        } else if (result.lastSelectedId) {
          activeContainer.store.dispatch(tvActions.deviceSelected(result.lastSelectedId));
        }
      })
      .catch(() => {
        // Non-fatal restoration error (e.g. TV offline or no saved devices on first launch)
      });

    // Stage 3: AppState lifecycle monitoring for foreground liveness & background suspension
    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        activeContainer.connectionManager.handleAppForeground();
      } else if (nextState === 'background') {
        activeContainer.connectionManager.handleAppBackground();
      }
    });

    return () => {
      appStateSub.remove();
    };
  }, [activeContainer]);

  return (
    <Provider store={activeContainer.store}>
      <ContainerProvider container={activeContainer}>
        <SafeAreaProvider>
          <StatusBar barStyle="light-content" />
          <AppNavigator />
        </SafeAreaProvider>
      </ContainerProvider>
    </Provider>
  );
}

export default App;
