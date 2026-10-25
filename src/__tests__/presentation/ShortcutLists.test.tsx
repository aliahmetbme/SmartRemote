import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { AppShortcutList } from '../../presentation/components/AppShortcutList';
import { InputShortcutList } from '../../presentation/components/InputShortcutList';

describe('AppShortcutList (Presentational Component)', () => {
  it('renders all default app shortcuts', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AppShortcutList
          isConnected={true}
          launchingAppId={null}
          onLaunchApp={() => {}}
        />
      );
    });

    expect(renderer!.root.findByProps({ testID: 'app-shortcuts-section' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'btn-app-netflix' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'btn-app-youtube' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'btn-app-amazon' })).toBeDefined();
  });

  it('triggers onLaunchApp with proper appId', () => {
    const onLaunchApp = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AppShortcutList
          isConnected={true}
          launchingAppId={null}
          onLaunchApp={onLaunchApp}
        />
      );
    });

    const netflixBtn = renderer!.root.findByProps({ testID: 'btn-app-netflix' });
    netflixBtn.props.onPress();
    expect(onLaunchApp).toHaveBeenCalledWith('netflix');
  });

  it('displays loading spinner for the currently launching app', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AppShortcutList
          isConnected={true}
          launchingAppId="netflix"
          onLaunchApp={() => {}}
        />
      );
    });

    const netflixBtn = renderer!.root.findByProps({ testID: 'btn-app-netflix' });
    const textInstances = netflixBtn.findAllByProps({ children: 'NETFLIX' });
    expect(textInstances.length).toBe(0);
  });
});

describe('InputShortcutList (Presentational Component)', () => {
  it('renders all default input shortcuts', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <InputShortcutList
          isConnected={true}
          onSelectInput={() => {}}
        />
      );
    });

    expect(renderer!.root.findByProps({ testID: 'input-switching-section' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'btn-input-HDMI_1' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'btn-input-HDMI_2' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'btn-input-AV_1' })).toBeDefined();
  });

  it('triggers onSelectInput with proper inputId', () => {
    const onSelectInput = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <InputShortcutList
          isConnected={true}
          onSelectInput={onSelectInput}
        />
      );
    });

    const hdmi2Btn = renderer!.root.findByProps({ testID: 'btn-input-HDMI_2' });
    hdmi2Btn.props.onPress();
    expect(onSelectInput).toHaveBeenCalledWith('HDMI_2');
  });
});
