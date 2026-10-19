import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { Touchpad } from '../../presentation/components/Touchpad';
import { ContainerProvider } from '../../presentation/context/ContainerContext';
import { createContainer } from '../../di/container';
import { connectionActions } from '../../store/slices/connectionSlice';
import { tvActions } from '../../store/slices/tvSlice';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { createCapabilities } from '../../domain/entities/TVCapabilities';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';

describe('Touchpad Component', () => {
  const createTestEnv = (capabilities = { pointerControl: true }) => {
    const mockAdapter = new MockTVAdapter({
      capabilities,
    });
    const container = createContainer({
      adapterFactory: {
        create: () => mockAdapter,
        supports: () => true,
      },
    });

    const render = () =>
      ReactTestRenderer.create(
        <Provider store={container.store}>
          <ContainerProvider container={container}>
            <Touchpad throttleMs={20} />
          </ContainerProvider>
        </Provider>,
      );

    return { container, mockAdapter, render };
  };

  const createTouchEvent = (pageX: number, pageY: number) => ({
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

  it('renders unsupported notice when TV reports pointerControl as unsupported', async () => {
    const { container, render } = createTestEnv({ pointerControl: false });

    // Set connected status with pointerControl unsupported
    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(createCapabilities({ pointerControl: false })),
    );

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const unsupported = renderer!.root.findByProps({ testID: 'touchpad-disabled' });
    expect(unsupported).toBeDefined();
  });

  it('renders disabled state when TV is disconnected', async () => {
    const { container, render } = createTestEnv({ pointerControl: true });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Disconnected));

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const surface = renderer!.root.findByProps({ testID: 'touchpad-surface' });
    expect(surface).toBeDefined();
    const instruction = surface.findByProps({ children: 'Connect to TV to use pointer' });
    expect(instruction).toBeDefined();
  });

  it('captures finger movements, throttles relative deltas, and invokes sendRemoteCommand without redux spam', async () => {
    const mockAdapter = new MockTVAdapter({
      capabilities: { pointerControl: true },
    });
    const container = createContainer({
      adapterFactory: {
        create: () => mockAdapter,
        supports: () => true,
      },
    });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(createCapabilities({ pointerControl: true })),
    );

    const sendCommandSpy = jest
      .spyOn(container.useCases.sendRemoteCommand, 'execute')
      .mockResolvedValue();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <Provider store={container.store}>
          <ContainerProvider container={container}>
            <Touchpad throttleMs={0} />
          </ContainerProvider>
        </Provider>,
      );
    });

    const surface = renderer!.root.findByProps({ testID: 'touchpad-surface' });
    const handlers = surface.props;

    const initialStoreState = container.store.getState();

    // 1. Touch Grant
    await ReactTestRenderer.act(() => {
      handlers.onResponderGrant(createTouchEvent(100, 100));
    });

    // 2. Touch Move
    await ReactTestRenderer.act(() => {
      handlers.onResponderMove(createTouchEvent(115, 120));
    });

    expect(sendCommandSpy).toHaveBeenCalledWith({
      type: 'movePointer',
      deltaX: 15,
      deltaY: 20,
    });

    // Verify Redux state was NOT modified with touch coordinates
    const finalStoreState = container.store.getState();
    expect(finalStoreState.remote).toEqual(initialStoreState.remote);
  });

  it('handles tap-to-click gesture on quick release without movement', async () => {
    const { container, render } = createTestEnv({ pointerControl: true });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(createCapabilities({ pointerControl: true })),
    );

    const sendCommandSpy = jest
      .spyOn(container.useCases.sendRemoteCommand, 'execute')
      .mockResolvedValue();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const surface = renderer!.root.findByProps({ testID: 'touchpad-surface' });
    const handlers = surface.props;

    // Grant then quick release
    await ReactTestRenderer.act(() => {
      handlers.onResponderGrant(createTouchEvent(50, 50));
    });

    await ReactTestRenderer.act(() => {
      handlers.onResponderRelease(createTouchEvent(50, 50));
    });

    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'select' });
  });

  it('notifies onActiveChange on grant, release, and termination to isolate gestures', async () => {
    const { container } = createTestEnv({ pointerControl: true });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(createCapabilities({ pointerControl: true })),
    );

    const onActiveChange = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <Provider store={container.store}>
          <ContainerProvider container={container}>
            <Touchpad throttleMs={0} onActiveChange={onActiveChange} />
          </ContainerProvider>
        </Provider>,
      );
    });

    const surface = renderer!.root.findByProps({ testID: 'touchpad-surface' });
    const handlers = surface.props;

    // 1. Grant invokes onActiveChange(true)
    await ReactTestRenderer.act(() => {
      handlers.onResponderGrant(createTouchEvent(50, 50));
    });
    expect(onActiveChange).toHaveBeenCalledWith(true);

    // 2. Release invokes onActiveChange(false)
    await ReactTestRenderer.act(() => {
      handlers.onResponderRelease(createTouchEvent(50, 50));
    });
    expect(onActiveChange).toHaveBeenCalledWith(false);

    // 3. Grant then Terminate (cancellation) invokes onActiveChange(false)
    await ReactTestRenderer.act(() => {
      handlers.onResponderGrant(createTouchEvent(50, 50));
    });
    expect(onActiveChange).toHaveBeenLastCalledWith(true);

    await ReactTestRenderer.act(() => {
      handlers.onResponderTerminate(createTouchEvent(50, 50));
    });
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
  });

  it('captures gestures and refuses responder termination request so drags remain owned by touchpad', async () => {
    const { container } = createTestEnv({ pointerControl: true });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(createCapabilities({ pointerControl: true })),
    );

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <Provider store={container.store}>
          <ContainerProvider container={container}>
            <Touchpad throttleMs={0} />
          </ContainerProvider>
        </Provider>,
      );
    });

    const surface = renderer!.root.findByProps({ testID: 'touchpad-surface' });
    const handlers = surface.props;

    // Must capture responder at start and move phases when connected & available
    expect(handlers.onStartShouldSetResponderCapture(createTouchEvent(50, 50))).toBe(true);
    expect(handlers.onMoveShouldSetResponderCapture(createTouchEvent(50, 50))).toBe(true);

    // Must explicitly refuse responder termination request to prevent ScrollView hijacking
    expect(handlers.onResponderTerminationRequest(createTouchEvent(50, 50))).toBe(false);
  });

  it('maintains ownership and sends pointer deltas during vertical and diagonal drags', async () => {
    const { container } = createTestEnv({ pointerControl: true });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(createCapabilities({ pointerControl: true })),
    );

    const sendCommandSpy = jest
      .spyOn(container.useCases.sendRemoteCommand, 'execute')
      .mockResolvedValue();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <Provider store={container.store}>
          <ContainerProvider container={container}>
            <Touchpad throttleMs={0} />
          </ContainerProvider>
        </Provider>,
      );
    });

    const surface = renderer!.root.findByProps({ testID: 'touchpad-surface' });
    const handlers = surface.props;

    // Grant
    await ReactTestRenderer.act(() => {
      handlers.onResponderGrant(createTouchEvent(100, 100));
    });

    // Vertical drag down (+40 Y)
    await ReactTestRenderer.act(() => {
      handlers.onResponderMove(createTouchEvent(100, 140));
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({
      type: 'movePointer',
      deltaX: 0,
      deltaY: 40,
    });

    // Advance time slightly to simulate real frame gap
    await new Promise(r => setTimeout(() => r(undefined), 5));

    // Diagonal drag up-left (-25 X, -30 Y)
    await ReactTestRenderer.act(() => {
      handlers.onResponderMove(createTouchEvent(75, 110));
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({
      type: 'movePointer',
      deltaX: -25,
      deltaY: -30,
    });

    // Release after drag should NOT trigger select
    sendCommandSpy.mockClear();
    await ReactTestRenderer.act(() => {
      handlers.onResponderRelease(createTouchEvent(75, 110));
    });
    expect(sendCommandSpy).not.toHaveBeenCalledWith({ type: 'select' });
  });

  it('cleans up active state when unmounted to prevent parent scroll deadlock', async () => {
    const { container } = createTestEnv({ pointerControl: true });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));

    const onActiveChange = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <Provider store={container.store}>
          <ContainerProvider container={container}>
            <Touchpad onActiveChange={onActiveChange} />
          </ContainerProvider>
        </Provider>,
      );
    });

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });

    expect(onActiveChange).toHaveBeenCalledWith(false);
  });
});
