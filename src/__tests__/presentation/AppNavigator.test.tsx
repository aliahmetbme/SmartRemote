import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from '../../presentation/navigation/AppNavigator';
import { ContainerProvider } from '../../presentation/context/ContainerContext';
import { createContainer } from '../../di/container';
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
    const discoveryLabel = renderer!.root.findByProps({ children: 'Discovery' });
    const settingsLabel = renderer!.root.findByProps({ children: 'Settings' });

    expect(remoteLabel).toBeDefined();
    expect(discoveryLabel).toBeDefined();
    expect(settingsLabel).toBeDefined();

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });
});
