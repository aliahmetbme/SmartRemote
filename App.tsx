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
    // Single authoritative startup workflow:
    // onHydrated renders saved devices and selected TV immediately (< 5ms) without waiting on network.
    // Network restoration proceeds asynchronously and non-blockingly in the background.
    activeContainer.useCases.startupRestoration
      .execute({
        onHydrated: ({ savedDevices, selectedDeviceId }) => {
          activeContainer.store.dispatch(tvActions.savedDevicesLoaded(savedDevices));
          if (selectedDeviceId) {
            activeContainer.store.dispatch(tvActions.deviceSelected(selectedDeviceId));
          }
        },
      })
      .then(result => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(
            `[SmartRemote][Startup] Restoration completed: restored='${result.restoredDevice?.id ?? 'none'}', savedCount=${result.savedDevices.length}, error='${result.error?.message ?? 'none'}'`,
          );
        }
      })
      .catch(err => {
        console.warn('[SmartRemote][Startup] Non-fatal restoration error:', err);
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
