import React from 'react';
import { theme, useRemoteDensity } from '../theme';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';

export interface VolumeRockerProps {
  onVolumeUp: () => void;
  onVolumeDown: () => void;
  onMute: () => void;
  disabled?: boolean;
  volDisabled?: boolean;
  muteDisabled?: boolean;
  style?: StyleProp<ViewStyle>;
  width?: number;
  height?: number;
}

export const VolumeRocker: React.FC<VolumeRockerProps> = ({
  onVolumeUp,
  onVolumeDown,
  onMute,
  disabled = false,
  volDisabled = false,
  muteDisabled = false,
  style,
  width = 66,
  height = 196,
}) => {
  const isUpDisabled = disabled || volDisabled;
  const isDownDisabled = disabled || volDisabled;
  const isMuteDisabled = disabled || muteDisabled;

  const density = useRemoteDensity();
  return (
    <View style={[styles.rockerColumn, { width, height }, density && { borderRadius: density.smallControlRadius, borderWidth: density.borderWidth }, style]} testID="volume-rocker">
      <TouchableOpacity
        style={[styles.rockerButton, styles.rockerTop, isUpDisabled && styles.controlDisabled]}
        accessibilityState={{ disabled: isUpDisabled }}
        disabled={isUpDisabled}
        onPress={onVolumeUp}
        testID="btn-vol-up"
        accessibilityLabel="Volume Up"
        accessibilityRole="button"
      >
        <Text style={styles.rockerLabel}>VOL +</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.rockerButton, styles.rockerCenter, isMuteDisabled && styles.controlDisabled]}
        accessibilityState={{ disabled: isMuteDisabled }}
        disabled={isMuteDisabled}
        onPress={onMute}
        testID="btn-mute"
        accessibilityLabel="Mute"
        accessibilityRole="button"
      >
        <Text style={styles.muteLabel}>MUTE</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.rockerButton, styles.rockerBottom, isDownDisabled && styles.controlDisabled]}
        accessibilityState={{ disabled: isDownDisabled }}
        disabled={isDownDisabled}
        onPress={onVolumeDown}
        testID="btn-vol-down"
        accessibilityLabel="Volume Down"
        accessibilityRole="button"
      >
        <Text style={styles.rockerLabel}>VOL -</Text>
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
    minHeight: 48,
    paddingHorizontal: 4,
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
  rockerLabel: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.controlLabel,
  },
  muteLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.controlMute,
  },
  controlDisabled: {
    opacity: theme.remoteDisabledOpacity,
  },
});
