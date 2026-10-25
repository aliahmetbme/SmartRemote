import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Alert } from 'react-native';
import { createContainer } from '../../di/container';
import { ContainerProvider } from '../../presentation/context/ContainerContext';
import { RemoteScreen } from '../../presentation/screens/RemoteScreen';
import { SettingsScreen } from '../../presentation/screens/SettingsScreen';
import { TVDevice } from '../../domain/entities/TVDevice';
import { TVBrand } from '../../domain/enums/TVBrand';
import { TVPlatform } from '../../domain/enums/TVPlatform';
import { TVProtocol } from '../../domain/enums/TVProtocol';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { PairingStatus } from '../../domain/enums/PairingStatus';
import { UNKNOWN_CAPABILITIES } from '../../domain/entities/TVCapabilities';
import { tvActions } from '../../store/slices/tvSlice';
import { connectionActions } from '../../store/slices/connectionSlice';
import { InMemoryKeyValueStorage } from '../../infrastructure/storage/InMemoryKeyValueStorage';
import { InMemoryCredentialStorage } from '../../infrastructure/storage/InMemoryCredentialStorage';
import { LocalTVDeviceRepository } from '../../infrastructure/repositories/LocalTVDeviceRepository';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';

const testMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

describe('Phase 8 — Integration: Power Workflow, Settings, & UI Orchestration', () => {
  const lgTvWithMac: TVDevice = {
    id: 'lg-qned-70a6a',
    name: 'LG 65QNED70A6A',
    brand: TVBrand.LG,
    model: '65QNED70A6A',
    ipAddress: '192.168.1.120',
    macAddress: 'E8:D0:FC:12:34:56',
    platform: TVPlatform.WebOS,
    protocol: TVProtocol.LGWebOSSSAP,
    capabilities: UNKNOWN_CAPABILITIES,
    pairingStatus: PairingStatus.Paired,
    lastConnectedAt: Date.now() - 5000,
  };

  const lgTvWithoutMac: TVDevice = {
    ...lgTvWithMac,
    id: 'lg-tv-no-mac',
    name: 'LG TV (No MAC)',
    macAddress: undefined,
  };

  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('RemoteScreen: Connected state -> Power press triggers powerOff command, does not send Wake-on-LAN', async () => {
    const storage = new InMemoryKeyValueStorage();
    const credentials = new InMemoryCredentialStorage();
    const repo = new LocalTVDeviceRepository(storage);
    await repo.save(lgTvWithMac);

    const mockAdapter = new MockTVAdapter();
    const container = createContainer({
      deviceRepository: repo,
      credentialStorage: credentials,
      adapterFactory: {
        supports: () => true,
        create: () => mockAdapter,
      },
    });

    const sendSpy = jest.spyOn(container.useCases.sendRemoteCommand, 'execute').mockResolvedValue(undefined);
    const wakeSpy = jest.spyOn(container.useCases.wakeTV, 'execute');

    await container.connectionManager.connect(lgTvWithMac);
    container.store.dispatch(tvActions.savedDevicesLoaded([lgTvWithMac]));
    container.store.dispatch(tvActions.deviceSelected(lgTvWithMac.id));

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <Provider store={container.store}>
          <SafeAreaProvider initialMetrics={testMetrics}>
            <ContainerProvider container={container}>
              <RemoteScreen />
            </ContainerProvider>
          </SafeAreaProvider>
        </Provider>,
      );
    });

    // Find power button
    const powerButton = renderer.root.findByProps({ testID: 'btn-power' });
    expect(powerButton).toBeDefined();

    // Press Power
    await act(async () => {
      powerButton.props.onPress();
    });

    // Verified: sendRemoteCommand called with powerOff, wakeTV NOT called
    expect(sendSpy).toHaveBeenCalledWith({ type: 'powerOff' });
    expect(wakeSpy).not.toHaveBeenCalled();
  });

  it('RemoteScreen: Offline + Valid MAC -> Power press triggers WakeTVUseCase', async () => {
    const storage = new InMemoryKeyValueStorage();
    const credentials = new InMemoryCredentialStorage();
    const repo = new LocalTVDeviceRepository(storage);
    await repo.save(lgTvWithMac);

    const mockAdapter = new MockTVAdapter();
    const container = createContainer({
      deviceRepository: repo,
      credentialStorage: credentials,
      adapterFactory: {
        supports: () => true,
        create: () => mockAdapter,
      },
    });

    const sendSpy = jest.spyOn(container.useCases.sendRemoteCommand, 'execute');
    const wakeSpy = jest.spyOn(container.useCases.wakeTV, 'execute').mockResolvedValue({
      success: true,
      restored: true,
      packetsSent: 3,
      destinations: ['192.168.1.255'],
    });

    // TV is disconnected/offline
    container.store.dispatch(tvActions.savedDevicesLoaded([lgTvWithMac]));
    container.store.dispatch(tvActions.deviceSelected(lgTvWithMac.id));
    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Disconnected));

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <Provider store={container.store}>
          <SafeAreaProvider initialMetrics={testMetrics}>
            <ContainerProvider container={container}>
              <RemoteScreen />
            </ContainerProvider>
          </SafeAreaProvider>
        </Provider>,
      );
    });

    const powerButton = renderer.root.findByProps({ testID: 'btn-power' });
    expect(powerButton).toBeDefined();

    await act(async () => {
      powerButton.props.onPress();
    });

    expect(wakeSpy).toHaveBeenCalledWith(lgTvWithMac, expect.any(Object));
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('RemoteScreen: Offline + Missing MAC -> Power press prompts user with Settings navigation Alert', async () => {
    const storage = new InMemoryKeyValueStorage();
    const repo = new LocalTVDeviceRepository(storage);
    await repo.save(lgTvWithoutMac);

    const container = createContainer({
      deviceRepository: repo,
      adapterFactory: {
        supports: () => true,
        create: () => new MockTVAdapter(),
      },
    });

    const wakeSpy = jest.spyOn(container.useCases.wakeTV, 'execute');
    const onNavigateToSettings = jest.fn();

    container.store.dispatch(tvActions.savedDevicesLoaded([lgTvWithoutMac]));
    container.store.dispatch(tvActions.deviceSelected(lgTvWithoutMac.id));
    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Disconnected));

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <Provider store={container.store}>
          <SafeAreaProvider initialMetrics={testMetrics}>
            <ContainerProvider container={container}>
              <RemoteScreen onNavigateToSettings={onNavigateToSettings} />
            </ContainerProvider>
          </SafeAreaProvider>
        </Provider>,
      );
    });

    const powerButton = renderer.root.findByProps({ testID: 'btn-power' });
    await act(async () => {
      powerButton.props.onPress();
    });

    expect(wakeSpy).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'MAC Address Required',
      expect.stringContaining('needs your TV\'s MAC address'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Go to Settings' }),
      ]),
    );

    // Trigger Go to Settings button callback
    const alertButtons = alertSpy.mock.calls[0][2];
    const settingsButton = alertButtons.find((b: { text: string }) => b.text === 'Go to Settings');
    settingsButton.onPress();
    expect(onNavigateToSettings).toHaveBeenCalled();
  });

  it('RemoteScreen: Connecting state keeps Power button enabled and allows explicit Wake', async () => {
    const storage = new InMemoryKeyValueStorage();
    const repo = new LocalTVDeviceRepository(storage);
    await repo.save(lgTvWithMac);

    const container = createContainer({
      deviceRepository: repo,
      adapterFactory: {
        supports: () => true,
        create: () => new MockTVAdapter(),
      },
    });

    const powerTVSpy = jest.spyOn(container.useCases.powerTV, 'execute').mockResolvedValue({
      action: 'wake',
      success: true,
      restored: true,
      device: lgTvWithMac,
    });

    container.store.dispatch(tvActions.savedDevicesLoaded([lgTvWithMac]));
    container.store.dispatch(tvActions.deviceSelected(lgTvWithMac.id));
    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connecting));

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <Provider store={container.store}>
          <SafeAreaProvider initialMetrics={testMetrics}>
            <ContainerProvider container={container}>
              <RemoteScreen />
            </ContainerProvider>
          </SafeAreaProvider>
        </Provider>,
      );
    });

    const powerButton = renderer.root.findByProps({ testID: 'btn-power' });
    expect(powerButton.props.disabled).toBe(false);

    await act(async () => {
      powerButton.props.onPress();
    });

    expect(powerTVSpy).toHaveBeenCalledWith(lgTvWithMac, expect.any(Object));
  });

  it('RemoteScreen: Reconnecting state keeps Power button enabled and allows explicit Wake', async () => {
    const storage = new InMemoryKeyValueStorage();
    const repo = new LocalTVDeviceRepository(storage);
    await repo.save(lgTvWithMac);

    const container = createContainer({
      deviceRepository: repo,
      adapterFactory: {
        supports: () => true,
        create: () => new MockTVAdapter(),
      },
    });

    const powerTVSpy = jest.spyOn(container.useCases.powerTV, 'execute').mockResolvedValue({
      action: 'wake',
      success: true,
      restored: true,
      device: lgTvWithMac,
    });

    container.store.dispatch(tvActions.savedDevicesLoaded([lgTvWithMac]));
    container.store.dispatch(tvActions.deviceSelected(lgTvWithMac.id));
    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Reconnecting));

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <Provider store={container.store}>
          <SafeAreaProvider initialMetrics={testMetrics}>
            <ContainerProvider container={container}>
              <RemoteScreen />
            </ContainerProvider>
          </SafeAreaProvider>
        </Provider>,
      );
    });

    const powerButton = renderer.root.findByProps({ testID: 'btn-power' });
    expect(powerButton.props.disabled).toBe(false);

    await act(async () => {
      powerButton.props.onPress();
    });

    expect(powerTVSpy).toHaveBeenCalledWith(lgTvWithMac, expect.any(Object));
  });

  it('SettingsScreen: Wake-on-LAN card displays stored MAC, allows editing, and saves canonical MAC', async () => {
    const storage = new InMemoryKeyValueStorage();
    const container = createContainer({
      keyValueStorage: storage,
      adapterFactory: {
        supports: () => true,
        create: () => new MockTVAdapter(),
      },
    });

    await container.deviceRepository.save(lgTvWithMac);
    await container.deviceRepository.setLastSelectedId(lgTvWithMac.id);

    container.store.dispatch(tvActions.savedDevicesLoaded([lgTvWithMac]));
    container.store.dispatch(tvActions.deviceSelected(lgTvWithMac.id));

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <Provider store={container.store}>
          <SafeAreaProvider initialMetrics={testMetrics}>
            <ContainerProvider container={container}>
              <SettingsScreen />
            </ContainerProvider>
          </SafeAreaProvider>
        </Provider>,
      );
    });

    // 1. Check displayed MAC
    const macText = renderer.root.findByProps({ testID: 'settings-mac-display' });
    expect(macText.props.children).toBe('E8:D0:FC:12:34:56');

    // 2. Click Edit button
    const editButton = renderer.root.findByProps({ testID: 'edit-mac-btn' });
    await act(async () => {
      editButton.props.onPress();
    });

    // 3. Enter new MAC in hyphen format
    const macInput = renderer.root.findByProps({ testID: 'settings-mac-input' });
    await act(async () => {
      macInput.props.onChangeText('11-22-33-44-55-66');
    });

    // 4. Save
    const saveButton = renderer.root.findByProps({ testID: 'save-mac-btn' });
    await act(async () => {
      saveButton.props.onPress();
    });

    // 5. Verify saved in repo with canonical colon format
    const updated = await container.deviceRepository.getById(lgTvWithMac.id);
    expect(updated?.macAddress).toBe('11:22:33:44:55:66');
    expect(alertSpy).toHaveBeenCalledWith(
      'MAC Address Saved',
      expect.stringContaining('11:22:33:44:55:66'),
    );
  });
});
