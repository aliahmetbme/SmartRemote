import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useContainer } from '../context/ContainerContext';
import { useAppSelector } from '../../store/hooks';
import { selectCapabilities, selectConnectionStatus } from '../../store/selectors';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { RemoteKey } from '../../domain/enums/RemoteKey';
import { theme } from '../theme';

export interface NumericKeypadProps {
  style?: StyleProp<ViewStyle>;
  bufferTimeoutMs?: number;
}

export const NumericKeypad: React.FC<NumericKeypadProps> = ({
  style,
  bufferTimeoutMs = 3500,
}) => {
  const container = useContainer();
  const connectionStatus = useAppSelector(selectConnectionStatus);
  const capabilities = useAppSelector(selectCapabilities);

  const isConnected = connectionStatus === TVConnectionState.Connected;
  const isChannelCapable = capabilities?.channelControl !== 'unsupported';
  const isAvailable = isConnected && isChannelCapable;

  const [channelBuffer, setChannelBuffer] = useState<string>('');
  const bufferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FIFO sequential promise queue to preserve digit ordering during rapid taps
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const enqueue = (commandFn: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(
      () => commandFn(),
      () => commandFn(), // continue queue execution even if a prior command failed
    );
    return queueRef.current;
  };

  // Clean up buffer timer on unmount
  useEffect(() => {
    return () => {
      if (bufferTimeoutRef.current) {
        clearTimeout(bufferTimeoutRef.current);
      }
    };
  }, []);

  const handleDigit = (digit: number) => {
    if (!isAvailable) return;

    // Reset buffer timeout: after 3.5s of inactivity, TV tunes and we clear local readout
    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
    }
    bufferTimeoutRef.current = setTimeout(() => {
      setChannelBuffer('');
    }, bufferTimeoutMs);

    setChannelBuffer(prev => (prev.length >= 4 ? String(digit) : prev + digit));

    enqueue(async () => {
      try {
        await container.useCases.sendRemoteCommand.execute({
          type: 'digit',
          digit,
        });
      } catch {
        // Non-fatal command failure
      }
    });
  };

  const handleOk = () => {
    if (!isConnected) return;

    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
    }
    setChannelBuffer('');

    enqueue(async () => {
      try {
        await container.useCases.sendRemoteCommand.execute({
          type: 'key',
          key: RemoteKey.Ok,
        });
      } catch {
        // Non-fatal command failure
      }
    });
  };

  const handleBackspace = () => {
    if (!isConnected) return;

    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
    }

    setChannelBuffer(prev => {
      if (prev.length <= 1) {
        // Buffer now empty or was already empty: send BACK to dismiss TV channel banner
        enqueue(async () => {
          try {
            await container.useCases.sendRemoteCommand.execute({
              type: 'key',
              key: RemoteKey.Back,
            });
          } catch {
            // Non-fatal command failure
          }
        });
        return '';
      }

      // Buffer had 2+ digits (e.g. "12"): pop last digit ("1")
      const remaining = prev.slice(0, -1);

      // Dismiss TV's current multi-digit prompt and resend remaining digits
      enqueue(async () => {
        try {
          await container.useCases.sendRemoteCommand.execute({
            type: 'key',
            key: RemoteKey.Back,
          });
          for (const char of remaining) {
            const d = parseInt(char, 10);
            await container.useCases.sendRemoteCommand.execute({
              type: 'digit',
              digit: d,
            });
          }
        } catch {
          // Non-fatal command failure
        }
      });

      bufferTimeoutRef.current = setTimeout(() => {
        setChannelBuffer('');
      }, bufferTimeoutMs);

      return remaining;
    });
  };

  const renderDigitButton = (digit: number) => (
    <TouchableOpacity
      key={digit}
      style={[styles.keyButton, !isAvailable && styles.keyDisabled]}
      disabled={!isAvailable}
      activeOpacity={0.65}
      onPress={() => handleDigit(digit)}
      testID={`btn-digit-${digit}`}
      accessibilityRole="button"
      accessibilityLabel={`Digit ${digit}`}
    >
      <Text style={styles.digitText}>{digit}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, style]} testID="numeric-keypad">
      {/* Channel Entry Readout Display */}
      <View style={styles.displayCard} testID="keypad-channel-display">
        <Text style={styles.displayLabel}>CHANNEL</Text>
        <Text
          style={[styles.displayText, channelBuffer ? styles.displayTextActive : null]}
          testID="keypad-buffer-readout"
        >
          {channelBuffer ? channelBuffer : '— — —'}
        </Text>
      </View>

      {/* Grid Row 1: 1 2 3 */}
      <View style={styles.row}>
        {renderDigitButton(1)}
        {renderDigitButton(2)}
        {renderDigitButton(3)}
      </View>

      {/* Grid Row 2: 4 5 6 */}
      <View style={styles.row}>
        {renderDigitButton(4)}
        {renderDigitButton(5)}
        {renderDigitButton(6)}
      </View>

      {/* Grid Row 3: 7 8 9 */}
      <View style={styles.row}>
        {renderDigitButton(7)}
        {renderDigitButton(8)}
        {renderDigitButton(9)}
      </View>

      {/* Grid Row 4: ⌫ 0 OK */}
      <View style={styles.row}>
        {/* Backspace Button */}
        <TouchableOpacity
          style={[styles.keyButton, styles.specialButton, !isConnected && styles.keyDisabled]}
          disabled={!isConnected}
          activeOpacity={0.65}
          onPress={handleBackspace}
          testID="btn-digit-backspace"
          accessibilityRole="button"
          accessibilityLabel="Backspace"
        >
          <Text style={styles.backspaceIcon}>⌫</Text>
        </TouchableOpacity>

        {/* 0 Button */}
        {renderDigitButton(0)}

        {/* OK / Confirm Button */}
        <TouchableOpacity
          style={[styles.keyButton, styles.okButton, !isConnected && styles.keyDisabled]}
          disabled={!isConnected}
          activeOpacity={0.65}
          onPress={handleOk}
          testID="btn-digit-ok"
          accessibilityRole="button"
          accessibilityLabel="OK / Confirm Channel"
        >
          <Text style={styles.okText}>OK</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: theme.spacing.sm,
  },
  displayCard: {
    width: '100%',
    maxWidth: 280,
    backgroundColor: '#121622',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: '#262F44',
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  displayLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6F7B95',
    letterSpacing: 0.8,
  },
  displayText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#5C667E',
    letterSpacing: 2,
  },
  displayTextActive: {
    color: theme.colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  keyButton: {
    width: 76,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#1C2232',
    borderWidth: 1.5,
    borderColor: '#2B354C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  specialButton: {
    backgroundColor: '#19202E',
    borderColor: '#263045',
  },
  okButton: {
    backgroundColor: '#1F2A3E',
    borderColor: '#364B6E',
  },
  keyDisabled: {
    opacity: 0.45,
  },
  digitText: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  backspaceIcon: {
    fontSize: 20,
    fontWeight: '600',
    color: '#D4DAE8',
  },
  okText: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.secondary,
    letterSpacing: 0.5,
  },
});
