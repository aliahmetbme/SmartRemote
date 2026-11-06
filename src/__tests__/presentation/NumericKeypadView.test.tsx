import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NumericKeypadView } from '../../presentation/components/NumericKeypadView';
import { useNumericKeypadBuffer, UseNumericKeypadBufferOptions } from '../../presentation/hooks/useNumericKeypadBuffer';

describe('NumericKeypadView (Presentational Component)', () => {
  it('renders all 10 digits, backspace, and ok buttons', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <NumericKeypadView
          channelBuffer=""
          isAvailable={true}
          isConnected={true}
          onDigitPress={() => {}}
          onBackspacePress={() => {}}
          onOkPress={() => {}}
        />,
      );
    });

    for (let i = 0; i <= 9; i++) {
      const digitBtn = renderer!.root.findByProps({ testID: `btn-digit-${i}` });
      expect(digitBtn).toBeDefined();
    }
    expect(renderer!.root.findByProps({ testID: 'btn-digit-backspace' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'btn-digit-ok' })).toBeDefined();
  });

  it('renders buffer readout display when channelBuffer is provided', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <NumericKeypadView
          channelBuffer="105"
          isAvailable={true}
          isConnected={true}
          onDigitPress={() => {}}
          onBackspacePress={() => {}}
          onOkPress={() => {}}
        />,
      );
    });

    const display = renderer!.root.findByProps({ testID: 'keypad-buffer-readout' });
    expect(display).toBeDefined();
    expect(display.findByProps({ children: '105' })).toBeDefined();
  });

  it('dispatches callbacks on button presses', () => {
    const onDigitPress = jest.fn();
    const onBackspacePress = jest.fn();
    const onOkPress = jest.fn();

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <NumericKeypadView
          channelBuffer="1"
          isAvailable={true}
          isConnected={true}
          onDigitPress={onDigitPress}
          onBackspacePress={onBackspacePress}
          onOkPress={onOkPress}
        />,
      );
    });

    const digit5 = renderer!.root.findByProps({ testID: 'btn-digit-5' });
    digit5.props.onPress();
    expect(onDigitPress).toHaveBeenCalledWith(5);

    const backspace = renderer!.root.findByProps({ testID: 'btn-digit-backspace' });
    backspace.props.onPress();
    expect(onBackspacePress).toHaveBeenCalledTimes(1);

    const okBtn = renderer!.root.findByProps({ testID: 'btn-digit-ok' });
    okBtn.props.onPress();
    expect(onOkPress).toHaveBeenCalledTimes(1);
  });
});

