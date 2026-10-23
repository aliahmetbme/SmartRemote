import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { theme } from '../theme';

export type RemoteMode = 'buttons' | 'touchpad' | 'motion';

export interface RemoteModeSelectorProps {
  activeMode: RemoteMode;
  onModeChange: (mode: RemoteMode) => void;
  style?: StyleProp<ViewStyle>;
}

export const RemoteModeSelector: React.FC<RemoteModeSelectorProps> = ({
  activeMode,
  onModeChange,
  style,
}) => {
  return (
    <View style={[styles.modeSwitcherRow, style]} testID="remote-mode-selector">
      <TouchableOpacity
        style={[styles.modeTab, activeMode === 'buttons' && styles.modeTabActive]}
        onPress={() => onModeChange('buttons')}
        testID="tab-buttons"
        accessibilityRole="button"
        accessibilityLabel="Buttons Mode"
      >
        <Text style={[styles.modeTabText, activeMode === 'buttons' && styles.modeTabTextActive]}>
          Buttons
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.modeTab, activeMode === 'touchpad' && styles.modeTabActive]}
        onPress={() => onModeChange('touchpad')}
        testID="tab-touchpad"
        accessibilityRole="button"
        accessibilityLabel="Touchpad Mode"
      >
        <Text style={[styles.modeTabText, activeMode === 'touchpad' && styles.modeTabTextActive]}>
          Touchpad
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.modeTab, activeMode === 'motion' && styles.modeTabActive]}
        onPress={() => onModeChange('motion')}
        testID="tab-motion"
        accessibilityRole="button"
        accessibilityLabel="Motion Mode"
      >
        <Text
          style={[styles.modeTabText, activeMode === 'motion' && styles.modeTabTextActive]}
          numberOfLines={1}
        >
          Motion
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  modeSwitcherRow: {
    flexDirection: 'row',
    backgroundColor: '#131722',
    borderRadius: theme.borderRadius.full,
    padding: 3,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#262F42',
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.full,
  },
  modeTabActive: {
    backgroundColor: '#263045',
    borderWidth: 1,
    borderColor: '#3E4D6E',
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7E879B',
  },
  modeTabTextActive: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
});
