import React, { useEffect, useMemo } from 'react';
import { StatusBar } from 'react-native';
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
    activeContainer.useCases.startupRestoration
      .execute()
      .then(result => {
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
        // Non-fatal restoration error (e.g. no saved devices on first launch)
      });
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
