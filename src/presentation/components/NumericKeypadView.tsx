import type { ChannelEntryStatus } from '../hooks/useNumericKeypadBuffer';
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { theme, usePresentationLayout, useRemoteDensity, layoutTokens } from '../theme';

const channelStatusLabels = {
  interrupted: 'INTERRUPTED',
  confirmed: 'CHANNEL VERIFIED',
  'accepted-unverified': 'UNVERIFIED',
  'readback-unavailable': 'READBACK UNAVAILABLE',
  mismatch: 'CHANNEL MISMATCH',
  unsupported: 'TUNING UNSUPPORTED',
  'permission-denied': 'TUNING DENIED',
  'source-unavailable': 'SOURCE UNAVAILABLE',
  'channel-unavailable': 'CHANNEL UNAVAILABLE',
  rejected: 'TUNING REJECTED',
  'transport-error': 'CONNECTION ERROR',
} as const;

export interface NumericKeypadViewProps {
  channelBuffer: string;
  status?: ChannelEntryStatus;
  busy?: boolean;
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
  status = 'editing',
  busy = false,
  isAvailable = true,
  isConnected = true,
  onDigitPress,
  onBackspacePress,
  onOkPress,
  style,
}) => {
  const { fontScale } = usePresentationLayout();
  const density = useRemoteDensity();
  const keyHeight = Math.max(layoutTokens.minimumTouchTarget, Math.ceil(24 * fontScale + (density ? 8 : 20)));
  const keyStyle = [styles.keyButton, { minHeight: keyHeight }, density && {
    borderRadius: density.tileRadius,
    paddingVertical: density.displayPadding,
    paddingHorizontal: density.keyHorizontalPadding,
  }];
  const rowStyle = [styles.row, density && [styles.compactSpacing, { gap: density.keyGap }]];
  const enabled = isAvailable && isConnected;
  const canEdit = enabled;
  const renderDigitButton = (digit: number) => (
    <TouchableOpacity
      key={digit}
      style={[keyStyle, !canEdit && styles.keyDisabled]}
      accessibilityState={{ disabled: !canEdit }}
      disabled={!canEdit}
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
    <View style={[styles.container, density && [styles.compactSpacing, { gap: density.keyGap }], style]} testID="numeric-keypad">
      {/* Channel Entry Readout Display */}
      <View style={[styles.displayCard, density && styles.inlineDisplay]} testID="keypad-channel-display">
        <Text style={styles.displayLabel} accessibilityLiveRegion="polite">
          {status === 'editing' || status === 'sending'
            ? busy ? 'SELECTING CHANNEL' : channelBuffer ? 'PRESS OK' : 'CHANNEL'
            : channelStatusLabels[status]}
        </Text>
        <Text
          style={[styles.displayText, channelBuffer ? styles.displayTextActive : null]}
          testID="keypad-buffer-readout"
        >
          {channelBuffer ? channelBuffer : '— — —'}
        </Text>
      </View>

      {/* Grid Row 1: 1 2 3 */}
      <View style={rowStyle}>
        {renderDigitButton(1)}
        {renderDigitButton(2)}
        {renderDigitButton(3)}
      </View>

      {/* Grid Row 2: 4 5 6 */}
      <View style={rowStyle}>
        {renderDigitButton(4)}
        {renderDigitButton(5)}
        {renderDigitButton(6)}
      </View>

      {/* Grid Row 3: 7 8 9 */}
      <View style={rowStyle}>
        {renderDigitButton(7)}
        {renderDigitButton(8)}
        {renderDigitButton(9)}
      </View>

      {/* Grid Row 4: ⌫ 0 OK */}
      <View style={rowStyle}>
        {/* Backspace Button */}
        <TouchableOpacity
          style={[keyStyle, styles.specialButton, !enabled && styles.keyDisabled]}
          accessibilityState={{ disabled: !enabled }}
          disabled={!enabled}
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
          style={[keyStyle, styles.okButton, (!canEdit || !channelBuffer) && styles.keyDisabled]}
          accessibilityState={{ disabled: !canEdit || !channelBuffer, busy }}
          disabled={!canEdit || !channelBuffer}
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
    width: '100%',
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
    marginBottom: 8,
    alignItems: 'center',
  },
  compactSpacing: { marginVertical: 0 },
  inlineDisplay: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    columnGap: 8, paddingVertical: 4, marginBottom: 0,
  },
  displayLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.controlSectionLabel,
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  displayText: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 4,
  },
  displayTextActive: {
    color: theme.colors.secondary,
  },
  row: {
    width: '100%',
    maxWidth: 280,
    gap: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
  },
  keyButton: {
    flex: 1,
    minWidth: 48,
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: '#1B2130',
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2B354C',
  },
  keyDisabled: {
    opacity: theme.remoteDisabledOpacity,
  },
  digitText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.controlDigit,
  },
  specialButton: {
    backgroundColor: '#161B26',
    borderColor: '#242D40',
  },
  backspaceIcon: {
    fontSize: 18,
    color: theme.colors.controlLabel,
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
