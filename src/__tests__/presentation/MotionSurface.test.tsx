import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { MotionSurface } from '../../presentation/components/MotionSurface';
import { ContainerProvider } from '../../presentation/context/ContainerContext';
import { createContainer } from '../../di/container';
import { connectionActions } from '../../store/slices/connectionSlice';
import { tvActions } from '../../store/slices/tvSlice';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { createCapabilities } from '../../domain/entities/TVCapabilities';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';
import {
  DeviceMotionSample,
  IMotionSensorService,
  MotionSampleListener,
} from '../../domain/interfaces/IMotionSensorService';

class MockMotionSensorService implements IMotionSensorService {
  public available: boolean = true;
  public tracking: boolean = false;
  public listener: MotionSampleListener | null = null;
  public stopCalled: boolean = false;

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async start(_intervalMs: number, onSample: MotionSampleListener): Promise<void> {
    this.tracking = true;
    this.listener = onSample;
  }

  async stop(): Promise<void> {
    this.tracking = false;
    this.stopCalled = true;
    this.listener = null;
  }

  isTracking(): boolean {
    return this.tracking;
  }

  emit(sample: DeviceMotionSample): void {
    if (this.tracking && this.listener) {
      this.listener(sample);
    }
  }
}

describe('MotionSurface Component', () => {
  let activeRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

  afterEach(() => {
    if (activeRenderer) {
      act(() => {
        activeRenderer!.unmount();
      });
      activeRenderer = null;
    }
  });

  const createTestEnv = (capabilities = {}, sensorAvailable = true) => {
    const mockAdapter = new MockTVAdapter({
      capabilities: {
        pointerControl: 'supported',
        ...capabilities,
      },
    });

    const mockSensor = new MockMotionSensorService();
    mockSensor.available = sensorAvailable;

    const container = createContainer({
      adapterFactory: {
        create: () => mockAdapter,
        supports: () => true,
      },
      motionSensorService: mockSensor,
    });

    // Default to connected state with pointer support
    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(
        createCapabilities({
          pointerControl: 'supported',
          ...capabilities,
        }),
      ),
    );

    const render = (props?: { onActiveChange?: (isActive: boolean) => void }) => {
      const r = ReactTestRenderer.create(
        <Provider store={container.store}>
          <ContainerProvider container={container}>
            <MotionSurface {...props} />
          </ContainerProvider>
        </Provider>,
      );
      activeRenderer = r;
      return r;
    };

    return { container, mockAdapter, mockSensor, render };
  };

  it('renders in Standby state and starts sensor service on mount', async () => {
    const { mockSensor, render } = createTestEnv();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render();
    });

    expect(mockSensor.isTracking()).toBe(true);

    const root = renderer!.root;
    const holdBtn = root.findByProps({ testID: 'motion-hold-to-move-btn' });
    expect(holdBtn).toBeTruthy();

    const stateIndicator = root.findByProps({ testID: 'motion-state-indicator' });
    expect(stateIndicator).toBeTruthy();
  });

  const createTouchEvent = (pageX: number = 100, pageY: number = 100) => ({
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

  it('engages aiming state on responder grant and disengages on release or termination', async () => {
    const onActiveChangeSpy = jest.fn();
    const { render } = createTestEnv();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render({ onActiveChange: onActiveChangeSpy });
    });

    const holdBtn = renderer!.root.findByProps({ testID: 'motion-hold-to-move-btn' });

    // Ensure termination request is refused to protect gesture from parent scroll
    expect(holdBtn.props.onResponderTerminationRequest()).toBe(false);

    // Grant -> Aiming
    act(() => {
      holdBtn.props.onResponderGrant(createTouchEvent(100, 100));
    });

    expect(onActiveChangeSpy).toHaveBeenCalledWith(true);

    // Release -> Standby
    act(() => {
      holdBtn.props.onResponderRelease(createTouchEvent(100, 100));
    });

    expect(onActiveChangeSpy).toHaveBeenCalledWith(false);

    // Test termination also disengages
    act(() => {
      holdBtn.props.onResponderGrant(createTouchEvent(100, 100));
    });
    expect(onActiveChangeSpy).toHaveBeenCalledWith(true);

    act(() => {
      holdBtn.props.onResponderTerminate(createTouchEvent(100, 100));
    });
    expect(onActiveChangeSpy).toHaveBeenLastCalledWith(false);
  });

  it('dispatches select command when Select button is tapped', async () => {
    const { container, render } = createTestEnv();
    const sendCommandSpy = jest
      .spyOn(container.useCases.sendRemoteCommand, 'execute')
      .mockResolvedValue();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render();
    });

    const selectBtn = renderer!.root.findByProps({ testID: 'motion-select-btn' });
    expect(selectBtn).toBeTruthy();

    await act(async () => {
      selectBtn.props.onPress();
    });

    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'select' });
  });

  it('triggers recenter when Recenter button is tapped', async () => {
    const { render } = createTestEnv();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render();
    });

    const recenterBtn = renderer!.root.findByProps({ testID: 'motion-recenter-btn' });
    expect(recenterBtn).toBeTruthy();

    act(() => {
      recenterBtn.props.onPress();
    });
  });

  it('adjusts sensitivity with stepper buttons', async () => {
    const { render } = createTestEnv();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render();
    });

    const plusBtn = renderer!.root.findByProps({ testID: 'motion-sensitivity-plus' });
    const minusBtn = renderer!.root.findByProps({ testID: 'motion-sensitivity-minus' });
    const valueText = renderer!.root.findByProps({ testID: 'motion-sensitivity-value' });

    expect(valueText.props.children.join('')).toContain('1.0x');

    act(() => {
      plusBtn.props.onPress();
    });

    expect(valueText.props.children.join('')).toContain('1.2x');

    act(() => {
      minusBtn.props.onPress();
    });

    expect(valueText.props.children.join('')).toContain('1.0x');
  });

  it('toggles X and Y inversion', async () => {
    const { render } = createTestEnv();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render();
    });

    const toggleX = renderer!.root.findByProps({ testID: 'motion-invert-x-toggle' });
    const toggleY = renderer!.root.findByProps({ testID: 'motion-invert-y-toggle' });

    act(() => {
      toggleX.props.onPress();
    });

    act(() => {
      toggleY.props.onPress();
    });
  });

  it('toggles diagnostic mode (raw 1:1, acc & smooth off)', async () => {
    const { render } = createTestEnv();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render();
    });

    const diagToggle = renderer!.root.findByProps({ testID: 'motion-diag-toggle' });
    expect(diagToggle).toBeTruthy();

    act(() => {
      diagToggle.props.onPress();
    });
  });

  it('displays warning when pointer control is unsupported', async () => {
    const { render } = createTestEnv({ pointerControl: 'unsupported' });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render();
    });

    const banner = renderer!.root.findByProps({ testID: 'motion-unsupported-banner' });
    expect(banner).toBeTruthy();
  });

  it('displays warning when motion sensors are unavailable', async () => {
    const { render } = createTestEnv({}, false);

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render();
    });

    const banner = renderer!.root.findByProps({ testID: 'motion-sensor-unavailable-banner' });
    expect(banner).toBeTruthy();
  });

  it('stops sensor and tears down controller on unmount', async () => {
    const { mockSensor, render } = createTestEnv();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render();
    });

    expect(mockSensor.isTracking()).toBe(true);

    await act(async () => {
      renderer!.unmount();
    });

    expect(mockSensor.stopCalled).toBe(true);
    expect(mockSensor.isTracking()).toBe(false);
  });
});
