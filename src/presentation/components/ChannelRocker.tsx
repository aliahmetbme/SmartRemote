import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';

export interface ChannelRockerProps {
  onChannelUp: () => void;
  onChannelDown: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const ChannelRocker: React.FC<ChannelRockerProps> = ({
  onChannelUp,
  onChannelDown,
  disabled = false,
  style,
}) => {
  return (
    <View style={[styles.rockerColumn, style]} testID="channel-rocker">
      <TouchableOpacity
        style={[styles.rockerButton, styles.rockerTop, disabled && styles.controlDisabled]}
        disabled={disabled}
        onPress={onChannelUp}
        testID="btn-ch-up"
        accessibilityLabel="Channel Up"
        accessibilityRole="button"
      >
        <Text style={styles.rockerLabel}>CH ∧</Text>
      </TouchableOpacity>

      <View style={[styles.rockerButton, styles.rockerCenter, styles.rockerPlaceholder]}>
        <View style={styles.rockerDividerDot} />
      </View>

      <TouchableOpacity
        style={[styles.rockerButton, styles.rockerBottom, disabled && styles.controlDisabled]}
        disabled={disabled}
        onPress={onChannelDown}
        testID="btn-ch-down"
        accessibilityLabel="Channel Down"
        accessibilityRole="button"
      >
        <Text style={styles.rockerLabel}>CH ∨</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  rockerColumn: {
    width: 66,
    height: 196,
    borderRadius: 33,
    backgroundColor: '#1B2130',
    borderWidth: 1.5,
    borderColor: '#2B354C',
    overflow: 'hidden',
  },
  rockerButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rockerTop: {
    borderBottomWidth: 1,
    borderBottomColor: '#252D3F',
  },
  rockerCenter: {
    borderBottomWidth: 1,
    borderBottomColor: '#252D3F',
  },
  rockerBottom: {},
  rockerPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  rockerDividerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3B455E',
  },
  rockerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B6BECE',
  },
  controlDisabled: {
    opacity: 0.45,
  },
});
