import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { RemoteSystemControls } from '../../presentation/components/RemoteSystemControls';

describe('RemoteSystemControls (Presentational Component)', () => {
  it('renders Power, Home, and Back buttons', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <RemoteSystemControls
          isConnected={true}
          hasMacAddress={true}
          isWaking={false}
          onPowerPress={() => {}}
          onHomePress={() => {}}
          onBackPress={() => {}}
        />
      );
    });

    expect(renderer!.root.findByProps({ testID: 'btn-power' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'btn-home' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'btn-back' })).toBeDefined();
  });

  it('triggers onPowerPress when Power button is clicked', () => {
    const onPowerPress = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <RemoteSystemControls
          isConnected={true}
          hasMacAddress={true}
          isWaking={false}
          onPowerPress={onPowerPress}
          onHomePress={() => {}}
          onBackPress={() => {}}
        />
      );
    });

    const powerBtn = renderer!.root.findByProps({ testID: 'btn-power' });
    powerBtn.props.onPress();
    expect(onPowerPress).toHaveBeenCalledTimes(1);
  });

  it('allows Power press when TV is Disconnected if hasMacAddress is true', () => {
    const onPowerPress = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <RemoteSystemControls
          isConnected={false}
          hasMacAddress={true}
          isWaking={false}
          onPowerPress={onPowerPress}
          onHomePress={() => {}}
          onBackPress={() => {}}
        />
      );
    });

    const powerBtn = renderer!.root.findByProps({ testID: 'btn-power' });
    expect(powerBtn.props.disabled).toBe(false);

    powerBtn.props.onPress();
    expect(onPowerPress).toHaveBeenCalledTimes(1);
  });

  it('disables Home and Back buttons when disconnected', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <RemoteSystemControls
          isConnected={false}
          hasMacAddress={true}
          isWaking={false}
          onPowerPress={() => {}}
          onHomePress={() => {}}
          onBackPress={() => {}}
        />
      );
    });

    const homeBtn = renderer!.root.findByProps({ testID: 'btn-home' });
    const backBtn = renderer!.root.findByProps({ testID: 'btn-back' });

    expect(homeBtn.props.disabled).toBe(true);
    expect(backBtn.props.disabled).toBe(true);
  });
});
