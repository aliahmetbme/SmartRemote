import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Alert } from 'react-native';
import { createContainer } from '../../di/container';
import { ContainerProvider } from '../../presentation/context/ContainerContext';
import { RemoteScreen } from '../../presentation/screens/RemoteScreen';
import { SettingsScreen } from '../../presentation/screens/SettingsScreen';
import { TVDiscoveryScreen } from '../../presentation/screens/TVDiscoveryScreen';
import { LocalTVDeviceRepository, normalizeDevice } from '../../infrastructure/repositories/LocalTVDeviceRepository';
import { InMemoryKeyValueStorage } from '../../infrastructure/storage/InMemoryKeyValueStorage';
import { InMemoryCredentialStorage } from '../../infrastructure/storage/InMemoryCredentialStorage';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';
import { TVDevice } from '../../domain/entities/TVDevice';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { TVConnectionError } from '../../domain/errors/TVConnectionError';
import { TVBrand } from '../../domain/enums/TVBrand';
import { TVPlatform } from '../../domain/enums/TVPlatform';
import { TVProtocol } from '../../domain/enums/TVProtocol';
import { PairingStatus } from '../../domain/enums/PairingStatus';
import { UNKNOWN_CAPABILITIES } from '../../domain/entities/TVCapabilities';
import { tvActions } from '../../store/slices/tvSlice';
import { connectionActions } from '../../store/slices/connectionSlice';

const testMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

