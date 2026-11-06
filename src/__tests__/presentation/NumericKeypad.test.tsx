import { Platform } from 'react-native';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { NumericKeypad } from '../../presentation/components/NumericKeypad';
import { ContainerProvider } from '../../presentation/context/ContainerContext';
import { createContainer } from '../../di/container';
import { connectionActions } from '../../store/slices/connectionSlice';
import { tvActions } from '../../store/slices/tvSlice';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { createCapabilities } from '../../domain/entities/TVCapabilities';
import { MockTVAdapter } from '../../infrastructure/adapters/mock/MockTVAdapter';

describe('NumericKeypad Component', () => {
  let currentRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

  afterEach(async () => {
    if (currentRenderer) {
      await ReactTestRenderer.act(() => {
        currentRenderer?.unmount();
      });
      currentRenderer = null;
    }
  });

  const createTestEnv = (capabilities = { channelControl: true }) => {
    const mockAdapter = new MockTVAdapter({ capabilities });
    const container = createContainer({
      adapterFactory: {
        create: () => mockAdapter,
        supports: () => true,
      },
    });

    const render = (props?: { bufferTimeoutMs?: number }) => {
      const r = ReactTestRenderer.create(
        <Provider store={container.store}>
          <ContainerProvider container={container}>
            <NumericKeypad bufferTimeoutMs={props?.bufferTimeoutMs ?? 50000} />
          </ContainerProvider>
        </Provider>,
      );
      currentRenderer = r;
      return r;
    };

    return { container, mockAdapter, render };
  };

  it('renders the 4x3 keypad layout with all 12 buttons and channel readout display', async () => {
    const { container, render } = createTestEnv({ channelControl: true });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(createCapabilities({ channelControl: true })),
    );

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    // Check channel display readout
    const readout = renderer!.root.findByProps({ testID: 'keypad-buffer-readout' });
    expect(readout.props.children).toBe('— — —');

    // Check all digits 0-9
    for (let d = 0; d <= 9; d++) {
      const btn = renderer!.root.findByProps({ testID: `btn-digit-${d}` });
      expect(btn).toBeDefined();
      expect(btn.props.accessibilityLabel).toBe(`Digit ${d}`);
    }

    // Check Backspace and OK buttons
    const backspaceBtn = renderer!.root.findByProps({ testID: 'btn-digit-backspace' });
    expect(backspaceBtn).toBeDefined();
    expect(backspaceBtn.props.accessibilityLabel).toBe('Backspace');

    const okBtn = renderer!.root.findByProps({ testID: 'btn-digit-ok' });
    expect(okBtn).toBeDefined();
    expect(okBtn.props.accessibilityLabel).toBe('OK / Confirm Channel');
  });

  it.each(['android', 'ios'])('sends only the edited number on OK on %s', async os => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    try {
      const { container, render } = createTestEnv();
      container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
      const send = jest.spyOn(container.useCases.sendRemoteCommand, 'selectChannel').mockResolvedValue('confirmed');
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(async () => { renderer = render(); });
      const press = (id: string) => renderer.root.findByProps({ testID: `btn-digit-${id}` }).props.onPress();
      ReactTestRenderer.act(() => { press('2'); press('3'); press('4'); press('backspace'); });
      expect(send).not.toHaveBeenCalled();
      expect(renderer.root.findByProps({ testID: 'keypad-buffer-readout' }).props.children).toBe('23');
      await ReactTestRenderer.act(async () => { await press('ok'); });
      expect(send.mock.calls).toEqual([['23', null, expect.any(Function)]]);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: original });
    }
  });

  it('disables controls when disconnected or when TV channelControl capability is unsupported', async () => {
    const { container, render } = createTestEnv({ channelControl: false });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Disconnected));

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    // When disconnected, all buttons are disabled
    const btn1 = renderer!.root.findByProps({ testID: 'btn-digit-1' });
    expect(btn1.props.disabled).toBe(true);

    const okBtn = renderer!.root.findByProps({ testID: 'btn-digit-ok' });
    expect(okBtn.props.disabled).toBe(true);

    const backspaceBtn = renderer!.root.findByProps({ testID: 'btn-digit-backspace' });
    expect(backspaceBtn.props.disabled).toBe(true);

    // When connected but channelControl is unsupported:
    await ReactTestRenderer.act(() => {
      container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
      container.store.dispatch(
        tvActions.capabilitiesChanged(createCapabilities({ channelControl: false })),
      );
    });

    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const btn1Connected = renderer!.root.findByProps({ testID: 'btn-digit-1' });
    expect(btn1Connected.props.disabled).toBe(true);
  });

  it('does not cause unintended reconnect events during keypad operations', async () => {
    const { container, mockAdapter, render } = createTestEnv({ channelControl: true });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(createCapabilities({ channelControl: true })),
    );

    const disconnectSpy = jest.spyOn(mockAdapter, 'disconnect');

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const btn7 = renderer!.root.findByProps({ testID: 'btn-digit-7' });
    const okBtn = renderer!.root.findByProps({ testID: 'btn-digit-ok' });

    await ReactTestRenderer.act(async () => {
      btn7.props.onPress();
      okBtn.props.onPress();
    });

    expect(disconnectSpy).not.toHaveBeenCalled();
    expect(container.store.getState().connection.status).toBe(TVConnectionState.Connected);
  });

});
