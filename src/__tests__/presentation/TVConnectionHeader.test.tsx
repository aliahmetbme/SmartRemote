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
});
