import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme, usePresentationLayout, useRemoteDensity } from '../theme';

export const DEFAULT_INPUT_SHORTCUTS: readonly string[] = ['HDMI_1', 'HDMI_2', 'AV_1'];

export interface InputShortcutListProps {
  inputs?: readonly string[];
  isConnected: boolean;
  onSelectInput: (inputId: string) => void;
}

/**
 * Presentational component rendering TV input / source switching shortcuts.
 */
export const InputShortcutList: React.FC<InputShortcutListProps> = ({
  inputs = DEFAULT_INPUT_SHORTCUTS,
  isConnected,
  onSelectInput,
}) => {
  const layout = usePresentationLayout();
  const density = useRemoteDensity();
  return (
    <View style={[styles.shortcutsSection, density && { marginTop: density.sectionGap }]} testID="input-switching-section">
      <Text style={styles.sectionTitle}>Inputs</Text>
      <View style={styles.chipsRow}>
        {inputs.map(inputId => (
          <TouchableOpacity
            key={inputId}
            style={[styles.inputChip, { flexBasis: layout.chipBasis }, density && { paddingVertical: density.displayPadding, paddingHorizontal: density.chipPadding, borderRadius: density.tileRadius }, !isConnected && styles.controlDisabled]}
            onPress={() => onSelectInput(inputId)}
            testID={`btn-input-${inputId}`}
            accessibilityLabel={`Switch to ${inputId}`}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, density && { letterSpacing: density.chipTracking }]}>{inputId.replace('_', ' ')}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  shortcutsSection: {
    width: '100%',
    marginTop: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.controlSectionLabel,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inputChip: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 48,
    paddingHorizontal: 8,
    backgroundColor: '#1E2536',
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2F3A52',
  },
  chipText: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.controlActionLabel,
    letterSpacing: 0.6,
  },
  controlDisabled: {
    opacity: theme.remoteDisabledOpacity,
  },
});
