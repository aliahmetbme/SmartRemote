import React from 'react';
import * as RN from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getPresentationLayout, getControlGeometry, getRemoteGeometry, getRemoteCardLayout, remoteDensity, useRemoteDensity, getTabBarLayout, theme } from '../../presentation/theme';
import { RemoteModeSelector } from '../../presentation/components/RemoteModeSelector';
import { NumericKeypadView } from '../../presentation/components/NumericKeypadView';
import { RemoteScreen } from '../../presentation/screens/RemoteScreen';
import { SettingsScreen } from '../../presentation/screens/SettingsScreen';
import { TVDiscoveryScreen } from '../../presentation/screens/TVDiscoveryScreen';
import { RemoteSystemControls } from '../../presentation/components/RemoteSystemControls';
import { DirectionPad } from '../../presentation/components/DirectionPad';
import { ContainerProvider } from '../../presentation/context/ContainerContext';
import { createContainer } from '../../di/container';
import { tvActions } from '../../store/slices/tvSlice';
import { connectionActions } from '../../store/slices/connectionSlice';
import { makeWebOSDevice } from '../../testing/fixtures';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';

const profiles = [
  ['Narrow Android', 320, 640], ['Standard Android', 360, 800], ['Tall Samsung', 384, 854],
  ['Large Android', 412, 915], ['Attached Samsung viewport', 360, 780], ['Small iPhone', 320, 568], ['Standard iPhone', 393, 852], ['Large iPhone', 430, 932],
] as const;

