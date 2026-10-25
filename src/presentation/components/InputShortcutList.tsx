import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme';

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
  return (
    <View style={styles.shortcutsSection} testID="input-switching-section">
      <Text style={styles.sectionTitle}>Inputs</Text>
      <View style={styles.chipsRow}>
        {inputs.map(inputId => (
          <TouchableOpacity
            key={inputId}
            style={[styles.inputChip, !isConnected && styles.controlDisabled]}
            onPress={() => onSelectInput(inputId)}
            testID={`btn-input-${inputId}`}
            accessibilityLabel={`Switch to ${inputId}`}
            accessibilityRole="button"
          >
            <Text style={styles.chipText}>{inputId.replace('_', ' ')}</Text>
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
    color: '#8A9BB5',
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  chipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inputChip: {
    flex: 1,
    backgroundColor: '#1E2536',
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
    marginHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2F3A52',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D4DAE8',
    letterSpacing: 0.6,
  },
  controlDisabled: {
    opacity: 0.45,
  },
});