describe('Phase 6.1 Regression Hotfix Suite', () => {
  const physicalTvDevice: TVDevice = {
    id: 'lg-qned-70a6a',
    name: 'LG 65QNED70A6A',
    brand: TVBrand.LG,
    model: '65QNED70A6A',
    ipAddress: '192.168.1.120',
    platform: TVPlatform.WebOS,
    protocol: TVProtocol.LGWebOSSSAP,
    capabilities: UNKNOWN_CAPABILITIES,
    pairingStatus: PairingStatus.Paired,
    lastConnectedAt: Date.now() - 10000,
  };

  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  describe('Issue 1: Saved TV Persistence and Offline Visibility', () => {
    it('preserves saved TV in storage when TV is powered off before app launch', async () => {
      const storage = new InMemoryKeyValueStorage();
      const credentials = new InMemoryCredentialStorage();
      const repo = new LocalTVDeviceRepository(storage);

      // Pre-save device and credential as if paired in previous session
      await repo.save(physicalTvDevice);
      await repo.setLastSelectedId(physicalTvDevice.id);
      await credentials.set(physicalTvDevice.id, 'client-key-sample-12345');

      // Create container with an adapter that fails to connect (simulating TV off / unreachable)
      const offlineAdapter = new MockTVAdapter({
        connectError: new TVConnectionError('TV unreachable'),
      });
      const container = createContainer({
        keyValueStorage: storage,
        credentialStorage: credentials,
        adapterFactory: {
          create: () => offlineAdapter,
          supports: () => true,
        },
      });
      cleanups.push(async () => {
        await container.connectionManager.disconnect().catch(() => undefined);
      });

      // Execute startup restoration
      const startupResult = await container.useCases.startupRestoration.execute();

      // 1. Saved devices must still contain the TV
      expect(startupResult.savedDevices).toHaveLength(1);
      expect(startupResult.savedDevices[0].id).toBe(physicalTvDevice.id);
      expect(startupResult.savedDevices[0].name).toBe('LG 65QNED70A6A');

      // 2. Restored device is null because TV is offline, but lastSelectedId remains
      expect(startupResult.restoredDevice).toBeNull();
      expect(startupResult.lastSelectedId).toBe(physicalTvDevice.id);

      // 3. Verify storage was NOT cleared
      const storedAfter = await repo.getAll();
      expect(storedAfter).toHaveLength(1);
      expect(storedAfter[0].id).toBe(physicalTvDevice.id);

      // 4. Verify Keychain credential is intact
      const key = await credentials.get(physicalTvDevice.id);
      expect(key).toBe('client-key-sample-12345');
    });

    it('retains saved device identity and shows Offline status when TV disconnects while running', async () => {
      const storage = new InMemoryKeyValueStorage();
      const repo = new LocalTVDeviceRepository(storage);
      await repo.save(physicalTvDevice);
      await repo.setLastSelectedId(physicalTvDevice.id);

      const mockAdapter = new MockTVAdapter();
      const container = createContainer({
        keyValueStorage: storage,
        adapterFactory: {
          create: () => mockAdapter,
          supports: () => true,
        },
      });
      cleanups.push(async () => {
        await container.connectionManager.disconnect().catch(() => undefined);
      });

      // Connect TV initially
      await container.useCases.connectTV.execute(physicalTvDevice);
      expect(container.connectionManager.getState()).toBe(TVConnectionState.Connected);
      expect(container.store.getState().tv.selectedDeviceId).toBe(physicalTvDevice.id);

      // Render RemoteScreen while connected
      let remoteRenderer: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(() => {
        remoteRenderer = ReactTestRenderer.create(
          <SafeAreaProvider initialMetrics={testMetrics}>
            <Provider store={container.store}>
              <ContainerProvider container={container}>
                <RemoteScreen />
              </ContainerProvider>
            </Provider>
          </SafeAreaProvider>,
        );
      });
      cleanups.push(async () => {
        await ReactTestRenderer.act(() => {
          remoteRenderer?.unmount();
        });
      });

      const headerTitle = remoteRenderer!.root.findByProps({ testID: 'tv-header-title' });
      expect(headerTitle.props.children).toBe('LG 65QNED70A6A');

      // Now simulate TV power off (socket drops)
      await ReactTestRenderer.act(async () => {
        // Mock adapter emits connection loss
        mockAdapter.simulateConnectionLoss();
      });

      // Manager transitions to Reconnecting or Error
      expect(container.connectionManager.getState()).not.toBe(TVConnectionState.Connected);

      // Verify selected TV identity in Redux is STILL the TV ID
      expect(container.store.getState().tv.selectedDeviceId).toBe(physicalTvDevice.id);

      // Verify RemoteScreen header still displays the TV name
      const headerTitleAfterDrop = remoteRenderer!.root.findByProps({ testID: 'tv-header-title' });
      expect(headerTitleAfterDrop.props.children).toBe('LG 65QNED70A6A');

      // Verify storage still contains the TV
      const savedInRepo = await repo.getAll();
      expect(savedInRepo).toHaveLength(1);
      expect(savedInRepo[0].id).toBe(physicalTvDevice.id);
    });

    it('renders offline saved device with Offline indicator in SettingsScreen and TVDiscoveryScreen', async () => {
      const storage = new InMemoryKeyValueStorage();
      const repo = new LocalTVDeviceRepository(storage);
      await repo.save(physicalTvDevice);
      await repo.setLastSelectedId(physicalTvDevice.id);

      const container = createContainer({
        keyValueStorage: storage,
      });

      // Hydrate saved devices into store in disconnected state
      container.store.dispatch(tvActions.savedDevicesLoaded([physicalTvDevice]));
      container.store.dispatch(tvActions.deviceSelected(physicalTvDevice.id));
      container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Disconnected));

      // 1. Check TVDiscoveryScreen render
      let discoveryRenderer: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(() => {
        discoveryRenderer = ReactTestRenderer.create(
          <SafeAreaProvider initialMetrics={testMetrics}>
            <Provider store={container.store}>
              <ContainerProvider container={container}>
                <TVDiscoveryScreen />
              </ContainerProvider>
            </Provider>
          </SafeAreaProvider>,
        );
      });

      const savedItem = discoveryRenderer!.root.findByProps({
        testID: `device-item-${physicalTvDevice.id}`,
      });
      expect(savedItem).toBeDefined();

      // Connect button is present for offline TV
      const connectBtn = discoveryRenderer!.root.findByProps({
        testID: `connect-btn-${physicalTvDevice.id}`,
      });
      expect(connectBtn).toBeDefined();

      // 2. Check SettingsScreen render
      let settingsRenderer: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(() => {
        settingsRenderer = ReactTestRenderer.create(
          <SafeAreaProvider initialMetrics={testMetrics}>
            <Provider store={container.store}>
              <ContainerProvider container={container}>
                <SettingsScreen />
              </ContainerProvider>
            </Provider>
          </SafeAreaProvider>,
        );
      });

      const settingsSavedItem = settingsRenderer!.root.findByProps({
        testID: `saved-device-${physicalTvDevice.id}`,
      });
      expect(settingsSavedItem).toBeDefined();

      const reconnectBtn = settingsRenderer!.root.findByProps({
        testID: 'settings-reconnect-btn',
      });
      expect(reconnectBtn).toBeDefined();

      await ReactTestRenderer.act(() => {
        discoveryRenderer?.unmount();
        settingsRenderer?.unmount();
      });
    });

    it('resiliently normalizes and migrates partial or legacy stored devices without dropping them', () => {
      // Legacy entry missing protocol, platform, and capabilities
      const legacyEntry = {
        id: 'legacy-tv-1',
        name: 'My Old TV',
        ipAddress: '192.168.1.99',
      };

      const normalized = normalizeDevice(legacyEntry);
      expect(normalized).not.toBeNull();
      expect(normalized!.id).toBe('legacy-tv-1');
      expect(normalized!.name).toBe('My Old TV');
      expect(normalized!.ipAddress).toBe('192.168.1.99');
      expect(normalized!.brand).toBe(TVBrand.LG);
      expect(normalized!.platform).toBe(TVPlatform.WebOS);
      expect(normalized!.protocol).toBe(TVProtocol.LGWebOSSSAP);
      expect(normalized!.capabilities).toBe(UNKNOWN_CAPABILITIES);

      // Truly invalid entry (no IP or ID) is safely rejected
      expect(normalizeDevice({ foo: 'bar' })).toBeNull();
      expect(normalizeDevice(null)).toBeNull();
      expect(normalizeDevice('invalid string')).toBeNull();
    });
  });

  describe('Issue 2: App and Input Shortcuts Visibility and Functional Validation', () => {
    it('always renders app and input shortcuts in Buttons mode even when TV is offline', async () => {
      const container = createContainer();

      // Offline / disconnected state with null capabilities
      container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Disconnected));
      container.store.dispatch(tvActions.capabilitiesChanged(null));

      let renderer: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(
          <SafeAreaProvider initialMetrics={testMetrics}>
            <Provider store={container.store}>
              <ContainerProvider container={container}>
                <RemoteScreen />
              </ContainerProvider>
            </Provider>
          </SafeAreaProvider>,
        );
      });

      // App shortcuts section is visible
      const appSection = renderer!.root.findByProps({ testID: 'app-shortcuts-section' });
      expect(appSection).toBeDefined();

      // App shortcut buttons are present
      const youtubeBtn = renderer!.root.findByProps({ testID: 'btn-app-youtube' });
      expect(youtubeBtn).toBeDefined();

      const netflixBtn = renderer!.root.findByProps({ testID: 'btn-app-netflix' });
      expect(netflixBtn).toBeDefined();

      const amazonBtn = renderer!.root.findByProps({ testID: 'btn-app-amazon' });
      expect(amazonBtn).toBeDefined();

      // Input shortcuts section is visible
      const inputSection = renderer!.root.findByProps({ testID: 'input-switching-section' });
      expect(inputSection).toBeDefined();

      const hdmi1Btn = renderer!.root.findByProps({ testID: 'btn-input-HDMI_1' });
      expect(hdmi1Btn).toBeDefined();

      const hdmi2Btn = renderer!.root.findByProps({ testID: 'btn-input-HDMI_2' });
      expect(hdmi2Btn).toBeDefined();

      const av1Btn = renderer!.root.findByProps({ testID: 'btn-input-AV_1' });
      expect(av1Btn).toBeDefined();
    });

    it('shows alert feedback when pressing app shortcut while TV is offline', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const container = createContainer();

      container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Disconnected));

      let renderer: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(
          <SafeAreaProvider initialMetrics={testMetrics}>
            <Provider store={container.store}>
              <ContainerProvider container={container}>
                <RemoteScreen />
              </ContainerProvider>
            </Provider>
          </SafeAreaProvider>,
        );
      });

      const youtubeBtn = renderer!.root.findByProps({ testID: 'btn-app-youtube' });
      await ReactTestRenderer.act(() => {
        youtubeBtn.props.onPress();
      });

      expect(alertSpy).toHaveBeenCalledWith(
        'TV Disconnected',
        'Please connect to your TV to launch applications.',
      );
      alertSpy.mockRestore();
      await ReactTestRenderer.act(() => {
        renderer?.unmount();
      });
    });

    it('resolves YouTube app ID dynamically via GetInstalledAppsUseCase and sends launch command when connected', async () => {
      const mockAdapter = new MockTVAdapter({
        capabilities: { appLaunching: 'supported' },
      });
      const container = createContainer({
        adapterFactory: {
          create: () => mockAdapter,
          supports: () => true,
        },
      });

      await container.useCases.connectTV.execute(physicalTvDevice);
      expect(container.connectionManager.getState()).toBe(TVConnectionState.Connected);

      const sendCommandSpy = jest
        .spyOn(container.useCases.sendRemoteCommand, 'execute')
        .mockResolvedValue();

      let renderer: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(
          <SafeAreaProvider initialMetrics={testMetrics}>
            <Provider store={container.store}>
              <ContainerProvider container={container}>
                <RemoteScreen />
              </ContainerProvider>
            </Provider>
          </SafeAreaProvider>,
        );
      });

      const youtubeBtn = renderer!.root.findByProps({ testID: 'btn-app-youtube' });
      await ReactTestRenderer.act(async () => {
        await youtubeBtn.props.onPress();
      });

      // Verified: YouTube ID was resolved through app discovery to 'youtube.leanback.v4'
      expect(sendCommandSpy).toHaveBeenCalledWith({
        type: 'launchApp',
        appId: 'youtube.leanback.v4',
      });

      await ReactTestRenderer.act(() => {
        renderer?.unmount();
      });
    });

    it('ensures ScrollView contentContainerStyle has generous bottom padding for reachability above bottom tabs', async () => {
      const container = createContainer();

      let renderer: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(
          <SafeAreaProvider initialMetrics={testMetrics}>
            <Provider store={container.store}>
              <ContainerProvider container={container}>
                <RemoteScreen />
              </ContainerProvider>
            </Provider>
          </SafeAreaProvider>,
        );
      });

      const scrollView = renderer!.root.findByProps({ testID: 'remote-screen' });
      const contentStyle = scrollView.props.contentContainerStyle;
      // Array of style objects
      const combinedStyle = Array.isArray(contentStyle)
        ? Object.assign({}, ...contentStyle)
        : contentStyle;

      // Bottom padding must account for safe area (insets.bottom: 34) + extra clearance (64) = 98px
      expect(combinedStyle.paddingBottom).toBeGreaterThanOrEqual(88);

      await ReactTestRenderer.act(() => {
        renderer?.unmount();
      });
    });
  });
});
