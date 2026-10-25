import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { theme } from '../theme';

export interface TVConnectionHeaderProps {
  tvDisplayName: string;
  connectionStatus: TVConnectionState;
  onNavigateToDiscovery?: () => void;
}

/**
 * Presentational header displaying the connected TV name,
 * connection status badge (dot / spinner), and Switch TV action.
 */
export const TVConnectionHeader: React.FC<TVConnectionHeaderProps> = ({
  tvDisplayName,
  connectionStatus,
  onNavigateToDiscovery,
}) => {
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
        color = theme.colors.pairing;
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
        text = 'Offline';
        color = theme.colors.error;
        break;
    }

    return (
      <View style={[styles.statusBadge, { borderColor: color }]} testID="connection-status-badge">
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
    <View style={styles.topBar} testID="remote-header">
      <View style={styles.tvInfoCol}>
        <Text style={styles.tvName} numberOfLines={1} testID="tv-header-title">
          {tvDisplayName}
        </Text>
        {renderStatusBadge()}
      </View>

      {onNavigateToDiscovery && (
        <TouchableOpacity
          style={styles.switchTvButton}
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  tvInfoCol: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  tvName: {
    fontSize: 20,
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
    letterSpacing: 0.4,
  },
  switchTvButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
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
