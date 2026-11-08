import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DeveloperSettingsScreen } from '../../presentation/screens/DeveloperSettingsScreen';
import { AppNavigator } from '../../presentation/navigation/AppNavigator';
import { ContainerProvider } from '../../presentation/context/ContainerContext';
import { createContainer } from '../../di/container';
import { makeWebOSDevice } from '../../testing/fixtures';
import { tvActions } from '../../store/slices/tvSlice';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';

const testMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

describe('AppNavigator Component', () => {
  it('renders all three navigation tabs and boots on Remote screen', async () => {
    const mockAdapter = new MockTVAdapter();
    const container = createContainer({
      adapterFactory: {
        create: () => mockAdapter,
        supports: () => true,
      },
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={testMetrics}>
          <Provider store={container.store}>
            <ContainerProvider container={container}>
              <AppNavigator />
            </ContainerProvider>
          </Provider>
        </SafeAreaProvider>,
      );
    });

    // Remote screen root element should be rendered
    const remoteScreen = renderer!.root.findByProps({ testID: 'remote-screen' });
    expect(remoteScreen).toBeDefined();

    // Verify Tab labels are present
    const remoteLabel = renderer!.root.findByProps({ children: 'Remote' });
    const discoveryLabel = renderer!.root.findByProps({ children: 'TVs' });
    const settingsLabel = renderer!.root.findByProps({ children: 'Settings' });

    expect(remoteLabel).toBeDefined();
    expect(discoveryLabel).toBeDefined();
    expect(settingsLabel).toBeDefined();

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });
  it('navigates from Settings to the separate developer screen and back', async () => {
    const container = createContainer();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => { tree = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={testMetrics}><Provider store={container.store}><ContainerProvider container={container}>
        <AppNavigator initialState={{ index: 2, routes: [{ name: 'Remote' }, { name: 'Discovery' }, { name: 'Settings' }] }} />
      </ContainerProvider></Provider></SafeAreaProvider>); });
    expect(tree.root.findAllByProps({ testID: 'motion-sensitivity-plus' })).toHaveLength(0);
    await ReactTestRenderer.act(async () => { tree.root.findByProps({ testID: 'developer-settings-toggle' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'developer-settings-screen' })).toBeDefined();
    expect(tree.root.findByProps({ testID: 'motion-sensitivity-plus' })).toBeDefined();
    await ReactTestRenderer.act(async () => { tree.root.findByType(DeveloperSettingsScreen).props.navigation.goBack(); });
    expect(tree.root.findAllByProps({ testID: 'developer-settings-screen' })).toHaveLength(0);
    await ReactTestRenderer.act(async () => { tree.unmount(); });
    container.disposeDiagnostics(); container.remotePreferences.dispose();
  });

  it('opens the pinned TV Wake Setup route and returns to Settings', async () => {
    const container = createContainer();
    const tv = makeWebOSDevice({ id: 'wake-navigation' });
    container.store.dispatch(tvActions.savedDevicesLoaded([tv]));
    container.store.dispatch(tvActions.deviceSelected(tv.id));
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={testMetrics}><Provider store={container.store}><ContainerProvider container={container}>
          <AppNavigator initialState={{ index: 2, routes: [{ name: 'Remote' }, { name: 'Discovery' }, { name: 'Settings' }] }} />
        </ContainerProvider></Provider></SafeAreaProvider>);
    });
    await ReactTestRenderer.act(async () => { tree.root.findByProps({ testID: 'tv-wake-setup-link' }).props.onPress(); });
    expect(tree.root.findByProps({ testID: 'tv-wake-setup-screen' })).toBeDefined();
    const route = tree.root.findAll(node => node.props.route?.name === 'TVWakeSetup' && node.props.navigation?.goBack)[0];
    expect(route.props.route.params.deviceId).toBe(tv.id);
    await ReactTestRenderer.act(async () => { route.props.navigation.goBack(); });
    expect(tree.root.findAllByProps({ testID: 'tv-wake-setup-screen' })).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'tv-wake-setup-link' })).toBeDefined();
    await ReactTestRenderer.act(async () => { tree.unmount(); });
    container.disposeDiagnostics(); container.remotePreferences.dispose();
  });

});
