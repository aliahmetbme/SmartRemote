import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme';

export interface RemoteSystemControlsProps {
  isConnected: boolean;
  hasMacAddress: boolean;
  isWaking: boolean;
  onPowerPress: () => void;
  onHomePress: () => void;
  onBackPress: () => void;
}

/**
 * Presentational system controls row: Power button (with WoL standby styling),
 * Home button, and Back button.
 */
export const RemoteSystemControls: React.FC<RemoteSystemControlsProps> = ({
  isConnected,
  hasMacAddress,
  isWaking,
  onPowerPress,
  onHomePress,
  onBackPress,
}) => {
  return (
    <View style={styles.topRowControls}>
      {/* Power Button */}
      <TouchableOpacity
        style={[
          styles.powerButton,
          !isConnected && hasMacAddress && styles.powerButtonWake,
          isWaking && styles.controlDisabled,
        ]}
        disabled={isWaking}
        onPress={onPowerPress}
        testID="btn-power"
        accessibilityLabel={isConnected ? 'Power Off' : 'Power On (Wake-on-LAN)'}
        accessibilityRole="button"
      >
        <Text
          style={[
            styles.powerIcon,
            !isConnected && hasMacAddress && styles.powerIconWake,
          ]}
        >
          ⏻
        </Text>
      </TouchableOpacity>

      {/* Home Button */}
      <TouchableOpacity
        style={[styles.circleButton, !isConnected && styles.controlDisabled]}
        disabled={!isConnected}
        onPress={onHomePress}
        testID="btn-home"
        accessibilityLabel="Home"
        accessibilityRole="button"
      >
        <Text style={styles.buttonLabel}>HOME</Text>
      </TouchableOpacity>

      {/* Back Button */}
      <TouchableOpacity
        style={[styles.circleButton, !isConnected && styles.controlDisabled]}
        disabled={!isConnected}
        onPress={onBackPress}
        testID="btn-back"
        accessibilityLabel="Back"
        accessibilityRole="button"
      >
        <Text style={styles.buttonLabel}>BACK</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  topRowControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 8,
    marginBottom: theme.spacing.lg,
  },
  powerButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#261418',
    borderWidth: 1.5,
    borderColor: '#4A1C23',
    justifyContent: 'center',
    alignItems: 'center',
  },
  powerButtonWake: {
    backgroundColor: '#102A1E',
    borderColor: '#1E5E41',
  },
  powerIcon: {
    fontSize: 24,
    color: theme.colors.error,
    fontWeight: '700',
  },
  powerIconWake: {
    color: theme.colors.connected,
  },
  circleButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#1C2232',
    borderWidth: 1.5,
    borderColor: '#2B354C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D4DAE8',
    letterSpacing: 0.5,
  },
  controlDisabled: {
    opacity: 0.45,
  },
});
