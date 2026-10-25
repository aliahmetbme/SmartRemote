import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { View, Text, TouchableOpacity } from 'react-native';
import { NumericKeypadView } from '../../presentation/components/NumericKeypadView';
import { useNumericKeypadBuffer } from '../../presentation/hooks/useNumericKeypadBuffer';
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
        />
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
        />
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
        />
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

  function TestKeypadHookComponent({
    onSendDigit = jest.fn().mockResolvedValue(undefined),
    onSendKey = jest.fn().mockResolvedValue(undefined),
    bufferTimeoutMs = 3000,
  }: {
    onSendDigit?: (digit: number) => Promise<void>;
    onSendKey?: (key: RemoteKey) => Promise<void>;
    bufferTimeoutMs?: number;
  }) {
    const { channelBuffer, handleDigit, handleBackspace, handleOk } = useNumericKeypadBuffer({
      onSendDigit,
      onSendKey,
      bufferTimeoutMs,
    });

    return (
      <View>
        <Text testID="buffer-text">{channelBuffer}</Text>
        <TouchableOpacity testID="btn-1" onPress={() => handleDigit(1)} />
        <TouchableOpacity testID="btn-2" onPress={() => handleDigit(2)} />
        <TouchableOpacity testID="btn-backspace" onPress={handleBackspace} />
        <TouchableOpacity testID="btn-ok" onPress={handleOk} />
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

  it('auto-clears buffer after timeout period of inactivity', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<TestKeypadHookComponent bufferTimeoutMs={2000} />);
    });

    const btn1 = renderer!.root.findByProps({ testID: 'btn-1' });

    await act(async () => {
      btn1.props.onPress();
    });

    let buffer = renderer!.root.findByProps({ testID: 'buffer-text' });
    expect(buffer.props.children).toBe('1');

    act(() => {
      jest.advanceTimersByTime(2100);
    });

    buffer = renderer!.root.findByProps({ testID: 'buffer-text' });
    expect(buffer.props.children).toBe('');
  });

  it('handles backspace to delete last digit', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<TestKeypadHookComponent />);
    });

    const btn1 = renderer!.root.findByProps({ testID: 'btn-1' });
    const btn2 = renderer!.root.findByProps({ testID: 'btn-2' });
    const backspace = renderer!.root.findByProps({ testID: 'btn-backspace' });

    await act(async () => {
      btn1.props.onPress();
      btn2.props.onPress();
    });

    let buffer = renderer!.root.findByProps({ testID: 'buffer-text' });
    expect(buffer.props.children).toBe('12');

    act(() => {
      backspace.props.onPress();
    });

    buffer = renderer!.root.findByProps({ testID: 'buffer-text' });
    expect(buffer.props.children).toBe('1');
  });

  it('sends OK key and resets buffer when OK is pressed', async () => {
    const onSendKey = jest.fn().mockResolvedValue(undefined);
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(<TestKeypadHookComponent onSendKey={onSendKey} />);
    });

    const btn1 = renderer!.root.findByProps({ testID: 'btn-1' });
    const okBtn = renderer!.root.findByProps({ testID: 'btn-ok' });

    await act(async () => {
      btn1.props.onPress();
      okBtn.props.onPress();
    });

    expect(onSendKey).toHaveBeenCalledWith(RemoteKey.Ok);
    const buffer = renderer!.root.findByProps({ testID: 'buffer-text' });
    expect(buffer.props.children).toBe('');
  });
});
