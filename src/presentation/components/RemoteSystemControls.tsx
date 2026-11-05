import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme, usePresentationLayout, useRemoteDensity, layoutTokens } from '../theme';

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
  const { fontScale } = usePresentationLayout();
  const density = useRemoteDensity();
  const padding = density?.systemButtonPadding ?? 8;
  const buttonSize = Math.max(density ? layoutTokens.minimumTouchTarget : 62, Math.ceil(32 * fontScale + 2 * padding));
  const tile = { minWidth: buttonSize, minHeight: density ? layoutTokens.minimumTouchTarget : buttonSize, padding };
  const compactTile = density && { borderRadius: density.tileRadius, borderWidth: density.borderWidth };
  return (
    <View style={[styles.topRowControls, density && { marginBottom: density.sectionGap }]}>
      {/* Power Button */}
      <TouchableOpacity
        style={[
          styles.powerButton,
          density && [tile, compactTile],
          !isConnected && hasMacAddress && styles.powerButtonWake,
          isWaking && styles.controlDisabled,
        ]}
        accessibilityState={{ disabled: isWaking, busy: isWaking }}
        disabled={isWaking}
        onPress={onPowerPress}
        testID="btn-power"
        accessibilityLabel={isConnected ? 'Power Off' : 'Power On (Wake-on-LAN)'}
        accessibilityRole="button"
      >
        <View style={styles.powerSymbol} accessible={false} importantForAccessibility="no-hide-descendants">
          <View style={[styles.powerRing, !isConnected && hasMacAddress && styles.powerRingWake]} />
          <View style={[styles.powerGap, !isConnected && hasMacAddress && styles.powerGapWake]} />
          <View style={[styles.powerStem, !isConnected && hasMacAddress && styles.powerStemWake]} />
        </View>
      </TouchableOpacity>

      {/* Home Button */}
      <TouchableOpacity
        style={[styles.systemButton, tile, compactTile, !isConnected && styles.controlDisabled]}
        accessibilityState={{ disabled: !isConnected }}
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
        style={[styles.systemButton, tile, compactTile, !isConnected && styles.controlDisabled]}
        accessibilityState={{ disabled: !isConnected }}
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
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  powerButton: {
    minWidth: 62,
    minHeight: 62,
    padding: 8,
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
  powerSymbol: { width: 26, height: 26 },
  powerRing: { position: 'absolute', top: 4, left: 3, width: 20, height: 20, borderRadius: 10, borderWidth: 2.5, borderColor: theme.colors.error },
  powerGap: { position: 'absolute', top: 1, left: 8, width: 10, height: 8, backgroundColor: '#261418' },
  powerStem: { position: 'absolute', top: 1, left: 12, width: 2.5, height: 12, borderRadius: 2, backgroundColor: theme.colors.error },
  powerRingWake: { borderColor: theme.colors.connected },
  powerGapWake: { backgroundColor: '#102A1E' },
  powerStemWake: { backgroundColor: theme.colors.connected },
  systemButton: {
    minWidth: 62,
    minHeight: 62,
    padding: 8,
    borderRadius: 31,
    backgroundColor: '#1C2232',
    borderWidth: 1.5,
    borderColor: '#2B354C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.controlActionLabel,
    letterSpacing: 0.5,
  },
  controlDisabled: {
    opacity: theme.remoteDisabledOpacity,
  },
});
