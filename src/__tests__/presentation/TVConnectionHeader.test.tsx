import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { TVConnectionHeader } from '../../presentation/components/TVConnectionHeader';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';

describe('TVConnectionHeader (Presentational Component)', () => {
  it('renders device name and connected status', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <TVConnectionHeader
          tvDisplayName="Living Room LG OLED"
          connectionStatus={TVConnectionState.Connected}
          onNavigateToDiscovery={() => {}}
        />
      );
    });

    const title = renderer!.root.findByProps({ testID: 'tv-header-title' });
    expect(title.props.children).toBe('Living Room LG OLED');

    const badge = renderer!.root.findByProps({ testID: 'connection-status-badge' });
    expect(badge).toBeDefined();
    const statusText = badge.findByProps({ children: 'Connected' });
    expect(statusText).toBeDefined();
  });

  it('renders loading spinner for connecting state', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <TVConnectionHeader
          tvDisplayName="LG TV"
          connectionStatus={TVConnectionState.Connecting}
          onNavigateToDiscovery={() => {}}
        />
      );
    });

    const badge = renderer!.root.findByProps({ testID: 'connection-status-badge' });
    expect(badge).toBeDefined();
    const statusText = badge.findByProps({ children: 'Connecting...' });
    expect(statusText).toBeDefined();
  });

  it('triggers onNavigateToDiscovery when switch TV button is pressed', () => {
    const onNavigateToDiscovery = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <TVConnectionHeader
          tvDisplayName="LG TV"
          connectionStatus={TVConnectionState.Connected}
          onNavigateToDiscovery={onNavigateToDiscovery}
        />
      );
    });

    const switchBtn = renderer!.root.findByProps({ testID: 'switch-tv-btn' });
    switchBtn.props.onPress();
    expect(onNavigateToDiscovery).toHaveBeenCalledTimes(1);
  });
  it.each(['LG webOS TV (192.168.1.50)', '192.168.1.50'])('hides IP addresses in saved names: %s', name => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => { renderer = ReactTestRenderer.create(<TVConnectionHeader tvDisplayName={name} connectionStatus={TVConnectionState.Reconnecting} />); });
    const title = renderer.root.findByProps({ testID: 'tv-header-title' });
    expect(title.props.children).not.toMatch(/192\.168/);
    expect(title.props.accessibilityLabel).not.toMatch(/192\.168/);
    expect(renderer.root.findByProps({ children: 'Reconnecting...' })).toBeDefined();
    act(() => renderer.unmount());
  });

  it('truncates long names visually and retains the complete accessible name and switch action', () => {
    const name = 'Living Room '.repeat(20);
    const switchTV = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => { renderer = ReactTestRenderer.create(<TVConnectionHeader tvDisplayName={name} connectionStatus={TVConnectionState.Pairing} onNavigateToDiscovery={switchTV} />); });
    const title = renderer.root.findByProps({ testID: 'tv-header-title' });
    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.accessibilityLabel).toBe(name.trim());
    expect(renderer.root.findByProps({ children: 'Pairing with TV...' })).toBeDefined();
    act(() => renderer.root.findByProps({ testID: 'switch-tv-btn' }).props.onPress());
    expect(switchTV).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  });

});
