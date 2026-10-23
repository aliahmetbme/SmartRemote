import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TVDiscoveryScreen } from '../../presentation/screens/TVDiscoveryScreen';
import { ContainerProvider } from '../../presentation/context/ContainerContext';
import { createContainer } from '../../di/container';
import { connectionActions } from '../../store/slices/connectionSlice';
import { tvActions } from '../../store/slices/tvSlice';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { TVDevice } from '../../domain/entities/TVDevice';
import { UNKNOWN_CAPABILITIES } from '../../domain/entities/TVCapabilities';
import { PairingStatus } from '../../domain/enums/PairingStatus';
import { TVBrand } from '../../domain/enums/TVBrand';
import { TVPlatform } from '../../domain/enums/TVPlatform';
import { TVProtocol } from '../../domain/enums/TVProtocol';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';
import { makeWebOSDevice } from '../../testing/fixtures';

const testMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

describe('TVDiscoveryScreen Component', () => {
  const dummyDiscovered: TVDevice = makeWebOSDevice({
    id: 'discovered-1',
    name: 'Discovered LG webOS TV',
    ipAddress: '192.168.1.101',
    model: 'webOS-TV',
  });

  const dummySaved: TVDevice = makeWebOSDevice({
    id: 'saved-1',
    name: 'Saved Living Room TV',
    ipAddress: '192.168.1.102',
    model: 'OLED55G2',
  });

  const activeCleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (activeCleanups.length > 0) {
      const c = activeCleanups.pop();
      if (c) await c();
    }
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
              <TVDiscoveryScreen />
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
          currentRenderer = null;
        });
      }
    };
    activeCleanups.push(cleanup);

    return { container, mockAdapter, render, cleanup };
  };

  it('renders initial empty discovery screen', async () => {
    const { render } = createTestEnv();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const empty = renderer!.root.findByProps({ testID: 'discovery-empty' });
    expect(empty).toBeDefined();

    const scanBtn = renderer!.root.findByProps({ testID: 'scan-button' });
    expect(scanBtn).toBeDefined();
  });

  it('triggers scan on Scan button press', async () => {
    const { container, render } = createTestEnv();

    const discoverSpy = jest
      .spyOn(container.useCases.discoverTVs, 'execute')
      .mockResolvedValue([]);

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const scanBtn = renderer!.root.findByProps({ testID: 'scan-button' });
    await ReactTestRenderer.act(async () => {
      await scanBtn.props.onPress();
    });

    expect(discoverSpy).toHaveBeenCalledTimes(1);
  });

  it('displays discovered and saved TV devices', async () => {
    const { container, render } = createTestEnv();

    container.store.dispatch(tvActions.deviceDiscovered(dummyDiscovered));
    container.store.dispatch(tvActions.savedDevicesLoaded([dummySaved]));

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const discoveredItem = renderer!.root.findByProps({
      testID: `device-item-${dummyDiscovered.id}`,
    });
    expect(discoveredItem).toBeDefined();

    const savedItem = renderer!.root.findByProps({
      testID: `device-item-${dummySaved.id}`,
    });
    expect(savedItem).toBeDefined();
  });

  it('validates manual IP address input format', async () => {
    const { render } = createTestEnv();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const ipInput = renderer!.root.findByProps({ testID: 'manual-ip-input' });
    const connectBtn = renderer!.root.findByProps({ testID: 'manual-ip-connect-btn' });

    // Initially disabled because input is empty
    expect(connectBtn.props.disabled).toBe(true);

    // Invalid IP: out of octet range
    await ReactTestRenderer.act(() => {
      ipInput.props.onChangeText('999.1.1.1');
    });
    expect(connectBtn.props.disabled).toBe(true);

    // Invalid IP: invalid characters
    await ReactTestRenderer.act(() => {
      ipInput.props.onChangeText('192.168.abc');
    });
    expect(connectBtn.props.disabled).toBe(true);

    // Valid IPv4 format
    await ReactTestRenderer.act(() => {
      ipInput.props.onChangeText('192.168.1.150');
    });
    expect(connectBtn.props.disabled).toBe(false);
  });

  it('probes manual IP and connects to TV when valid IP is submitted', async () => {
    const { container, render } = createTestEnv();

    const manualDevice: TVDevice = makeWebOSDevice({
      id: 'manual-192-168-1-150',
      name: 'LG WebOS TV (192.168.1.150)',
      ipAddress: '192.168.1.150',
    });

    const probeSpy = jest
      .spyOn(container.useCases.probeManualIP, 'execute')
      .mockResolvedValue(manualDevice);

    const connectSpy = jest
      .spyOn(container.useCases.connectTV, 'execute')
      .mockResolvedValue(manualDevice);

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const ipInput = renderer!.root.findByProps({ testID: 'manual-ip-input' });
    await ReactTestRenderer.act(() => {
      ipInput.props.onChangeText('192.168.1.150');
    });

    const connectBtn = renderer!.root.findByProps({ testID: 'manual-ip-connect-btn' });
    await ReactTestRenderer.act(async () => {
      await connectBtn.props.onPress();
    });

    expect(probeSpy).toHaveBeenCalledWith('192.168.1.150', expect.objectContaining({ timeoutMs: 4000 }));
    expect(connectSpy).toHaveBeenCalledWith(manualDevice);
  });

  it('connects to selected discovered TV device on press', async () => {
    const { container, render } = createTestEnv();

    container.store.dispatch(tvActions.deviceDiscovered(dummyDiscovered));

    const connectSpy = jest
      .spyOn(container.useCases.connectTV, 'execute')
      .mockResolvedValue(dummyDiscovered);

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const connectBtn = renderer!.root.findByProps({
      testID: `connect-btn-${dummyDiscovered.id}`,
    });
    await ReactTestRenderer.act(() => {
      connectBtn.props.onPress();
    });

    expect(connectSpy).toHaveBeenCalledWith(dummyDiscovered);
  });

  it('displays connection error banner when connection error occurs', async () => {
    const { container, render } = createTestEnv();

    container.store.dispatch(
      connectionActions.errorSet({
        code: 'NETWORK_TIMEOUT',
        message: 'Unable to reach TV on 192.168.1.101: connection timed out.',
      }),
    );

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const errorBanner = renderer!.root.findByProps({ testID: 'connection-error-banner' });
    expect(errorBanner).toBeDefined();
    const textNode = errorBanner.findByProps({
      children: 'Unable to reach TV on 192.168.1.101: connection timed out.',
    });
    expect(textNode).toBeDefined();
  });

  it('renders pairing instructions modal during Pairing state with cancel control', async () => {
    const { container, render } = createTestEnv();

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Pairing));

    const disconnectSpy = jest
      .spyOn(container.useCases.disconnectTV, 'execute')
      .mockResolvedValue();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const modal = renderer!.root.findByProps({ testID: 'pairing-modal' });
    expect(modal.props.visible).toBe(true);

    const cancelBtn = renderer!.root.findByProps({ testID: 'pairing-cancel-btn' });
    await ReactTestRenderer.act(() => {
      cancelBtn.props.onPress();
    });

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('renders discovery error banner when discovery fails with unsupported_transport', async () => {
    const { container, render } = createTestEnv();

    container.store.dispatch(
      tvActions.discoveryFailed({
        code: 'unsupported_transport',
        message: 'SSDP multicast discovery on iOS requires Apple restricted multicast entitlement.',
      }),
    );

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const banner = renderer!.root.findByProps({ testID: 'discovery-error-banner' });
    expect(banner).toBeDefined();

    const title = banner.findByProps({ children: 'Automatic Discovery Unavailable' });
    expect(title).toBeDefined();

    const message = banner.findByProps({
      children: 'SSDP multicast discovery on iOS requires Apple restricted multicast entitlement.',
    });
    expect(message).toBeDefined();
  });

  it('dismisses discovery error banner when dismiss button is pressed', async () => {
    const { container, render } = createTestEnv();

    container.store.dispatch(
      tvActions.discoveryFailed({
        code: 'permission_denied',
        message: 'Local network permission denied.',
      }),
    );

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    expect(renderer!.root.findByProps({ testID: 'discovery-error-banner' })).toBeDefined();

    const dismissBtn = renderer!.root.findByProps({ testID: 'dismiss-discovery-error-btn' });
    await ReactTestRenderer.act(() => {
      dismissBtn.props.onPress();
    });

    expect(renderer!.root.findAllByProps({ testID: 'discovery-error-banner' })).toHaveLength(0);
  });

  it('attempts direct WebSocket pairing when quick probe fails during manual IP connect', async () => {
    const { container, render } = createTestEnv();

    jest
      .spyOn(container.useCases.probeManualIP, 'execute')
      .mockRejectedValue(new Error('Probe timeout on port 3000'));

    const connectSpy = jest
      .spyOn(container.useCases.connectTV, 'execute')
      .mockResolvedValue({
        id: 'manual-lg-192.168.1.180',
        name: 'LG webOS TV (192.168.1.180)',
        brand: TVBrand.LG,
        ipAddress: '192.168.1.180',
        platform: TVPlatform.WebOS,
        protocol: TVProtocol.LGWebOSSSAP,
        capabilities: UNKNOWN_CAPABILITIES,
        pairingStatus: PairingStatus.Unpaired,
      });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const ipInput = renderer!.root.findByProps({ testID: 'manual-ip-input' });
    await ReactTestRenderer.act(() => {
      ipInput.props.onChangeText('192.168.1.180');
    });

    const connectBtn = renderer!.root.findByProps({ testID: 'manual-ip-connect-btn' });
    await ReactTestRenderer.act(async () => {
      await connectBtn.props.onPress();
    });

    expect(connectSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: '192.168.1.180',
        protocol: TVProtocol.LGWebOSSSAP,
      }),
    );
  });
});
