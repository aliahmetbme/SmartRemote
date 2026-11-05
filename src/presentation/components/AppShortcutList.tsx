import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { theme, usePresentationLayout, useRemoteDensity } from '../theme';

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
  const layout = usePresentationLayout();
  const density = useRemoteDensity();
  const chipSurface = density && {
    paddingVertical: density.displayPadding,
    paddingHorizontal: density.chipPadding,
    borderRadius: density.tileRadius,
  };
  const getChipWidth = (label: string) => density
    ? Math.max(layout.chipBasis, Math.ceil(label.length * 7 * layout.fontScale + 2 * density.chipPadding))
    : layout.chipBasis;
  return (
    <View style={[styles.shortcutsSection, density && { marginTop: density.sectionGap }]} testID="app-shortcuts-section">
      <Text style={styles.sectionTitle}>Apps</Text>
      <View style={styles.chipsRow}>
        {shortcuts.map(app => (
          <TouchableOpacity
            key={app.id}
            style={[styles.appChip, { flexBasis: getChipWidth(app.label) }, chipSurface, !isConnected && styles.controlDisabled]}
            disabled={launchingAppId !== null}
            onPress={() => onLaunchApp(app.id)}
            testID={`btn-app-${app.id}`}
            accessibilityLabel={`Launch ${app.id}`}
            accessibilityRole="button"
          >
            {launchingAppId === app.id ? (
              <ActivityIndicator size="small" color={theme.colors.controlActionLabel} />
            ) : (
              <Text style={[styles.chipText, density && { letterSpacing: density.chipTracking }]}>{app.label}</Text>
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
  appChip: {
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
