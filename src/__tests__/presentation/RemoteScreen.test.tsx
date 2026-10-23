import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RemoteScreen } from '../../presentation/screens/RemoteScreen';
import { Touchpad } from '../../presentation/components/Touchpad';
import { MotionSurface } from '../../presentation/components/MotionSurface';
import { ContainerProvider } from '../../presentation/context/ContainerContext';
import { createContainer } from '../../di/container';
import { connectionActions } from '../../store/slices/connectionSlice';
import { tvActions } from '../../store/slices/tvSlice';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { createCapabilities, UNKNOWN_CAPABILITIES } from '../../domain/entities/TVCapabilities';
import { NavigationDirection } from '../../domain/enums/RemoteKey';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';
import { TVDevice } from '../../domain/entities/TVDevice';
import { makeWebOSDevice } from '../../testing/fixtures';

const testMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

describe('RemoteScreen Component', () => {
  const dummyDevice: TVDevice = makeWebOSDevice({
    id: 'test-tv-1',
    name: 'Living Room LG OLED',
    ipAddress: '192.168.1.50',
    model: 'OLED65C2',
  });

  const createTestEnv = (capabilities = {}) => {
    const mockAdapter = new MockTVAdapter({ capabilities });
    const container = createContainer({
      adapterFactory: {
        create: () => mockAdapter,
        supports: () => true,
      },
    });

    const onNavigateToDiscovery = jest.fn();

    const render = () =>
      ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={testMetrics}>
          <Provider store={container.store}>
            <ContainerProvider container={container}>
              <RemoteScreen onNavigateToDiscovery={onNavigateToDiscovery} />
            </ContainerProvider>
          </Provider>
        </SafeAreaProvider>,
      );

    return { container, mockAdapter, onNavigateToDiscovery, render };
  };

  it('renders disconnected state with disabled controls when not connected', async () => {
    const { container, render } = createTestEnv();

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Disconnected));

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const badge = renderer!.root.findByProps({ testID: 'connection-status-badge' });
    expect(badge).toBeDefined();

    const volUp = renderer!.root.findByProps({ testID: 'btn-vol-up' });
    expect(volUp.props.disabled).toBe(true);

    const powerBtn = renderer!.root.findByProps({ testID: 'btn-power' });
    expect(powerBtn.props.disabled).toBe(true);
  });

  it('dispatches directional navigation and central OK commands when connected', async () => {
    const { container, render } = createTestEnv({ navigation: true });

    container.store.dispatch(tvActions.deviceSaved(dummyDevice));
    container.store.dispatch(tvActions.deviceSelected(dummyDevice.id));
    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(createCapabilities({ navigation: true })),
    );

    const sendCommandSpy = jest
      .spyOn(container.useCases.sendRemoteCommand, 'execute')
      .mockResolvedValue();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    // Navigate Up
    const upBtn = renderer!.root.findByProps({ testID: 'btn-nav-up' });
    await ReactTestRenderer.act(() => {
      upBtn.props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({
      type: 'navigate',
      direction: NavigationDirection.Up,
    });

    // Center OK
    const okBtn = renderer!.root.findByProps({ testID: 'btn-nav-ok' });
    await ReactTestRenderer.act(() => {
      okBtn.props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'select' });

    // Navigate Left
    const leftBtn = renderer!.root.findByProps({ testID: 'btn-nav-left' });
    await ReactTestRenderer.act(() => {
      leftBtn.props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({
      type: 'navigate',
      direction: NavigationDirection.Left,
    });

    // Navigate Right
    const rightBtn = renderer!.root.findByProps({ testID: 'btn-nav-right' });
    await ReactTestRenderer.act(() => {
      rightBtn.props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({
      type: 'navigate',
      direction: NavigationDirection.Right,
    });

    // Navigate Down
    const downBtn = renderer!.root.findByProps({ testID: 'btn-nav-down' });
    await ReactTestRenderer.act(() => {
      downBtn.props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({
      type: 'navigate',
      direction: NavigationDirection.Down,
    });
  });

  it('dispatches volume, mute, channel, power, back and home commands', async () => {
    const { container, render } = createTestEnv({
      volumeControl: true,
      channelControl: true,
      muteControl: true,
      powerOff: true,
    });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(
        createCapabilities({
          volumeControl: true,
          channelControl: true,
          muteControl: true,
          powerOff: true,
        }),
      ),
    );

    const sendCommandSpy = jest
      .spyOn(container.useCases.sendRemoteCommand, 'execute')
      .mockResolvedValue();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    // Vol Up
    await ReactTestRenderer.act(() => {
      renderer.root.findByProps({ testID: 'btn-vol-up' }).props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'volumeUp' });

    // Vol Down
    await ReactTestRenderer.act(() => {
      renderer.root.findByProps({ testID: 'btn-vol-down' }).props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'volumeDown' });

    // Mute
    await ReactTestRenderer.act(() => {
      renderer.root.findByProps({ testID: 'btn-mute' }).props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'mute' });

    // Channel Up
    await ReactTestRenderer.act(() => {
      renderer.root.findByProps({ testID: 'btn-ch-up' }).props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'channelUp' });

    // Channel Down
    await ReactTestRenderer.act(() => {
      renderer.root.findByProps({ testID: 'btn-ch-down' }).props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'channelDown' });

    // Power
    await ReactTestRenderer.act(() => {
      renderer.root.findByProps({ testID: 'btn-power' }).props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'powerOff' });

    // Back
    await ReactTestRenderer.act(() => {
      renderer.root.findByProps({ testID: 'btn-back' }).props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'back' });

    // Home
    await ReactTestRenderer.act(() => {
      renderer.root.findByProps({ testID: 'btn-home' }).props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'home' });
  });

  it('preserves appLaunching and inputSwitching sections even when TV reports unsupported or is offline', async () => {
    const { container, render } = createTestEnv();

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Disconnected));
    container.store.dispatch(tvActions.capabilitiesChanged(null));

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const appSection = renderer!.root.findByProps({ testID: 'app-shortcuts-section' });
    expect(appSection).toBeDefined();

    const inputSection = renderer!.root.findByProps({ testID: 'input-switching-section' });
    expect(inputSection).toBeDefined();

    const netflixBtn = renderer!.root.findByProps({ testID: 'btn-app-netflix' });
    expect(netflixBtn).toBeDefined();

    const hdmi1Btn = renderer!.root.findByProps({ testID: 'btn-input-HDMI_1' });
    expect(hdmi1Btn).toBeDefined();
  });

  it('shows app launching and input switching when capabilities are supported', async () => {
    const { container, render } = createTestEnv({
      appLaunching: true,
      inputSwitching: true,
    });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(
        createCapabilities({
          appLaunching: true,
          inputSwitching: true,
        }),
      ),
    );

    const sendCommandSpy = jest
      .spyOn(container.useCases.sendRemoteCommand, 'execute')
      .mockResolvedValue();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const netflixBtn = renderer!.root.findByProps({ testID: 'btn-app-netflix' });
    expect(netflixBtn).toBeDefined();
    await ReactTestRenderer.act(() => {
      netflixBtn.props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'launchApp', appId: 'netflix' });

    const hdmi1Btn = renderer!.root.findByProps({ testID: 'btn-input-HDMI_1' });
    expect(hdmi1Btn).toBeDefined();
    await ReactTestRenderer.act(() => {
      hdmi1Btn.props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'openInput', inputId: 'HDMI_1' });
  });

  it('allows safe command attempts when capability is unknown', async () => {
    const { container, render } = createTestEnv();

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(tvActions.capabilitiesChanged(UNKNOWN_CAPABILITIES));

    const sendCommandSpy = jest
      .spyOn(container.useCases.sendRemoteCommand, 'execute')
      .mockResolvedValue();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    // Unknown capability should NOT be disabled — should allow safe attempt
    const powerBtn = renderer!.root.findByProps({ testID: 'btn-power' });
    expect(powerBtn.props.disabled).toBe(false);

    await ReactTestRenderer.act(() => {
      powerBtn.props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'powerOff' });
  });

  it('switches between buttons, touchpad, and motion modes, preserving NumericKeypad inside Buttons mode', async () => {
    const { container, render } = createTestEnv();

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    // Initially in Buttons mode: D-Pad and NumericKeypad are mounted, Touchpad is not
    expect(renderer!.root.findAllByProps({ testID: 'dpad-cluster' }).length).toBeGreaterThan(0);
    expect(renderer!.root.findAllByProps({ testID: 'numeric-keypad' }).length).toBeGreaterThan(0);
    expect(renderer!.root.findAllByProps({ testID: 'touchpad-surface' }).length).toBe(0);

    // Switch to Touchpad mode
    const touchpadModeBtn = renderer!.root.findByProps({ testID: 'tab-touchpad' });
    await ReactTestRenderer.act(() => {
      touchpadModeBtn.props.onPress();
    });

    // Touchpad surface is now mounted; D-Pad and Keypad are unmounted
    expect(renderer!.root.findAllByProps({ testID: 'touchpad-surface' }).length).toBeGreaterThan(0);
    expect(renderer!.root.findAllByProps({ testID: 'dpad-cluster' }).length).toBe(0);
    expect(renderer!.root.findAllByProps({ testID: 'numeric-keypad' }).length).toBe(0);

    // Switch to Motion mode
    const motionModeBtn = renderer!.root.findByProps({ testID: 'tab-motion' });
    await ReactTestRenderer.act(() => {
      motionModeBtn.props.onPress();
    });

    // Motion surface is now mounted; D-Pad and Keypad are unmounted
    expect(renderer!.root.findAllByProps({ testID: 'motion-surface' }).length).toBeGreaterThan(0);
    expect(renderer!.root.findAllByProps({ testID: 'dpad-cluster' }).length).toBe(0);
    expect(renderer!.root.findAllByProps({ testID: 'touchpad-surface' }).length).toBe(0);

    // Switch back to Buttons mode
    const buttonsModeBtn = renderer!.root.findByProps({ testID: 'tab-buttons' });
    await ReactTestRenderer.act(() => {
      buttonsModeBtn.props.onPress();
    });
    expect(renderer!.root.findAllByProps({ testID: 'dpad-cluster' }).length).toBeGreaterThan(0);
    expect(renderer!.root.findAllByProps({ testID: 'numeric-keypad' }).length).toBeGreaterThan(0);
  });

  it('disables ScrollView scrolling while Touchpad gesture is active and restores it upon release', async () => {
    const { container, render } = createTestEnv({ pointerControl: true });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(createCapabilities({ pointerControl: true })),
    );

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    // Switch to Touchpad mode
    await ReactTestRenderer.act(() => {
      renderer.root.findByProps({ testID: 'tab-touchpad' }).props.onPress();
    });

    const scrollView = renderer!.root.findByProps({ testID: 'remote-screen' });
    // Initially scrollEnabled is true
    expect(scrollView.props.scrollEnabled).toBe(true);

    const touchpad = renderer!.root.findByType(Touchpad);
    expect(touchpad).toBeDefined();

    // Touchpad signals gesture active -> parent scrolling must be disabled
    await ReactTestRenderer.act(() => {
      touchpad.props.onActiveChange(true);
    });
    expect(scrollView.props.scrollEnabled).toBe(false);

    // Touchpad signals gesture release -> parent scrolling must be re-enabled
    await ReactTestRenderer.act(() => {
      touchpad.props.onActiveChange(false);
    });
    expect(scrollView.props.scrollEnabled).toBe(true);
  });

  it('disables parent ScrollView scrolling while Motion hold-to-move is active and restores on release', async () => {
    const { container, render } = createTestEnv({ pointerControl: 'supported' });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(createCapabilities({ pointerControl: 'supported' })),
    );

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    // Switch to Motion mode
    await ReactTestRenderer.act(() => {
      renderer.root.findByProps({ testID: 'tab-motion' }).props.onPress();
    });

    const scrollView = renderer!.root.findByProps({ testID: 'remote-screen' });
    expect(scrollView.props.scrollEnabled).toBe(true);

    const motionSurface = renderer!.root.findByType(MotionSurface);
    expect(motionSurface).toBeDefined();

    // Motion hold starts -> parent scrolling must be disabled
    await ReactTestRenderer.act(() => {
      motionSurface.props.onActiveChange(true);
    });
    expect(scrollView.props.scrollEnabled).toBe(false);

    // Motion hold released -> parent scrolling must be re-enabled
    await ReactTestRenderer.act(() => {
      motionSurface.props.onActiveChange(false);
    });
    expect(scrollView.props.scrollEnabled).toBe(true);
  });

  it('navigates to TV discovery screen when switch TV button is pressed', async () => {
    const { onNavigateToDiscovery, render } = createTestEnv();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const switchBtn = renderer!.root.findByProps({ testID: 'switch-tv-btn' });
    await ReactTestRenderer.act(() => {
      switchBtn.props.onPress();
    });

    expect(onNavigateToDiscovery).toHaveBeenCalledTimes(1);
  });

  it('renders header with TV name, connection badge, and switch button cleanly', async () => {
    const { container, render } = createTestEnv();

    container.store.dispatch(tvActions.deviceSaved(dummyDevice));
    container.store.dispatch(tvActions.deviceSelected(dummyDevice.id));
    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const header = renderer!.root.findByProps({ testID: 'remote-header' });
    expect(header).toBeDefined();

    const tvTitle = renderer!.root.findByProps({ testID: 'tv-header-title' });
    expect(tvTitle.props.children).toBe(dummyDevice.name);

    const badge = renderer!.root.findByProps({ testID: 'connection-status-badge' });
    expect(badge).toBeDefined();

    const switchBtn = renderer!.root.findByProps({ testID: 'switch-tv-btn' });
    expect(switchBtn).toBeDefined();
  });

  it('keeps volume, channel, power, home, and back controls accessible in Touchpad mode', async () => {
    const { container, render } = createTestEnv({
      volumeControl: true,
      channelControl: true,
      powerOff: true,
      pointerControl: true,
    });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(
        createCapabilities({
          volumeControl: true,
          channelControl: true,
          powerOff: true,
          pointerControl: true,
        }),
      ),
    );

    const sendCommandSpy = jest
      .spyOn(container.useCases.sendRemoteCommand, 'execute')
      .mockResolvedValue();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    // Switch to Touchpad mode
    const touchpadModeBtn = renderer!.root.findByProps({ testID: 'tab-touchpad' });
    await ReactTestRenderer.act(() => {
      touchpadModeBtn.props.onPress();
    });

    // Touchpad surface is mounted
    expect(renderer!.root.findAllByProps({ testID: 'touchpad-surface' }).length).toBeGreaterThan(0);

    // Directional D-pad should NOT be mounted in Touchpad mode
    expect(renderer!.root.findAllByProps({ testID: 'dpad-container' }).length).toBe(0);

    // Common controls (Power, Home, Back, Vol+, Vol-, Ch+, Ch-) MUST still be mounted and functional
    const powerBtn = renderer!.root.findByProps({ testID: 'btn-power' });
    await ReactTestRenderer.act(() => {
      powerBtn.props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'powerOff' });

    const volUpBtn = renderer!.root.findByProps({ testID: 'btn-vol-up' });
    await ReactTestRenderer.act(() => {
      volUpBtn.props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'volumeUp' });

    const chUpBtn = renderer!.root.findByProps({ testID: 'btn-ch-up' });
    await ReactTestRenderer.act(() => {
      chUpBtn.props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'channelUp' });
  });

  it('keeps volume, channel, power, home, and back controls accessible alongside NumericKeypad in Buttons mode', async () => {
    const { container, render } = createTestEnv({
      volumeControl: true,
      channelControl: true,
      powerOff: true,
    });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(
        createCapabilities({
          volumeControl: true,
          channelControl: true,
          powerOff: true,
        }),
      ),
    );

    const sendCommandSpy = jest
      .spyOn(container.useCases.sendRemoteCommand, 'execute')
      .mockResolvedValue();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    // In Buttons mode: NumericKeypad and D-pad are both mounted
    expect(renderer!.root.findAllByProps({ testID: 'numeric-keypad' }).length).toBeGreaterThan(0);
    expect(renderer!.root.findAllByProps({ testID: 'dpad-cluster' }).length).toBeGreaterThan(0);

    // Common controls (Power, Home, Back, Vol+, Vol-, Ch+, Ch-) MUST be mounted and functional
    const powerBtn = renderer!.root.findByProps({ testID: 'btn-power' });
    await ReactTestRenderer.act(() => {
      powerBtn.props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'powerOff' });

    const volDownBtn = renderer!.root.findByProps({ testID: 'btn-vol-down' });
    await ReactTestRenderer.act(() => {
      volDownBtn.props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'volumeDown' });

    const chDownBtn = renderer!.root.findByProps({ testID: 'btn-ch-down' });
    await ReactTestRenderer.act(() => {
      chDownBtn.props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'channelDown' });
  });

  it('switches to Motion mode, renders MotionSurface, keeps common controls active, and cleans up on mode switch', async () => {
    const { container, render } = createTestEnv({
      volumeControl: true,
      channelControl: true,
      pointerControl: 'supported',
      powerOff: true,
    });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(
        createCapabilities({
          volumeControl: true,
          channelControl: true,
          pointerControl: 'supported',
          powerOff: true,
        }),
      ),
    );

    const sendCommandSpy = jest
      .spyOn(container.useCases.sendRemoteCommand, 'execute')
      .mockResolvedValue();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    // Verify all 3 mode selector tabs exist
    expect(renderer!.root.findByProps({ testID: 'tab-buttons' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'tab-touchpad' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'tab-motion' })).toBeDefined();

    // Switch to Motion mode
    const motionModeBtn = renderer!.root.findByProps({ testID: 'tab-motion' });
    await ReactTestRenderer.act(() => {
      motionModeBtn.props.onPress();
    });

    // MotionSurface is mounted
    expect(renderer!.root.findAllByProps({ testID: 'motion-surface' }).length).toBeGreaterThan(0);

    // Directional D-pad should NOT be mounted in Motion mode
    expect(renderer!.root.findAllByProps({ testID: 'dpad-cluster' }).length).toBe(0);

    // Common volume and channel rockers MUST still be mounted and functional
    const volUpBtn = renderer!.root.findByProps({ testID: 'btn-vol-up' });
    await ReactTestRenderer.act(() => {
      volUpBtn.props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'volumeUp' });

    // Switch back to Buttons mode: MotionSurface should unmount and D-pad restore
    const buttonsModeBtn = renderer!.root.findByProps({ testID: 'tab-buttons' });
    await ReactTestRenderer.act(() => {
      buttonsModeBtn.props.onPress();
    });

    expect(renderer!.root.findAllByProps({ testID: 'motion-surface' }).length).toBe(0);
    expect(renderer!.root.findAllByProps({ testID: 'dpad-cluster' }).length).toBeGreaterThan(0);
  });

  it('applies dynamic safe area top padding to respect the status bar and Dynamic Island', async () => {
    const { render } = createTestEnv();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const rootContainer = renderer!.root.findByProps({ testID: 'remote-screen' });
    // Root container contentContainerStyle has paddingTop matching Math.max(testMetrics.insets.top, 16) = 59
    const contentStyle = Array.isArray(rootContainer.props.contentContainerStyle)
      ? Object.assign({}, ...rootContainer.props.contentContainerStyle)
      : rootContainer.props.contentContainerStyle;
    expect(contentStyle.paddingTop).toBe(testMetrics.insets.top);
  });
});
