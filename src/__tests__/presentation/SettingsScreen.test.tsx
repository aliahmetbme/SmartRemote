import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
    const render = () => {
      currentRenderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={testMetrics}>
          <Provider store={container.store}>
            <ContainerProvider container={container}>
              <SettingsScreen />
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

    return { container, mockAdapter, render, cleanup };
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
      children: 'No TV currently active or connected.',
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
});
