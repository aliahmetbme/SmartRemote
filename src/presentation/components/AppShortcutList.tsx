import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { theme } from '../theme';

export interface AppShortcut {
  id: string;
  label: string;
}

export const DEFAULT_APP_SHORTCUTS: AppShortcut[] = [
  { id: 'netflix', label: 'NETFLIX' },
  { id: 'youtube', label: 'YOUTUBE' },
  { id: 'amazon', label: 'PRIME VIDEO' },
];

export interface AppShortcutListProps {
  shortcuts?: AppShortcut[];
  launchingAppId: string | null;
  isConnected: boolean;
  onLaunchApp: (appId: string) => void;
}

/**
 * Presentational component rendering the installed application launch shortcuts.
 */
export const AppShortcutList: React.FC<AppShortcutListProps> = ({
  shortcuts = DEFAULT_APP_SHORTCUTS,
  launchingAppId,
  isConnected,
  onLaunchApp,
}) => {
  return (
    <View style={styles.shortcutsSection} testID="app-shortcuts-section">
      <Text style={styles.sectionTitle}>Apps</Text>
      <View style={styles.chipsRow}>
        {shortcuts.map(app => (
          <TouchableOpacity
            key={app.id}
            style={[styles.appChip, !isConnected && styles.controlDisabled]}
            disabled={launchingAppId !== null}
            onPress={() => onLaunchApp(app.id)}
            testID={`btn-app-${app.id}`}
            accessibilityLabel={`Launch ${app.id}`}
            accessibilityRole="button"
          >
            {launchingAppId === app.id ? (
              <ActivityIndicator size="small" color="#D4DAE8" />
            ) : (
              <Text style={styles.chipText}>{app.label}</Text>
            )}
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
  appChip: {
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
