import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DeveloperSettingsScreen } from '../../presentation/screens/DeveloperSettingsScreen';
import { SettingsScreen } from '../../presentation/screens/SettingsScreen';
import { ContainerProvider } from '../../presentation/context/ContainerContext';
import { createContainer } from '../../di/container';
import { connectionActions } from '../../store/slices/connectionSlice';
import { tvActions } from '../../store/slices/tvSlice';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { TVDevice } from '../../domain/entities/TVDevice';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';
import { makeWebOSDevice } from '../../testing/fixtures';

const testMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

describe('SettingsScreen Component', () => {
  const dummySaved: TVDevice = makeWebOSDevice({
    id: 'saved-tv-1',
    name: 'Bedroom LG TV',
    ipAddress: '192.168.1.120',
  });

  const createTestEnv = () => {
    const mockAdapter = new MockTVAdapter();
    const container = createContainer({
      adapterFactory: {
        create: () => mockAdapter,
        supports: () => true,
      },
    });

    let currentRenderer: ReactTestRenderer.ReactTestRenderer | null = null;
    const navigateDeveloper = jest.fn();
    const render = (developer = false) => {
      currentRenderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={testMetrics}>
          <Provider store={container.store}>
            <ContainerProvider container={container}>
              {developer ? <DeveloperSettingsScreen /> : <SettingsScreen onNavigateToDeveloper={navigateDeveloper} />}
            </ContainerProvider>
          </Provider>
        </SafeAreaProvider>,
      );
      return currentRenderer;
    };

    const cleanup = async () => {
      if (currentRenderer) {
        await ReactTestRenderer.act(() => {
          currentRenderer?.unmount();
        });
      }
    };

    return { container, mockAdapter, render, cleanup, navigateDeveloper };
  };

  it('renders settings screen with empty state when no TV connected', async () => {
    const { render, cleanup } = createTestEnv();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const root = renderer!.root.findByProps({ testID: 'settings-screen' });
    expect(root).toBeDefined();

    const emptyText = renderer!.root.findByProps({
      children: 'Choose a TV from the TVs tab to get started.',
    });
    expect(emptyText).toBeDefined();

    await cleanup();
  });

  it('displays connection diagnostics and disconnect control when TV is active', async () => {
    const { container, render, cleanup } = createTestEnv();

    container.store.dispatch(tvActions.savedDevicesLoaded([dummySaved]));
    container.store.dispatch(tvActions.deviceSelected(dummySaved.id));
    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));

    const disconnectSpy = jest
      .spyOn(container.useCases.disconnectTV, 'execute')
      .mockResolvedValue();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const tvNames = renderer!.root.findAllByProps({ children: 'Bedroom LG TV' });
    expect(tvNames.length).toBeGreaterThan(0);

    const disconnectBtn = renderer!.root.findByProps({ testID: 'settings-disconnect-btn' });
    expect(disconnectBtn).toBeDefined();

    await ReactTestRenderer.act(async () => {
      await disconnectBtn.props.onPress();
    });

    expect(disconnectSpy).toHaveBeenCalledTimes(1);

    await cleanup();
  });

  it('prompts user confirmation on Forget device and removes device from repository', async () => {
    const { container, render, cleanup } = createTestEnv();

    container.store.dispatch(tvActions.savedDevicesLoaded([dummySaved]));
    container.store.dispatch(tvActions.deviceSelected(dummySaved.id));

    const removeRepoSpy = jest
      .spyOn(container.deviceRepository, 'remove')
      .mockResolvedValue();

    const alertSpy = jest.spyOn(Alert, 'alert');

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    await ReactTestRenderer.act(async () => { renderer!.root.findByProps({ testID: 'tv-details-toggle' }).props.onPress(); });
    const forgetBtn = renderer!.root.findByProps({ testID: `forget-btn-${dummySaved.id}` });
    await ReactTestRenderer.act(() => {
      forgetBtn.props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Forget Device',
      expect.stringContaining('Bedroom LG TV'),
      expect.any(Array),
    );

    // Simulate clicking "Forget" in the Alert buttons
    const buttons = alertSpy.mock.calls[0][2]!;
    const confirmButton = buttons.find(b => b.text === 'Forget')!;

    await ReactTestRenderer.act(async () => {
      await confirmButton.onPress?.();
    });

    expect(removeRepoSpy).toHaveBeenCalledWith(dummySaved.id);

    await cleanup();
  });
  it('navigates to separate Developer Settings and retains relocated sensitivity and inversion without sampling', async () => {
    const { container, render, cleanup, navigateDeveloper } = createTestEnv();
    const start = jest.spyOn(container.motionSensorService, 'start');
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => { tree = render(); });
    expect(tree.root.findAllByProps({ testID: 'motion-sensitivity-plus' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'motion-invert-x-toggle' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'developer-settings-screen' })).toHaveLength(0);
    await ReactTestRenderer.act(async () => { tree.root.findByProps({ testID: 'developer-settings-toggle' }).props.onPress(); });
    expect(navigateDeveloper).toHaveBeenCalledTimes(1);
    await cleanup();
    await ReactTestRenderer.act(async () => { tree = render(true); });
    await ReactTestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'motion-sensitivity-plus' }).props.onPress();
      tree.root.findByProps({ testID: 'motion-invert-x-toggle' }).props.onPress();
      tree.root.findByProps({ testID: 'motion-invert-y-toggle' }).props.onPress();
      tree.root.findByProps({ testID: 'motion-diag-toggle' }).props.onPress();
    });
    expect(container.store.getState().remote.motionPreferences).toEqual({ automaticMotion: true, sensitivity: 1.2, invertX: true, invertY: true, diagnosticMode: true });
    expect(JSON.stringify(tree.toJSON())).not.toMatch(/clientKey|privateKey|pairingToken|TLS bypass/);
    await cleanup();
    await ReactTestRenderer.act(async () => { tree = render(true); });
    expect(tree.root.findByProps({ testID: 'motion-sensitivity-value' }).props.children.join('')).toBe('1.2x');
    expect(start).not.toHaveBeenCalled();
    await cleanup();
  });
  it('shows one selected TV name and honest wake configuration, with technical addresses hidden until details', async () => {
    const { container, render, cleanup } = createTestEnv();
    container.store.dispatch(tvActions.savedDevicesLoaded([dummySaved]));
    container.store.dispatch(tvActions.deviceSelected(dummySaved.id));
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => { tree = render(); });
    const json = JSON.stringify(tree.toJSON());
    expect(json.split(dummySaved.name)).toHaveLength(2);
    expect(json).not.toContain(dummySaved.ipAddress);
    expect(json).not.toMatch(/Wake enabled|Wake supported|WoL Enabled/);
    await ReactTestRenderer.act(async () => { tree.root.findByProps({ testID: 'tv-details-toggle' }).props.onPress(); });
    expect(JSON.stringify(tree.toJSON())).toContain(dummySaved.ipAddress);
    await cleanup();
  });
});