describe('Responsive width and accessibility budgets (not native screenshot tests)', () => {
  const originalOS = RN.Platform.OS;
  afterEach(() => { jest.restoreAllMocks(); Object.defineProperty(RN.Platform, 'OS', { configurable: true, value: originalOS }); });

  it.each(profiles)('%s: preserves control bounds at standard and large font scales', (_name, width, _height) => {
    for (const scale of [1, 1.3, 1.6, 2]) {
      const layout = getPresentationLayout(width, scale);
      const { innerWidth } = getRemoteCardLayout(layout, undefined);
      const controls = getControlGeometry(innerWidth, scale);
      expect(controls.dpadSize).toBeLessThanOrEqual(innerWidth);
      expect(controls.rockerWidth).toBeGreaterThanOrEqual(48);
      expect(controls.rockerHeight / 3).toBeGreaterThanOrEqual(48);
      expect(controls.dpadSize).toBeGreaterThanOrEqual(164);
      if (!controls.stacked) expect(controls.dpadSize + controls.rockerWidth * 2 + 16).toBeLessThanOrEqual(innerWidth);
      else expect(controls.rockerWidth).toBeLessThanOrEqual(innerWidth);
    }
  });
  it.each([
    [320, 640, true], [360, 800, true], [360, 780, true], [320, 920, true],
    [780, 360, true], [270, 780, true], [320, 568, false], [393, 852, false],
    [430, 932, false], [852, 393, false],
  ])('bounds the adaptive cluster at %sx%s (Android density: %s)', (width, height, dense) => {
    for (const scale of [1, 1.3, 1.6, 2]) {
      const layout = getPresentationLayout(width, scale);
      const { innerWidth: inner, borderWidth } = getRemoteCardLayout(layout, dense ? remoteDensity : undefined);
      const viewport = height - 24 - getTabBarLayout(24, scale).height;
      const controls = getRemoteGeometry(inner, viewport, scale, dense);
      expect(controls.rockerWidth).toBeGreaterThanOrEqual(48);
      expect(controls.rockerHeight - 2 * borderWidth).toBeGreaterThanOrEqual(144);
      expect(controls.dpadSize).toBeLessThanOrEqual(Math.min(inner, dense ? remoteDensity.preferredDpad : 196));
      const required = controls.stacked ? controls.dpadSize : controls.dpadSize + 2 * controls.rockerWidth + 16;
      expect(required).toBeLessThanOrEqual(inner);
    }
  });

  it('keeps the compact direction targets disjoint at the minimum diameter', async () => {
    let tree!: Renderer.ReactTestRenderer;
    await act(async () => { tree = Renderer.create(<DirectionPad size={remoteDensity.minDpad}
      centerDiameter={remoteDensity.centerSize} onNavigate={jest.fn()} onSelect={jest.fn()} />); });
    for (const key of ['up', 'down', 'left', 'right', 'ok']) {
      const target = RN.StyleSheet.flatten(tree.root.findByProps({ testID: `btn-nav-${key}` }).props.style);
      expect([target.width, target.height]).toEqual([48, 48]);
    }
    const border = RN.StyleSheet.flatten(tree.root.findByProps({ testID: 'dpad-cluster' }).props.style).borderWidth;
    expect(border + 48).toBeLessThanOrEqual((remoteDensity.minDpad - remoteDensity.centerSize) / 2);
    await act(async () => tree.unmount());
  });

  it('keeps supporting and pairing text readable against dark surfaces', () => {
    const luminance = (hex: string) => {
      const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    for (const text of [theme.colors.textMuted, theme.colors.textSecondary, theme.colors.textPrimary, theme.colors.pairingText]) {
      const contrast = (luminance(text) + 0.05) / (luminance(theme.colors.surface) + 0.05);
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
    const { colors } = theme;
    const remotePairs = [
      [colors.textSecondary, colors.modeTrack],
      [colors.textPrimary, colors.modeSelected],
      [colors.controlLabel, '#1B2130'],
      [colors.controlMute, '#1B2130'],
      [colors.controlDigit, '#1B2130'],
      [colors.controlActionLabel, '#1C2232'],
      [colors.controlActionLabel, '#1E2536'],
      [colors.controlSectionLabel, '#121622'],
      [colors.controlSectionLabel, colors.remoteCard],
    ];
    for (const [foreground, background] of remotePairs) {
      expect((luminance(foreground) + 0.05) / (luminance(background) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
    expect(luminance(colors.modeUnavailable)).toBeLessThan(luminance(colors.textSecondary));
  });
  it('retains three shortcut columns at the attached Samsung font scale and wraps for larger text', () => {
    const actual = getPresentationLayout(360, 1.3);
    expect(actual.chipBasis * 3 + 16).toBeLessThanOrEqual(getRemoteCardLayout(actual, remoteDensity).innerWidth);
    expect(actual.headerStacked).toBe(false);
    expect(actual.modeStacked).toBe(false);
    expect(getPresentationLayout(360, 2).modeStacked).toBe(true);
    const enlarged = getPresentationLayout(360, 1.6);
    expect(enlarged.chipBasis * 3 + 16).toBeGreaterThan(getRemoteCardLayout(enlarged, remoteDensity).innerWidth);
  });
  it.each([164, 167, 196])('keeps directional hit rectangles separate from OK at size %s', async size => {
    let tree!: Renderer.ReactTestRenderer;
    await act(async () => { tree = Renderer.create(<DirectionPad size={size} onNavigate={jest.fn()} onSelect={jest.fn()} />); });
    const center = RN.StyleSheet.flatten(tree.root.findByProps({ testID: 'btn-nav-ok' }).props.style);
    const up = RN.StyleSheet.flatten(tree.root.findByProps({ testID: 'btn-nav-up' }).props.style);
    const left = RN.StyleSheet.flatten(tree.root.findByProps({ testID: 'btn-nav-left' }).props.style);
    const border = RN.StyleSheet.flatten(tree.root.findByProps({ testID: 'dpad-cluster' }).props.style).borderWidth;
    expect(border + up.top + up.height).toBeLessThanOrEqual((size - center.height) / 2);
    expect(border + left.left + left.width).toBeLessThanOrEqual((size - center.width) / 2);
    expect(up.height).toBeGreaterThanOrEqual(48);
    expect(left.width).toBeGreaterThanOrEqual(48);
    await act(async () => tree.unmount());
  });
  it('gives tabs a single bottom inset and sufficient room for scaled labels', () => {
    for (const scale of [1, 1.3, 1.6, 2]) {
      const base = getTabBarLayout(0, scale);
      for (const bottom of [24, 34, 48]) {
        const bars = getTabBarLayout(bottom, scale);
        expect(bars.height - bottom).toBe(base.height);
        expect(bars.paddingBottom).toBe(bottom);
        expect(bars.height - bars.paddingBottom - bars.paddingTop).toBeGreaterThanOrEqual(48);
      }
    }
  });
  it('marks Android Motion unavailable without changing iOS mode availability', async () => {
    Object.defineProperty(RN.Platform, 'OS', { configurable: true, value: 'android' });
    const change = jest.fn(); let tree!: Renderer.ReactTestRenderer;
    await act(async () => { tree = Renderer.create(<RemoteModeSelector activeMode="buttons" onModeChange={change} motionAvailable={false} />); });
    expect(tree.root.findByProps({ testID: 'tab-motion' }).props.disabled).toBe(true);
    expect(tree.root.findByProps({ testID: 'tab-motion' }).props.accessibilityState.disabled).toBe(true);
    const motion = tree.root.findByProps({ testID: 'tab-motion' });
    expect(motion.props.accessibilityLabel).toBe('Motion unavailable on Android');
    expect(motion.findByType(RN.Text).props.children).toBe('Motion');
    expect(tree.root.findByProps({ testID: 'tab-buttons' }).props.accessibilityState.selected).toBe(true);
    Object.defineProperty(RN.Platform, 'OS', { configurable: true, value: 'ios' });
    await act(async () => { tree.update(<RemoteModeSelector activeMode="buttons" onModeChange={change} />); });
    expect(tree.root.findByProps({ testID: 'tab-motion' }).props.disabled).toBe(false);
    await act(async () => tree.unmount());
  });

  const renderScreen = async (screen: React.ReactElement, state = TVConnectionState.Connected) => {
    jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({ width: 320, height: 640, scale: 3, fontScale: 1.6 });
    const container = createContainer();
    const device = makeWebOSDevice({ name: 'Living room television with a very long descriptive name', macAddress: 'AA:BB:CC:DD:EE:FF' });
    container.store.dispatch(tvActions.savedDevicesLoaded([device]));
    container.store.dispatch(tvActions.deviceSelected(device.id));
    container.store.dispatch(connectionActions.statusChanged(state));
    let tree!: Renderer.ReactTestRenderer;
    await act(async () => { tree = Renderer.create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 24, left: 0, right: 0, bottom: 24 } }}>
        <Provider store={container.store}><ContainerProvider container={container}>{screen}</ContainerProvider></Provider>
      </SafeAreaProvider>,
    ); });
    return tree;
  };
  it.each([TVConnectionState.Connected, TVConnectionState.Disconnected, TVConnectionState.Pairing, TVConnectionState.Connecting, TVConnectionState.Reconnecting])('keeps the cluster within a measured narrow container in %s state', async state => {
    const tree = await renderScreen(<RemoteScreen />, state);
    await act(async () => tree.root.findByProps({ testID: 'remote-control-cluster' }).props.onLayout({ nativeEvent: { layout: { width: 220 } } }));
    expect(tree.root.findByType(DirectionPad).props.size).toBeLessThanOrEqual(220);
    expect(tree.root.findByProps({ testID: 'tv-header-title' }).props.numberOfLines).toBeUndefined();
    expect(tree.root.findByProps({ testID: 'remote-screen' }).props.scrollEnabled).toBe(true);
    await act(async () => tree.unmount());
  });
  it('allows long Settings values to stack and keeps MAC editing keyboard-aware', async () => {
    const tree = await renderScreen(<SettingsScreen />);
    const value = tree.root.findAllByType(RN.Text).find(node => node.props.children === 'Keychain (Secure) + AsyncStorage')!;
    expect(RN.StyleSheet.flatten(value.parent!.props.style).flexDirection).toBe('column');
    expect(RN.StyleSheet.flatten(value.props.style).textAlign).toBe('left');
    expect(tree.root.findByProps({ testID: 'settings-screen' }).props.automaticallyAdjustKeyboardInsets).toBe(true);
    await act(async () => tree.root.findByProps({ testID: 'edit-mac-btn' }).props.onPress());
    expect(RN.StyleSheet.flatten(tree.root.findByProps({ testID: 'settings-mac-input' }).props.style).minHeight).toBeGreaterThanOrEqual(48);
    await act(async () => tree.unmount());
  });
  it('keeps Discovery input and Connect accessible inside the keyboard-aware scroll list', async () => {
    const tree = await renderScreen(<TVDiscoveryScreen />, TVConnectionState.Disconnected);
    const input = tree.root.findByProps({ testID: 'manual-ip-input' });
    expect(RN.StyleSheet.flatten(input.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(RN.StyleSheet.flatten(tree.root.findByProps({ testID: 'manual-ip-connect-btn' }).props.style).minHeight).toBeGreaterThanOrEqual(48);
    const list = tree.root.findByType(RN.FlatList);
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
    expect(list.props.automaticallyAdjustKeyboardInsets).toBe(true);
    await act(async () => tree.unmount());
  });
  it('exposes wake-in-progress without shrinking the power target', async () => {
    let tree!: Renderer.ReactTestRenderer;
    await act(async () => { tree = Renderer.create(<RemoteSystemControls isConnected={false} hasMacAddress isWaking
      onPowerPress={jest.fn()} onHomePress={jest.fn()} onBackPress={jest.fn()} />); });
    const power = tree.root.findByProps({ testID: 'btn-power' });
    expect(power.props.disabled).toBe(true);
    expect(power.props.accessibilityState.busy).toBe(true);
    expect(RN.StyleSheet.flatten(power.props.style).minHeight).toBeGreaterThanOrEqual(48);
    await act(async () => tree.unmount());
  });
  it.each(['android', 'ios'] as const)('preserves keypad callbacks and touch targets on %s', async os => {
    Object.defineProperty(RN.Platform, 'OS', { configurable: true, value: os });
    expect(useRemoteDensity()).toBe(os === 'android' ? remoteDensity : undefined);
    jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({ width: 320, height: 640, scale: 3, fontScale: 2 });
    const digit = jest.fn(); let tree!: Renderer.ReactTestRenderer;
    await act(async () => { tree = Renderer.create(<NumericKeypadView channelBuffer="123" onDigitPress={digit} onBackspacePress={jest.fn()} onOkPress={jest.fn()} />); });
    for (let key = 0; key < 10; key++) {
      const button = tree.root.findByProps({ testID: `btn-digit-${key}` });
      const style = RN.StyleSheet.flatten(button.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.minWidth).toBeGreaterThanOrEqual(48);
      expect(style.borderRadius).toBe(os === 'android' ? remoteDensity.tileRadius : theme.borderRadius.md);
      act(() => button.props.onPress());
      expect(digit).toHaveBeenLastCalledWith(key);
    }
    await act(async () => tree.unmount());
  });
});
