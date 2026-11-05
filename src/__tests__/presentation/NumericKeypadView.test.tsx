import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { View, Text, TouchableOpacity } from 'react-native';
import { NumericKeypadView } from '../../presentation/components/NumericKeypadView';
import { useNumericKeypadBuffer, UseNumericKeypadBufferOptions } from '../../presentation/hooks/useNumericKeypadBuffer';
import { RemoteKey } from '../../domain/enums/RemoteKey';

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

describe('useNumericKeypadBuffer (Custom Hook)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  interface TestProps extends Partial<UseNumericKeypadBufferOptions> {
    onRenderLog?: (buffer: string) => void;
  }

  function TestKeypadHookComponent(props: TestProps) {
    const {
      onSendDigit = jest.fn().mockResolvedValue(undefined),
      onSendKey = jest.fn().mockResolvedValue(undefined),
      bufferTimeoutMs = 3000,
      isAvailable = true,
      isConnected = true,
      targetDeviceId = 'tv-1',
      onRenderLog,
    } = props;

    const { channelBuffer, handleDigit, handleBackspace, handleOk, flushQueue } =
      useNumericKeypadBuffer({
        onSendDigit,
        onSendKey,
        bufferTimeoutMs,
        isAvailable,
        isConnected,
        targetDeviceId,
      });

    onRenderLog?.(channelBuffer);

    return (
      <View>
        <Text testID="buffer-text">{channelBuffer}</Text>
        <TouchableOpacity testID="btn-0" onPress={() => handleDigit(0)} />
        <TouchableOpacity testID="btn-1" onPress={() => handleDigit(1)} />
        <TouchableOpacity testID="btn-2" onPress={() => handleDigit(2)} />
        <TouchableOpacity testID="btn-3" onPress={() => handleDigit(3)} />
        <TouchableOpacity testID="btn-4" onPress={() => handleDigit(4)} />
        <TouchableOpacity testID="btn-5" onPress={() => handleDigit(5)} />
        <TouchableOpacity testID="btn-backspace" onPress={handleBackspace} />
        <TouchableOpacity testID="btn-ok" onPress={handleOk} />
        <TouchableOpacity testID="btn-flush" onPress={() => flushQueue?.()} />
      </View>
    );
  }

  it('accumulates digits into channelBuffer and calls onSendDigit', async () => {
    const onSendDigit = jest.fn().mockResolvedValue(undefined);
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(<TestKeypadHookComponent onSendDigit={onSendDigit} />);
    });

    const btn1 = renderer!.root.findByProps({ testID: 'btn-1' });
    const btn2 = renderer!.root.findByProps({ testID: 'btn-2' });

    await act(async () => {
      btn1.props.onPress();
    });

    let buffer = renderer!.root.findByProps({ testID: 'buffer-text' });
    expect(buffer.props.children).toBe('1');
    expect(onSendDigit).toHaveBeenCalledWith(1);

    await act(async () => {
      btn2.props.onPress();
    });

    buffer = renderer!.root.findByProps({ testID: 'buffer-text' });
    expect(buffer.props.children).toBe('12');
    expect(onSendDigit).toHaveBeenCalledWith(2);
  });

  it('enforces 4-digit limit and resets buffer to single digit when digit is entered after 4 digits', async () => {
    const onSendDigit = jest.fn().mockResolvedValue(undefined);
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(<TestKeypadHookComponent onSendDigit={onSendDigit} />);
    });

    const btn1 = renderer!.root.findByProps({ testID: 'btn-1' });
    const btn2 = renderer!.root.findByProps({ testID: 'btn-2' });
    const btn3 = renderer!.root.findByProps({ testID: 'btn-3' });
    const btn4 = renderer!.root.findByProps({ testID: 'btn-4' });
    const btn5 = renderer!.root.findByProps({ testID: 'btn-5' });

    await act(async () => {
      btn1.props.onPress();
      btn2.props.onPress();
      btn3.props.onPress();
      btn4.props.onPress();
    });

    let buffer = renderer!.root.findByProps({ testID: 'buffer-text' });
    expect(buffer.props.children).toBe('1234');

    // Enter 5th digit: buffer resets to "5"
    await act(async () => {
      btn5.props.onPress();
    });

    buffer = renderer!.root.findByProps({ testID: 'buffer-text' });
    expect(buffer.props.children).toBe('5');
    expect(onSendDigit).toHaveBeenCalledWith(5);
  });

  it('handles rapid digit input without stale buffer reads or dropped commands', async () => {
    const executed: number[] = [];
    const onSendDigit = jest.fn().mockImplementation(async (d: number) => {
      executed.push(d);
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<TestKeypadHookComponent onSendDigit={onSendDigit} />);
    });

    const btn1 = renderer!.root.findByProps({ testID: 'btn-1' });
    const btn2 = renderer!.root.findByProps({ testID: 'btn-2' });
    const btn3 = renderer!.root.findByProps({ testID: 'btn-3' });

    // Rapid synchronous taps
    act(() => {
      btn1.props.onPress();
      btn2.props.onPress();
      btn3.props.onPress();
    });

    // Buffer reflects authoritative synchronous state immediately
    const buffer = renderer!.root.findByProps({ testID: 'buffer-text' });
    expect(buffer.props.children).toBe('123');

    // Flush promises
    await act(async () => {
      jest.runAllTicks();
    });

    expect(executed).toEqual([1, 2, 3]);
  });

  it('handles backspace with empty buffer: sends BACK key and leaves buffer empty', async () => {
    const onSendKey = jest.fn().mockResolvedValue(undefined);
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(<TestKeypadHookComponent onSendKey={onSendKey} />);
    });

    const backspace = renderer!.root.findByProps({ testID: 'btn-backspace' });

    await act(async () => {
      backspace.props.onPress();
    });

    const buffer = renderer!.root.findByProps({ testID: 'buffer-text' });
    expect(buffer.props.children).toBe('');
    expect(onSendKey).toHaveBeenCalledWith(RemoteKey.Back);
  });

  it('handles backspace with one digit: sends BACK key and clears buffer', async () => {
    const onSendKey = jest.fn().mockResolvedValue(undefined);
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(<TestKeypadHookComponent onSendKey={onSendKey} />);
    });

    const btn1 = renderer!.root.findByProps({ testID: 'btn-1' });
    const backspace = renderer!.root.findByProps({ testID: 'btn-backspace' });

    await act(async () => {
      btn1.props.onPress();
    });
    expect(renderer!.root.findByProps({ testID: 'buffer-text' }).props.children).toBe('1');

    await act(async () => {
      backspace.props.onPress();
    });

    const buffer = renderer!.root.findByProps({ testID: 'buffer-text' });
    expect(buffer.props.children).toBe('');
    expect(onSendKey).toHaveBeenCalledWith(RemoteKey.Back);
  });

  it('handles backspace with multiple digits: pops digit, sends BACK key and resends remaining digits', async () => {
    const commands: string[] = [];
    const onSendDigit = jest.fn().mockImplementation(async (d: number) => {
      commands.push(`digit:${d}`);
    });
    const onSendKey = jest.fn().mockImplementation(async (k: RemoteKey) => {
      commands.push(`key:${k}`);
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <TestKeypadHookComponent onSendDigit={onSendDigit} onSendKey={onSendKey} />,
      );
    });

    const btn1 = renderer!.root.findByProps({ testID: 'btn-1' });
    const btn2 = renderer!.root.findByProps({ testID: 'btn-2' });
    const btn3 = renderer!.root.findByProps({ testID: 'btn-3' });
    const backspace = renderer!.root.findByProps({ testID: 'btn-backspace' });

    await act(async () => {
      btn1.props.onPress();
      btn2.props.onPress();
      btn3.props.onPress();
    });
    expect(renderer!.root.findByProps({ testID: 'buffer-text' }).props.children).toBe('123');

    // Tap backspace: pops '3', buffer becomes '12', sends BACK, then digit:1, digit:2
    await act(async () => {
      backspace.props.onPress();
    });

    expect(renderer!.root.findByProps({ testID: 'buffer-text' }).props.children).toBe('12');
    expect(commands).toEqual([
      'digit:1',
      'digit:2',
      'digit:3',
      `key:${RemoteKey.Back}`,
      'digit:1',
      'digit:2',
    ]);
  });

  it('handles backspace immediately after rapid digit entry without race conditions', async () => {
    const commands: string[] = [];
    const onSendDigit = jest.fn().mockImplementation(async (d: number) => {
      commands.push(`digit:${d}`);
    });
    const onSendKey = jest.fn().mockImplementation(async (k: RemoteKey) => {
      commands.push(`key:${k}`);
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <TestKeypadHookComponent onSendDigit={onSendDigit} onSendKey={onSendKey} />,
      );
    });

    const btn1 = renderer!.root.findByProps({ testID: 'btn-1' });
    const btn2 = renderer!.root.findByProps({ testID: 'btn-2' });
    const backspace = renderer!.root.findByProps({ testID: 'btn-backspace' });

    // Rapid taps: 1 -> 2 -> Backspace in the same tick
    act(() => {
      btn1.props.onPress();
      btn2.props.onPress();
      backspace.props.onPress();
    });

    expect(renderer!.root.findByProps({ testID: 'buffer-text' }).props.children).toBe('1');

    await act(async () => {
      jest.runAllTicks();
    });

    expect(commands).toEqual(['digit:1', 'digit:2', `key:${RemoteKey.Back}`, 'digit:1']);
  });

  it('handles OK after pending digits: immediately clears buffer and queues OK after digits', async () => {
    const commands: string[] = [];
    const onSendDigit = jest.fn().mockImplementation(async (d: number) => {
      commands.push(`digit:${d}`);
    });
    const onSendKey = jest.fn().mockImplementation(async (k: RemoteKey) => {
      commands.push(`key:${k}`);
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <TestKeypadHookComponent onSendDigit={onSendDigit} onSendKey={onSendKey} />,
      );
    });

    const btn4 = renderer!.root.findByProps({ testID: 'btn-4' });
    const btn2 = renderer!.root.findByProps({ testID: 'btn-2' });
    const okBtn = renderer!.root.findByProps({ testID: 'btn-ok' });

    act(() => {
      btn4.props.onPress();
      btn2.props.onPress();
      okBtn.props.onPress();
    });

    // Buffer cleared synchronously on OK
    expect(renderer!.root.findByProps({ testID: 'buffer-text' }).props.children).toBe('');

    await act(async () => {
      jest.runAllTicks();
    });

    expect(commands).toEqual(['digit:4', 'digit:2', `key:${RemoteKey.Ok}`]);
  });

  it('resets inactivity timer after each digit tap', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<TestKeypadHookComponent bufferTimeoutMs={1000} />);
    });

    const btn1 = renderer!.root.findByProps({ testID: 'btn-1' });
    const btn2 = renderer!.root.findByProps({ testID: 'btn-2' });

    act(() => {
      btn1.props.onPress();
    });
    expect(renderer!.root.findByProps({ testID: 'buffer-text' }).props.children).toBe('1');

    // Advance 700ms (not expired)
    act(() => {
      jest.advanceTimersByTime(700);
    });
    expect(renderer!.root.findByProps({ testID: 'buffer-text' }).props.children).toBe('1');

    // Tap second digit at 700ms: resets timer for another 1000ms
    act(() => {
      btn2.props.onPress();
    });
    expect(renderer!.root.findByProps({ testID: 'buffer-text' }).props.children).toBe('12');

    // Advance 700ms (total 1400ms from start, but 700ms from last tap): still active!
    act(() => {
      jest.advanceTimersByTime(700);
    });
    expect(renderer!.root.findByProps({ testID: 'buffer-text' }).props.children).toBe('12');

    // Advance remaining 350ms (total 1050ms from last tap): expires and resets buffer
    act(() => {
      jest.advanceTimersByTime(350);
    });
    expect(renderer!.root.findByProps({ testID: 'buffer-text' }).props.children).toBe('');
  });

  it('cleans up timeout safely on unmount without state updates or warnings', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<TestKeypadHookComponent bufferTimeoutMs={2000} />);
    });

    const btn1 = renderer!.root.findByProps({ testID: 'btn-1' });
    act(() => {
      btn1.props.onPress();
    });

    // Unmount before timeout expires
    act(() => {
      renderer.unmount();
    });

    // Advance time past the timer: no errors thrown
    expect(() => {
      act(() => {
        jest.advanceTimersByTime(3000);
      });
    }).not.toThrow();
  });

  it('is completely safe in React Strict Mode with zero duplicate command execution', async () => {
    const onSendDigit = jest.fn().mockResolvedValue(undefined);
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(
        <React.StrictMode>
          <TestKeypadHookComponent onSendDigit={onSendDigit} />
        </React.StrictMode>,
      );
    });

    const btn1 = renderer!.root.findByProps({ testID: 'btn-1' });

    await act(async () => {
      btn1.props.onPress();
    });

    expect(renderer!.root.findByProps({ testID: 'buffer-text' }).props.children).toBe('1');
    expect(onSendDigit).toHaveBeenCalledTimes(1);
    expect(onSendDigit).toHaveBeenCalledWith(1);
  });

  it('continues queue processing when a command fails without poisoning subsequent commands', async () => {
    const commands: string[] = [];
    const onSendDigit = jest.fn().mockImplementation(async (d: number) => {
      if (d === 2) {
        commands.push(`digit:${d}:FAIL`);
        throw new Error('Network error on digit 2');
      }
      commands.push(`digit:${d}:SUCCESS`);
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<TestKeypadHookComponent onSendDigit={onSendDigit} />);
    });

    const btn1 = renderer!.root.findByProps({ testID: 'btn-1' });
    const btn2 = renderer!.root.findByProps({ testID: 'btn-2' });
    const btn3 = renderer!.root.findByProps({ testID: 'btn-3' });

    act(() => {
      btn1.props.onPress();
      btn2.props.onPress();
      btn3.props.onPress();
    });

    await act(async () => {
      jest.runAllTicks();
    });

    // Digit 2 failed, but digit 3 was still dispatched sequentially
    expect(commands).toEqual(['digit:1:SUCCESS', 'digit:2:FAIL', 'digit:3:SUCCESS']);
  });

  it('invalidates pending commands and resets buffer when targetDeviceId switches', async () => {
    const commands: string[] = [];
    let resolveCommand1: () => void = () => {};

    const onSendDigit = jest.fn().mockImplementation(async (d: number) => {
      if (d === 1) {
        await new Promise<void>(resolve => {
          resolveCommand1 = resolve;
        });
      }
      commands.push(`digit:${d}`);
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <TestKeypadHookComponent onSendDigit={onSendDigit} targetDeviceId="tv-living-room" />,
      );
    });

    const btn1 = renderer!.root.findByProps({ testID: 'btn-1' });
    const btn2 = renderer!.root.findByProps({ testID: 'btn-2' });

    act(() => {
      btn1.props.onPress();
      btn2.props.onPress();
    });

    // Allow command 1 to enter in-flight execution
    await act(async () => {
      await Promise.resolve();
    });

    // Switch TV while digit 1 is in-flight and digit 2 is queued
    act(() => {
      renderer.update(
        <TestKeypadHookComponent onSendDigit={onSendDigit} targetDeviceId="tv-bedroom" />,
      );
    });

    // Finish in-flight command 1
    await act(async () => {
      resolveCommand1();
      jest.runAllTicks();
    });

    // Buffer reset on TV switch
    expect(renderer!.root.findByProps({ testID: 'buffer-text' }).props.children).toBe('');
    // Queued command 2 was invalidated by generation change and never dispatched to the new TV
    expect(commands).toEqual(['digit:1']);
  });

  it('cancels pending commands and resets buffer when TV disconnects during queued input', async () => {
    const commands: string[] = [];
    let resolveCommand1: () => void = () => {};

    const onSendDigit = jest.fn().mockImplementation(async (d: number) => {
      if (d === 1) {
        await new Promise<void>(resolve => {
          resolveCommand1 = resolve;
        });
      }
      commands.push(`digit:${d}`);
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <TestKeypadHookComponent onSendDigit={onSendDigit} isConnected={true} />,
      );
    });

    const btn1 = renderer!.root.findByProps({ testID: 'btn-1' });
    const btn2 = renderer!.root.findByProps({ testID: 'btn-2' });

    act(() => {
      btn1.props.onPress();
      btn2.props.onPress();
    });

    // Allow command 1 to enter in-flight execution
    await act(async () => {
      await Promise.resolve();
    });

    // Disconnection occurs while command 1 is in flight and command 2 is queued
    act(() => {
      renderer.update(
        <TestKeypadHookComponent onSendDigit={onSendDigit} isConnected={false} />,
      );
    });

    // Finish in-flight command 1
    await act(async () => {
      resolveCommand1();
      jest.runAllTicks();
    });

    expect(renderer!.root.findByProps({ testID: 'buffer-text' }).props.children).toBe('');
    // Command 2 was cancelled
    expect(commands).toEqual(['digit:1']);
  });
});
