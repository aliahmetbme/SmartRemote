import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { theme, usePresentationLayout, useRemoteDensity } from '../theme';

export interface TVConnectionHeaderProps {
  stacked?: boolean;
  tvDisplayName: string;
  connectionStatus: TVConnectionState;
  onNavigateToDiscovery?: () => void;
}

/**
 * Presentational header displaying the connected TV name,
 * connection status badge (dot / spinner), and Switch TV action.
 */
export const TVConnectionHeader: React.FC<TVConnectionHeaderProps> = ({
  stacked,
  tvDisplayName,
  connectionStatus,
  onNavigateToDiscovery,
}) => {
  const friendlyName = tvDisplayName.replace(/\s*\(?\b(?:\d{1,3}\.){3}\d{1,3}\b\)?/g, '').trim() || 'LG TV';
  const layout = usePresentationLayout();
  const density = useRemoteDensity();
  const renderStatusBadge = () => {
    let text = 'Disconnected';
    let color: string = theme.colors.textMuted;
    let showSpinner = false;

    switch (connectionStatus) {
      case TVConnectionState.Connected:
        text = 'Connected';
        color = theme.colors.connected;
        break;
      case TVConnectionState.Connecting:
        text = 'Connecting...';
        color = theme.colors.connecting;
        showSpinner = true;
        break;
      case TVConnectionState.Pairing:
        text = 'Pairing with TV...';
        color = theme.colors.pairingText;
        showSpinner = true;
        break;
      case TVConnectionState.Reconnecting:
        text = 'Reconnecting...';
        color = theme.colors.connecting;
        showSpinner = true;
        break;
      case TVConnectionState.Error:
      case TVConnectionState.Disconnected:
      default:
        text = connectionStatus === TVConnectionState.Error ? "Can't connect" : 'Disconnected';
        color = theme.colors.error;
        break;
    }

    return (
      <View style={[styles.statusBadge, { borderColor: color }, density && { paddingVertical: density.statusPadding, borderRadius: density.smallControlRadius }]} testID="connection-status-badge">
        {showSpinner ? (
          <ActivityIndicator size="small" color={color} style={styles.badgeSpinner} />
        ) : (
          <View style={[styles.statusDot, { backgroundColor: color }]} />
        )}
        <Text style={[styles.statusText, { color }]}>{text}</Text>
      </View>
    );
  };

  return (
    <View style={[styles.topBar, density && { marginBottom: density.sectionGap }, (stacked ?? layout.headerStacked) && styles.stacked]} testID="remote-header">
      <View style={styles.tvInfoCol}>
        <Text style={styles.tvName} numberOfLines={1} ellipsizeMode="tail" accessibilityLabel={friendlyName} testID="tv-header-title">
          {friendlyName}
        </Text>
        {renderStatusBadge()}
      </View>

      {onNavigateToDiscovery && (
        <TouchableOpacity
          style={[styles.switchTvButton, density && { paddingVertical: density.displayPadding }]}
          onPress={onNavigateToDiscovery}
          testID="switch-tv-btn"
          accessibilityLabel="Switch TV"
          accessibilityRole="button"
        >
          <Text style={styles.switchTvText}>Switch TV</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  stacked: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  tvInfoCol: {
    flex: 1,
    minWidth: 0,
    marginRight: theme.spacing.sm,
  },
  tvName: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    backgroundColor: '#121622',
  },
  badgeSpinner: {
    marginRight: 5,
    transform: [{ scale: 0.7 }],
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
    letterSpacing: 0.4,
  },
  switchTvButton: {
    paddingHorizontal: 12,
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: '#1B2130',
    borderWidth: 1,
    borderColor: '#2B354C',
  },
  switchTvText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.secondary,
  },
});
