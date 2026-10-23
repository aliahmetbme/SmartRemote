import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';

export interface VolumeRockerProps {
  onVolumeUp: () => void;
  onVolumeDown: () => void;
  onMute: () => void;
  disabled?: boolean;
  volDisabled?: boolean;
  muteDisabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const VolumeRocker: React.FC<VolumeRockerProps> = ({
  onVolumeUp,
  onVolumeDown,
  onMute,
  disabled = false,
  volDisabled = false,
  muteDisabled = false,
  style,
}) => {
  const isUpDisabled = disabled || volDisabled;
  const isDownDisabled = disabled || volDisabled;
  const isMuteDisabled = disabled || muteDisabled;

  return (
    <View style={[styles.rockerColumn, style]} testID="volume-rocker">
      <TouchableOpacity
        style={[styles.rockerButton, styles.rockerTop, isUpDisabled && styles.controlDisabled]}
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
    fontSize: 12,
    fontWeight: '700',
    color: '#B6BECE',
  },
  muteLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E07A5F',
  },
  controlDisabled: {
    opacity: 0.45,
  },
});
