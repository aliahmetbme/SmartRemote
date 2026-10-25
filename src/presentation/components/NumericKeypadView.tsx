import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { theme } from '../theme';

export interface NumericKeypadViewProps {
  channelBuffer: string;
  isAvailable?: boolean;
  isConnected?: boolean;
  onDigitPress: (digit: number) => void;
  onBackspacePress: () => void;
  onOkPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Pure presentational component rendering the 4x3 channel keypad grid
 * and entry readout display. Has zero dependencies on DI container or Redux.
 */
export const NumericKeypadView: React.FC<NumericKeypadViewProps> = ({
  channelBuffer,
  isAvailable = true,
  isConnected = true,
  onDigitPress,
  onBackspacePress,
  onOkPress,
  style,
}) => {
  const renderDigitButton = (digit: number) => (
    <TouchableOpacity
      key={digit}
      style={[styles.keyButton, !isAvailable && styles.keyDisabled]}
      disabled={!isAvailable}
      activeOpacity={0.65}
      onPress={() => onDigitPress(digit)}
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
          onPress={onBackspacePress}
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
          onPress={onOkPress}
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
    borderColor: '#252D3F',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 14,
    alignItems: 'center',
  },
  displayLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#65738E',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  displayText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#4B576D',
    letterSpacing: 4,
  },
  displayTextActive: {
    color: theme.colors.secondary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
  },
  keyButton: {
    width: 72,
    height: 52,
    backgroundColor: '#1B2130',
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: '#2B354C',
  },
  keyDisabled: {
    opacity: 0.45,
  },
  digitText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#E0E6F0',
  },
  specialButton: {
    backgroundColor: '#161B26',
    borderColor: '#242D40',
  },
  backspaceIcon: {
    fontSize: 18,
    color: '#B6BECE',
  },
  okButton: {
    backgroundColor: '#1A2938',
    borderColor: '#28415C',
  },
  okText: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.secondary,
    letterSpacing: 0.5,
  },
});
