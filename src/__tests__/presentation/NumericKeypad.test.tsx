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
import { RemoteKey } from '../../domain/enums/RemoteKey';

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

  it('dispatches digit commands 0-9 and updates channel readout display', async () => {
    const { container, render } = createTestEnv({ channelControl: true });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(createCapabilities({ channelControl: true })),
    );

    const sendCommandSpy = jest
      .spyOn(container.useCases.sendRemoteCommand, 'execute')
      .mockResolvedValue();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    // Tap '1'
    const btn1 = renderer!.root.findByProps({ testID: 'btn-digit-1' });
    await ReactTestRenderer.act(async () => {
      btn1.props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'digit', digit: 1 });

    const readout = renderer!.root.findByProps({ testID: 'keypad-buffer-readout' });
    expect(readout.props.children).toBe('1');

    // Tap '2'
    const btn2 = renderer!.root.findByProps({ testID: 'btn-digit-2' });
    await ReactTestRenderer.act(async () => {
      btn2.props.onPress();
    });
    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'digit', digit: 2 });
    expect(readout.props.children).toBe('12');
  });

  it('preserves strict FIFO ordering when digits are tapped rapidly', async () => {
    const { container, render } = createTestEnv({ channelControl: true });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(createCapabilities({ channelControl: true })),
    );

    const executedCommands: number[] = [];

    // Simulate asynchronous execution with small random delays
    jest.spyOn(container.useCases.sendRemoteCommand, 'execute').mockImplementation(async cmd => {
      if (cmd.type === 'digit') {
        await new Promise(resolve => setTimeout(() => resolve(undefined), Math.random() * 10));
        executedCommands.push(cmd.digit);
      }
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const btn5 = renderer!.root.findByProps({ testID: 'btn-digit-5' });
    const btn0 = renderer!.root.findByProps({ testID: 'btn-digit-0' });
    const btn1 = renderer!.root.findByProps({ testID: 'btn-digit-1' });

    // Rapid taps: 5 -> 0 -> 1 without awaiting each individually
    await ReactTestRenderer.act(async () => {
      btn5.props.onPress();
      btn0.props.onPress();
      btn1.props.onPress();
    });

    // Wait for queue to flush
    await new Promise(r => setTimeout(() => r(undefined), 50));

    expect(executedCommands).toEqual([5, 0, 1]);
    const readout = renderer!.root.findByProps({ testID: 'keypad-buffer-readout' });
    expect(readout.props.children).toBe('501');
  });

  it('handles OK semantics: confirms channel and clears readout buffer immediately', async () => {
    const { container, render } = createTestEnv({ channelControl: true });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(createCapabilities({ channelControl: true })),
    );

    const sendCommandSpy = jest
      .spyOn(container.useCases.sendRemoteCommand, 'execute')
      .mockResolvedValue();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    // Enter channel '4'
    const btn4 = renderer!.root.findByProps({ testID: 'btn-digit-4' });
    await ReactTestRenderer.act(async () => {
      btn4.props.onPress();
    });

    const readout = renderer!.root.findByProps({ testID: 'keypad-buffer-readout' });
    expect(readout.props.children).toBe('4');

    // Press OK
    const okBtn = renderer!.root.findByProps({ testID: 'btn-digit-ok' });
    await ReactTestRenderer.act(async () => {
      okBtn.props.onPress();
    });

    expect(sendCommandSpy).toHaveBeenCalledWith({ type: 'key', key: RemoteKey.Ok });
    // Buffer must be cleared immediately
    expect(readout.props.children).toBe('— — —');
  });

  it('handles Backspace semantics: pops last digit, dismisses banner with BACK, and resends remaining', async () => {
    const { container, render } = createTestEnv({ channelControl: true });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(createCapabilities({ channelControl: true })),
    );

    const callLog: string[] = [];

    jest.spyOn(container.useCases.sendRemoteCommand, 'execute').mockImplementation(async cmd => {
      if (cmd.type === 'digit') {
        callLog.push(`digit:${cmd.digit}`);
      } else if (cmd.type === 'key') {
        callLog.push(`key:${cmd.key}`);
      }
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render();
    });

    const btn1 = renderer!.root.findByProps({ testID: 'btn-digit-1' });
    const btn2 = renderer!.root.findByProps({ testID: 'btn-digit-2' });
    const backspaceBtn = renderer!.root.findByProps({ testID: 'btn-digit-backspace' });
    const readout = renderer!.root.findByProps({ testID: 'keypad-buffer-readout' });

    // Enter '1' then '2' -> buffer "12"
    await ReactTestRenderer.act(async () => {
      btn1.props.onPress();
      btn2.props.onPress();
    });
    expect(readout.props.children).toBe('12');

    // Tap Backspace: should dismiss "12" banner with BACK, then resend remaining "1"
    await ReactTestRenderer.act(async () => {
      backspaceBtn.props.onPress();
    });
    expect(readout.props.children).toBe('1');
    expect(callLog).toEqual(['digit:1', 'digit:2', `key:${RemoteKey.Back}`, 'digit:1']);

    // Tap Backspace again: buffer has 1 digit, so clears buffer and dismisses banner with BACK
    await ReactTestRenderer.act(async () => {
      backspaceBtn.props.onPress();
    });
    expect(readout.props.children).toBe('— — —');
    expect(callLog).toEqual(['digit:1', 'digit:2', `key:${RemoteKey.Back}`, 'digit:1', `key:${RemoteKey.Back}`]);
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

  it('automatically resets channel buffer after inactivity timeout', async () => {
    const { container, render } = createTestEnv({ channelControl: true });

    container.store.dispatch(connectionActions.statusChanged(TVConnectionState.Connected));
    container.store.dispatch(
      tvActions.capabilitiesChanged(createCapabilities({ channelControl: true })),
    );

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = render({ bufferTimeoutMs: 20 });
    });

    const btn3 = renderer!.root.findByProps({ testID: 'btn-digit-3' });
    await ReactTestRenderer.act(async () => {
      btn3.props.onPress();
    });

    const readout = renderer!.root.findByProps({ testID: 'keypad-buffer-readout' });
    expect(readout.props.children).toBe('3');

    // Wait for the 20ms timeout to trigger auto-clear
    await ReactTestRenderer.act(async () => {
      await new Promise(r => setTimeout(() => r(undefined), 40));
    });

    expect(readout.props.children).toBe('— — —');
  });
});
