import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { View } from 'react-native';
import { TouchpadView } from '../../presentation/components/TouchpadView';
import { useTouchpadGestures } from '../../presentation/hooks/useTouchpadGestures';

describe('TouchpadView (Presentational Component)', () => {
  it('renders correctly in active state', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <TouchpadView
          panHandlers={{}}
          isConnected={true}
          isPressing={false}
        />
      );
    });

    const surface = renderer!.root.findByProps({ testID: 'touchpad-surface' });
    expect(surface).toBeDefined();
  });

  it('renders disabled overlay with message when disconnected', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <TouchpadView
          panHandlers={{}}
          isConnected={false}
          isPressing={false}
        />
      );
    });

    const surface = renderer!.root.findByProps({ testID: 'touchpad-surface' });
    expect(surface).toBeDefined();
    const instruction = surface.findByProps({ children: 'Connect to TV to use pointer' });
    expect(instruction).toBeDefined();
  });

  it('renders unsupported notice when isAvailable is false', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <TouchpadView
          panHandlers={{}}
          isConnected={true}
          isAvailable={false}
        />
      );
    });

    const disabledView = renderer!.root.findByProps({ testID: 'touchpad-disabled' });
    expect(disabledView).toBeDefined();
    expect(disabledView.findByProps({ children: 'Pointer Control Unsupported by TV' })).toBeDefined();
  });
});

describe('useTouchpadGestures (Custom Hook)', () => {
  function TestTouchpadHookComponent({
    enabled = true,
    throttleMs = 0,
    onMove = jest.fn(),
    onClick = jest.fn(),
  }: {
    enabled?: boolean;
    throttleMs?: number;
    onMove?: (dx: number, dy: number) => void;
    onClick?: () => void;
  }) {
    const { panHandlers, isPressing } = useTouchpadGestures({
      enabled,
      throttleMs,
      onMove,
      onClick,
    });

    return (
      <View
        testID="gesture-test-view"
        accessibilityLabel={isPressing ? 'active' : 'idle'}
        {...panHandlers}
      />
    );
  }

  const createGestureEvent = (pageX: number, pageY: number) => ({
    nativeEvent: { pageX, pageY, identifier: 0, touches: [] },
    touchHistory: {
      mostRecentTimeStamp: Date.now(),
      touchBank: [
        {
          touchActive: true,
          startPageX: pageX,
          startPageY: pageY,
          startTimeStamp: Date.now(),
          currentPageX: pageX,
          currentPageY: pageY,
          currentTimeStamp: Date.now(),
          previousPageX: pageX,
          previousPageY: pageY,
          previousTimeStamp: Date.now(),
        },
      ],
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
    },
  });

  it('initializes in idle state', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<TestTouchpadHookComponent />);
    });

    const view = renderer!.root.findByProps({ testID: 'gesture-test-view' });
    expect(view.props.accessibilityLabel).toBe('idle');
  });

  it('detects short tap without movement as a click', () => {
    const onClick = jest.fn();
    const onMove = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <TestTouchpadHookComponent
          enabled={true}
          onClick={onClick}
          onMove={onMove}
        />
      );
    });

    const view = renderer!.root.findByProps({ testID: 'gesture-test-view' });

    act(() => {
      view.props.onResponderGrant(createGestureEvent(100, 100));
      view.props.onResponderRelease();
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('detects drag movement with throttleMs=0', () => {
    const onClick = jest.fn();
    const onMove = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <TestTouchpadHookComponent
          enabled={true}
          throttleMs={0}
          onClick={onClick}
          onMove={onMove}
        />
      );
    });

    const view = renderer!.root.findByProps({ testID: 'gesture-test-view' });

    act(() => {
      view.props.onResponderGrant(createGestureEvent(100, 100));
      view.props.onResponderMove(createGestureEvent(120, 110));
      view.props.onResponderRelease();
    });

    expect(onMove).toHaveBeenCalledWith(20, 10);
    expect(onClick).not.toHaveBeenCalled();
  });
});
