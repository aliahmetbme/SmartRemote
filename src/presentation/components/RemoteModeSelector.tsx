import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { theme, usePresentationLayout, useRemoteDensity } from '../theme';

export type RemoteMode = 'buttons' | 'touchpad' | 'motion';

export interface RemoteModeSelectorProps {
  stacked?: boolean;
  activeMode: RemoteMode;
  onModeChange: (mode: RemoteMode) => void;
  style?: StyleProp<ViewStyle>;
  motionAvailable?: boolean;
}

export const RemoteModeSelector: React.FC<RemoteModeSelectorProps> = ({
  stacked,
  activeMode,
  onModeChange,
  style,
  motionAvailable = true,
}) => {
  const layout = usePresentationLayout();
  const density = useRemoteDensity();
  const segment = density && { paddingVertical: density.segmentPadding, borderRadius: density.smallControlRadius };
  const motionSelected = motionAvailable && activeMode === 'motion';
  return (
    <View style={[styles.modeSwitcherRow, density && { padding: density.segmentPadding, marginBottom: density.sectionGap, borderRadius: density.modeRadius }, (stacked ?? layout.modeStacked) && styles.stacked, style]} testID="remote-mode-selector">
      <TouchableOpacity
        style={[styles.modeTab, segment, activeMode === 'buttons' && styles.modeTabActive]}
        onPress={() => onModeChange('buttons')}
        testID="tab-buttons"
        accessibilityRole="button"
        accessibilityLabel="Buttons Mode"
        accessibilityState={{ selected: activeMode === 'buttons' }}
      >
        <Text style={[styles.modeTabText, activeMode === 'buttons' && styles.modeTabTextActive]}>
          Buttons
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.modeTab, segment, activeMode === 'touchpad' && styles.modeTabActive]}
        onPress={() => onModeChange('touchpad')}
        testID="tab-touchpad"
        accessibilityRole="button"
        accessibilityLabel="Touchpad Mode"
        accessibilityState={{ selected: activeMode === 'touchpad' }}
      >
        <Text style={[styles.modeTabText, activeMode === 'touchpad' && styles.modeTabTextActive]}>
          Touchpad
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.modeTab, segment, motionSelected && styles.modeTabActive]}
        disabled={!motionAvailable}
        onPress={() => onModeChange('motion')}
        testID="tab-motion"
        accessibilityRole="button"
        accessibilityLabel={motionAvailable ? 'Motion Mode' : 'Motion unavailable on Android'}
        accessibilityState={{ selected: motionSelected, disabled: !motionAvailable }}
      >
        <Text
          style={[styles.modeTabText, motionSelected && styles.modeTabTextActive, !motionAvailable && styles.unavailable]}
        >
          Motion
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  stacked: { flexDirection: 'column', borderRadius: 16 },
  unavailable: { color: theme.colors.modeUnavailable },
  modeSwitcherRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.modeTrack,
    borderRadius: theme.borderRadius.full,
    padding: 3,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.modeTrackEdge,
  },
  modeTab: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.full,
  },
  modeTabActive: {
    backgroundColor: theme.colors.modeSelected,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modeTabText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  modeTabTextActive: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
});
