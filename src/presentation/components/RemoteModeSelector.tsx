import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { theme, usePresentationLayout, useRemoteDensity } from '../theme';

export type RemoteMode = 'buttons' | 'pointer';
export interface RemoteModeSelectorProps {
  stacked?: boolean;
  activeMode: RemoteMode;
  onModeChange: (mode: RemoteMode) => void;
  style?: StyleProp<ViewStyle>;
}
export const RemoteModeSelector: React.FC<RemoteModeSelectorProps> = ({
  stacked, activeMode, onModeChange, style,
}) => {
  const layout = usePresentationLayout();
  const density = useRemoteDensity();
  const modes: { mode: RemoteMode; label: string; id: string }[] = [
    { mode: 'buttons', label: 'Buttons', id: 'buttons' },
    { mode: 'pointer', label: 'Pointer', id: 'pointer' },
  ];
  return (
    <View style={[styles.modeSwitcherRow, density && { padding: density.segmentPadding, marginBottom: density.sectionGap, borderRadius: density.modeRadius }, (stacked ?? layout.modeStacked) && styles.stacked, style]} testID="remote-mode-selector">
      {modes.map(({ mode, label, id }) => {
        const selected = activeMode === mode;
        return <TouchableOpacity key={id} style={[styles.modeTab, density && { paddingVertical: density.segmentPadding, borderRadius: density.smallControlRadius }, selected && styles.modeTabActive]}
          onPress={() => onModeChange(mode)} testID={`tab-${id}`}
          accessibilityRole="button" accessibilityLabel={`${label} Mode`}
          accessibilityState={{ selected }}>
          <Text style={[styles.modeTabText, selected && styles.modeTabTextActive]}>{label}</Text>
        </TouchableOpacity>;
      })}
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
