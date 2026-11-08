/** Explicit development-only entry: genuine app screens with in-memory, synthetic TV fixtures. */
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ContainerProvider } from '../presentation/context/ContainerContext';
import { AppNavigator } from '../presentation/navigation/AppNavigator';
import { createContainer, type AppContainer } from '../di/container';
import { MockTVAdapter } from '../infrastructure/adapters/mock/MockTVAdapter';
import { TVTimeoutError } from '../domain/errors/TVConnectionError';
import { makeMockDevice } from '../testing/fixtures';
import scenario from './screenshotScenario.json';
import { tvActions } from '../store/slices/tvSlice';
import { theme } from '../presentation/theme';

export async function createScreenshotContainer(recovery: boolean) {
  const container = createContainer({
    adapterFactory: {
      create: () => new MockTVAdapter(recovery ? { connectError: new TVTimeoutError('Simulated connection timeout') } : {}),
      supports: () => true,
    },
    motionSensorService: { isAvailable: async () => false, start: async () => {}, stop: async () => {}, isTracking: () => false },
    readNetworkStatus: async () => ({ wifi: null, localTransport: null }),
  });
  const tv = makeMockDevice({ id: 'demo-living-room', name: 'Living Room · Demo TV', ipAddress: '192.0.2.10' });
  const bedroom = makeMockDevice({ id: 'demo-bedroom', name: 'Bedroom · Demo TV', ipAddress: '192.0.2.20' });
  await container.deviceRepository.save(tv);
  await container.deviceRepository.save(bedroom);
  await container.deviceRepository.setLastSelectedId(tv.id);
  const hydration = await container.useCases.hydrateDevices.execute();
  container.store.dispatch(tvActions.savedDevicesLoaded(hydration.savedDevices));
  await container.remotePreferences.ready;
  await container.useCases.connectTV.execute(tv).catch(() => undefined);
  return container;
}
export default function ScreenshotApp() {
  const selectedScenario = scenario.scenario;
  const selectedScreen = scenario.screen;
  const [container, setContainer] = useState<AppContainer | null>(null);
  useEffect(() => {
    if (!__DEV__) return;
    setContainer(null);
    let current = true;
    let fixture: AppContainer | null = null;
    createScreenshotContainer(selectedScenario === 'recovery').then(value => {
      fixture = value;
      if (current) setContainer(value);
      else { value.disposeDiagnostics(); value.remotePreferences.dispose(); value.connectionManager.disconnect(); }
    });
    return () => { current = false; fixture?.disposeDiagnostics(); fixture?.remotePreferences.dispose(); fixture?.connectionManager.disconnect(); };
  }, [selectedScenario, selectedScreen]);
  return container && __DEV__ ? <Provider store={container.store}><ContainerProvider container={container}><SafeAreaProvider>
    <StatusBar barStyle="light-content" />
    <AppNavigator key={`${selectedScenario}-${selectedScreen}`} initialState={{ index: selectedScreen === 'settings' || selectedScreen === 'wake' ? 2 : 0, routes: [
      { name: 'Remote', params: { initialMode: selectedScreen === 'pointer' ? 'pointer' : 'buttons' } }, { name: 'Discovery' }, { name: 'Settings', ...(selectedScreen === 'wake' ? { state: { index: 1, routes: [{ name: 'SettingsHome' }, { name: 'TVWakeSetup', params: { deviceId: 'demo-living-room' } }] } } : {}) },
    ] }} />
  </SafeAreaProvider></ContainerProvider></Provider> : <View style={styles.loading} />;
}

const styles = StyleSheet.create({ loading: { flex: 1, backgroundColor: theme.colors.background } });