describe('useNumericKeypadBuffer', () => {
  let keypad: ReturnType<typeof useNumericKeypadBuffer>;
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  function Harness(props: UseNumericKeypadBufferOptions) {
    keypad = useNumericKeypadBuffer(props);
    return null;
  }

  function setup(overrides: Partial<UseNumericKeypadBufferOptions> = {}) {
    const onSelectChannel = jest.fn().mockResolvedValue('confirmed');
    const props = { onSelectChannel, targetDeviceId: 'tv-1', ...overrides };
    act(() => { renderer = ReactTestRenderer.create(<React.StrictMode><Harness {...props} /></React.StrictMode>); });
    const update = (next: Partial<UseNumericKeypadBufferOptions>) => {
      act(() => renderer!.update(<React.StrictMode><Harness {...props} {...next} /></React.StrictMode>));
    };
    return { onSelectChannel, update };
  }

  const enter = (...digits: number[]) => act(() => digits.forEach(digit => keypad.handleDigit(digit)));
  const confirm = () => act(async () => { await keypad.handleOk(); });

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  it('holds rapid digits locally, ignores the fifth, and submits one exact four-digit string', async () => {
    const { onSelectChannel } = setup();
    enter(1, 2, 3, 4, 5);
    expect(keypad.channelBuffer).toBe('1234');
    expect(onSelectChannel).not.toHaveBeenCalled();
    await confirm();
    expect(onSelectChannel.mock.calls).toEqual([['1234', expect.any(Function)]]);
    expect(keypad.channelBuffer).toBe('');
  });

  it('edits empty, one-digit and multi-digit drafts without a BACK or replay', async () => {
    const { onSelectChannel } = setup();
    act(() => keypad.handleBackspace());
    await confirm();
    enter(1);
    act(() => keypad.handleBackspace());
    expect(keypad.channelBuffer).toBe('');
    enter(2, 3, 4);
    act(() => { keypad.handleBackspace(); keypad.handleBackspace(); });
    expect(keypad.channelBuffer).toBe('2');
    expect(onSelectChannel).not.toHaveBeenCalled();
    await confirm();
    expect(onSelectChannel.mock.calls).toEqual([['2', expect.any(Function)]]);
  });

  it('expires an unconfirmed draft and accepts fresh digits after the timeout', async () => {
    const { onSelectChannel } = setup({ bufferTimeoutMs: 3000 });
    enter(2);
    act(() => jest.advanceTimersByTime(3000));
    enter(3);
    act(() => jest.advanceTimersByTime(600));
    expect(keypad.channelBuffer).toBe('3');
    expect(onSelectChannel).not.toHaveBeenCalled();
    await confirm();
    expect(onSelectChannel.mock.calls.map(([digit]) => digit)).toEqual(['3']);
  });

  it.each(['timeout', 'switch', 'disconnect', 'unmount'])(
    'invalidates a pending selection on %s',
    async reason => {
      let release!: () => void;
      const onSelectChannel = jest.fn().mockReturnValue(new Promise<string>(resolve => { release = () => resolve('confirmed'); }));
      const { update } = setup({ onSelectChannel });
      enter(2, 3, 4);
      let submission!: Promise<void>;
      act(() => {
        submission = keypad.handleOk();
        keypad.handleOk(); // No duplicate batch.
      });
      expect(onSelectChannel).toHaveBeenCalledTimes(1);
      const guard = onSelectChannel.mock.calls[0][1];
      expect(guard()).toBe(true);
      if (reason === 'switch') update({ targetDeviceId: 'tv-2' });
      if (reason === 'disconnect') update({ isConnected: false });
      if (reason === 'timeout') act(() => jest.advanceTimersByTime(3500));
      if (reason === 'unmount') {
        act(() => renderer!.unmount());
        renderer = undefined;
      }
      expect(guard()).toBe(false);
      await act(async () => { release(); await submission; });
      expect(onSelectChannel).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps editing responsive and serializes the latest confirmed selection', async () => {
    let release!: () => void;
    const { onSelectChannel } = setup();
    onSelectChannel.mockReturnValueOnce(new Promise(resolve => {
      release = () => resolve('mismatch');
    })).mockResolvedValueOnce('confirmed');
    enter(3);
    let first!: Promise<void>;
    act(() => { first = keypad.handleOk(); });
    expect(keypad.channelBuffer).toBe('');
    enter(4);
    expect(keypad.channelBuffer).toBe('4');
    await confirm();
    enter(5, 6);
    act(() => keypad.handleBackspace());
    await confirm();
    expect(keypad.channelBuffer).toBe('');
    expect(onSelectChannel.mock.calls.map(([number]) => number)).toEqual(['3']);
    expect(onSelectChannel.mock.calls[0][1]()).toBe(false);
    await act(async () => { release(); await first; });
    expect(onSelectChannel.mock.calls.map(([number]) => number)).toEqual(['3', '5']);
    expect(keypad.status).toBe('confirmed');
  });

  it('clears the draft immediately and keeps it clear on an explicit rejection', async () => {
    const { onSelectChannel } = setup();
    onSelectChannel.mockResolvedValueOnce('channel-unavailable');
    enter(2, 3);
    await confirm();
    expect(keypad.status).toBe('channel-unavailable');
    expect(keypad.channelBuffer).toBe('');
    expect(onSelectChannel).toHaveBeenCalledTimes(1);
  });
});
