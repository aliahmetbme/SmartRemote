import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectConnectionStatus,
  selectSavedDevices,
  selectSelectedDeviceId,
  selectSelectedDevice,
} from '../../store/selectors';
import { classifyConnectionFailure } from '../../domain/entities/ConnectionDiagnostic';
import { connectionGuidance } from '../connectionGuidance';
import { MotionSettings } from '../components/MotionSettings';
import { version } from '../../../package.json';
import { tvActions } from '../../store/slices/tvSlice';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { isValidMacAddress } from '../../domain/utils/macValidator';
import { useContainer } from '../context/ContainerContext';
import { theme, usePresentationLayout, platformPresentation } from '../theme';

export const SettingsScreen: React.FC<{
  onNavigateToDeveloper?: () => void;
  onNavigateToWakeSetup?: (deviceId: string) => void;
}> = ({ onNavigateToDeveloper, onNavigateToWakeSetup }) => {
  const container = useContainer();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const layout = usePresentationLayout(insets.left + insets.right);

  const savedDevices = useAppSelector(selectSavedDevices);
  const activeDeviceId = useAppSelector(selectSelectedDeviceId);
  const connectionStatus = useAppSelector(selectConnectionStatus);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const selectedDevice = useAppSelector(selectSelectedDevice);
  const activeDevice = selectedDevice;

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(
      `[SmartRemote][SettingsScreen] Active TV='${
        activeDevice?.name ?? 'none'
      }', status='${connectionStatus}', savedCount=${savedDevices.length}`,
    );
  }

  // Hydrate saved devices from authoritative hydration use case on mount if store is empty
  useEffect(() => {
    let isMounted = true;
    if (savedDevices.length === 0) {
      setIsLoading(true);
      container.useCases.hydrateDevices
        .execute()
        .then(({ savedDevices: devices, selectedDeviceId }) => {
          if (isMounted) {
            dispatch(tvActions.savedDevicesLoaded(devices));
            if (selectedDeviceId && !activeDeviceId) {
              dispatch(tvActions.deviceSelected(selectedDeviceId));
            }
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [
    activeDeviceId,
    container.useCases.hydrateDevices,
    dispatch,
    savedDevices.length,
  ]);

  const handleForgetDevice = (deviceId: string, deviceName: string) => {
    Alert.alert(
      'Forget Device',
      `Are you sure you want to forget "${deviceName}"? Stored pairing keys will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: async () => {
            try {
              await container.useCases.forgetTV.execute(deviceId);
              dispatch(tvActions.deviceForgotten(deviceId));
            } catch (err: unknown) {
              const msg =
                err instanceof Error ? err.message : 'Could not forget device';
              Alert.alert('Error', msg);
            }
          },
        },
      ],
    );
  };

  const handleConnectDevice = async (device: (typeof savedDevices)[0]) => {
    try {
      await container.useCases.connectTV.execute(device);
    } catch (err: unknown) {
      if ((err as { code?: unknown })?.code === 'cancelled') return;
      const guidance = connectionGuidance(
        classifyConnectionFailure(err).category,
      );
      Alert.alert(guidance.title, guidance.message);
    }
  };

  const handleDisconnect = async () => {
    try {
      await container.useCases.disconnectTV.execute();
    } catch {
      // Disconnect errors handled
    }
  };

  const handleReconnect = async () => {
    try {
      await container.useCases.reconnectTV.execute();
    } catch (err: unknown) {
      if ((err as { code?: unknown })?.code === 'cancelled') return;
      const guidance = connectionGuidance(
        classifyConnectionFailure(err).category,
      );
      Alert.alert(guidance.title, guidance.message);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={platformPresentation.keyboardDismissMode}
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.contentContainer,
          {
            paddingTop: Math.max(0, 16 - insets.top),
            paddingLeft: layout.pagePadding + insets.left,
            paddingRight: layout.pagePadding + insets.right,
          },
        ]}
        testID="settings-screen"
      >
        <Text style={styles.screenTitle}>Settings</Text>

        {/* Active TV Connection Status Card */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Selected TV</Text>
          {activeDevice ? (
            <View style={styles.infoBlock}>
              <Text style={styles.selectedName}>{activeDevice.name}</Text>
              <Text style={styles.selectedStatus}>
                {connectionStatus === TVConnectionState.Connected
                  ? 'Connected'
                  : connectionStatus === TVConnectionState.Reconnecting
                  ? 'Reconnecting…'
                  : connectionStatus === TVConnectionState.Connecting
                  ? 'Connecting…'
                  : connectionStatus === TVConnectionState.Pairing
                  ? 'Pairing…'
                  : 'Disconnected'}
              </Text>
              {connectionStatus === TVConnectionState.Connected ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.disconnectButton}
                  onPress={handleDisconnect}
                  testID="settings-disconnect-btn"
                >
                  <Text style={styles.disconnectButtonText}>Disconnect</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.reconnectButton}
                  onPress={handleReconnect}
                  testID="settings-reconnect-btn"
                >
                  <Text style={styles.reconnectButtonText}>Reconnect</Text>
                </TouchableOpacity>
              )}
              <View style={styles.wakeSummary}>
                <Text style={styles.infoLabel}>TV Wake</Text>
                <Text style={styles.selectedStatus}>
                  {isValidMacAddress(activeDevice.macAddress)
                    ? 'Configuration saved'
                    : 'Not configured'}
                </Text>
              </View>
              {onNavigateToWakeSetup && (
                <TouchableOpacity
                  style={styles.navigationRow}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isValidMacAddress(activeDevice.macAddress)
                      ? 'Manage wake settings'
                      : 'Set up TV wake'
                  }
                  accessibilityHint="Opens TV Wake Setup for this television"
                  testID="tv-wake-setup-link"
                  onPress={() => onNavigateToWakeSetup(activeDevice.id)}
                >
                  <Text style={styles.navigationLabel}>
                    {isValidMacAddress(activeDevice.macAddress)
                      ? 'Manage wake settings'
                      : 'Set up TV wake'}
                  </Text>
                  <View style={styles.navigationArrowBadge} accessible={false}>
                    <Text style={styles.navigationArrow}>›</Text>
                  </View>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.navigationRow}
                accessibilityRole="button"
                accessibilityState={{ expanded: detailsOpen }}
                accessibilityLabel="TV details"
                testID="tv-details-toggle"
                onPress={() => setDetailsOpen(!detailsOpen)}
              >
                <Text style={styles.navigationLabel}>TV details</Text>
                <View style={styles.navigationArrowBadge} accessible={false}>
                  <Text style={styles.navigationArrow}>{detailsOpen ? '⌃' : '›'}</Text>
                </View>
              </TouchableOpacity>
              {detailsOpen && (
                <View testID="tv-details-section">
                  <View
                    style={[
                      styles.infoRow,
                      layout.stackDetails && styles.infoRowStacked,
                    ]}
                  >
                    <Text style={styles.infoLabel}>IP address</Text>
                    <Text
                      style={[
                        styles.infoValue,
                        layout.stackDetails && styles.infoValueStacked,
                      ]}
                    >
                      {activeDevice.ipAddress}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.forgetButton}
                    accessibilityRole="button"
                    testID={`forget-btn-${activeDevice.id}`}
                    onPress={() =>
                      handleForgetDevice(activeDevice.id, activeDevice.name)
                    }
                  >
                    <Text style={styles.forgetText}>Forget this TV</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              Choose a TV from the TVs tab to get started.
            </Text>
          )}
        </View>

        {/* Saved Devices Management */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>
            {activeDevice ? 'Other saved TVs' : 'Saved TVs'}
          </Text>
          {isLoading ? (
            <Text style={styles.emptyText}>Loading saved devices...</Text>
          ) : savedDevices.length === 0 ? (
            <Text style={styles.emptyText}>
              No saved TVs. Connect to a TV to save it for quick access.
            </Text>
          ) : savedDevices.every(device => device.id === activeDevice?.id) ? (
            <Text style={styles.emptyText}>Your selected TV is saved.</Text>
          ) : (
            savedDevices
              .filter(device => device.id !== activeDevice?.id)
              .map(device => {
                const isDeviceActive = device.id === activeDeviceId;
                const isDeviceConnected =
                  isDeviceActive &&
                  connectionStatus === TVConnectionState.Connected;
                const isDeviceConnecting =
                  isDeviceActive &&
                  (connectionStatus === TVConnectionState.Connecting ||
                    connectionStatus === TVConnectionState.Reconnecting ||
                    connectionStatus === TVConnectionState.Pairing);

                return (
                  <View
                    style={[
                      styles.savedItemRow,
                      layout.stackDetails && styles.savedItemStacked,
                    ]}
                    key={device.id}
                    testID={`saved-device-${device.id}`}
                  >
                    <View style={styles.savedItemInfo}>
                      <View style={styles.savedItemHeaderRow}>
                        <View
                          style={[
                            styles.deviceStatusDot,
                            isDeviceConnected
                              ? styles.statusDotConnected
                              : isDeviceConnecting
                              ? styles.statusDotConnecting
                              : styles.statusDotOffline,
                          ]}
                        />
                        <Text style={styles.savedItemName}>{device.name}</Text>
                      </View>
                      <Text style={styles.savedItemSub}>
                        {isDeviceConnected
                          ? 'Connected'
                          : isDeviceConnecting
                          ? 'Connecting...'
                          : 'Offline'}
                      </Text>
                    </View>

                    <View style={styles.savedItemActions}>
                      {!isDeviceConnected && (
                        <TouchableOpacity
                          accessibilityRole="button"
                          style={styles.selectDeviceButton}
                          onPress={() => handleConnectDevice(device)}
                          testID={`connect-saved-btn-${device.id}`}
                        >
                          <Text style={styles.selectDeviceText}>
                            {isDeviceConnecting ? 'Connecting...' : 'Connect'}
                          </Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        accessibilityRole="button"
                        style={styles.forgetButton}
                        onPress={() =>
                          handleForgetDevice(device.id, device.name)
                        }
                        testID={`forget-btn-${device.id}`}
                      >
                        <Text style={styles.forgetText}>Forget</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
          )}
        </View>

        <View style={styles.card} testID="remote-preferences-section">
          <Text style={styles.cardHeader}>Remote Preferences</Text>
          <MotionSettings section="preferences" />
        </View>
        {onNavigateToDeveloper && (
          <TouchableOpacity
            style={styles.navigationRow}
            accessibilityRole="button"
            accessibilityLabel="Developer Settings"
            accessibilityHint="Opens advanced pointer and connection settings"
            testID="developer-settings-toggle"
            onPress={onNavigateToDeveloper}
          >
            <Text style={styles.navigationLabel}>Developer Settings</Text>
            <View style={styles.navigationArrowBadge} accessible={false}>
              <Text style={styles.navigationArrow}>›</Text>
            </View>
          </TouchableOpacity>
        )}
        <View style={styles.aboutRow}>
          <Text style={styles.infoLabel}>About SmartRemote</Text>
          <Text style={styles.aboutVersion}>{version}</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingVertical: 8,
  },
  aboutVersion: { color: theme.colors.textSecondary, fontSize: 14 },
  selectedName: {
    ...theme.typography.subtitle,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  selectedStatus: { color: theme.colors.textSecondary, fontSize: 14 },
  wakeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  helpButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navigationLabel: {
    flex: 1,
    color: theme.colors.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
  navigationArrowBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 210, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navigationArrow: {
    color: theme.colors.secondary,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '600',
    textAlign: 'center',
  },
  navigationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 56,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(0, 210, 255, 0.22)',
    backgroundColor: 'rgba(0, 210, 255, 0.04)',
    marginTop: 8,
    marginBottom: 8,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  screenTitle: {
    ...theme.typography.title,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardHeader: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  infoBlock: {
    marginTop: 4,
  },
  infoRowStacked: { flexDirection: 'column', gap: 4 },
  infoValueStacked: { textAlign: 'left', flex: undefined },
  savedItemStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 12 },
  buttonRowStacked: { flexDirection: 'column', alignItems: 'stretch' },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  infoLabel: {
    flexShrink: 1,
    minWidth: 0,
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  infoValue: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  infoValueMuted: {
    color: theme.colors.textMuted,
    fontStyle: 'italic',
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
    marginVertical: 4,
  },
  disconnectButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: theme.spacing.md,
    backgroundColor: 'rgba(255, 82, 82, 0.15)',
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.error,
    alignItems: 'center',
  },
  disconnectButtonText: {
    ...theme.typography.caption,
    color: theme.colors.error,
    fontWeight: '700',
  },
  reconnectButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: theme.spacing.md,
    backgroundColor: 'rgba(0, 210, 255, 0.15)',
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
    alignItems: 'center',
  },
  reconnectButtonText: {
    ...theme.typography.caption,
    color: theme.colors.secondary,
    fontWeight: '700',
  },
  wolButtonRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  editMacButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
    flex: 1,
    backgroundColor: '#1C2232',
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: '#2B354C',
    alignItems: 'center',
  },
  editMacButtonText: {
    ...theme.typography.caption,
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
  testWakeButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
    flex: 1,
    backgroundColor: 'rgba(48, 209, 88, 0.15)',
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: '#30D158',
    alignItems: 'center',
  },
  testWakeButtonText: {
    ...theme.typography.caption,
    color: '#30D158',
    fontWeight: '700',
  },
  controlDisabled: {
    opacity: 0.5,
  },
  macEditContainer: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.sm,
    backgroundColor: '#0F131D',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: '#2B354C',
  },
  macInputLabel: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    marginBottom: 6,
  },
  macTextInput: {
    minHeight: 48,
    backgroundColor: '#1C2232',
    color: theme.colors.textPrimary,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: theme.spacing.sm,
  },
  macEditButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  cancelMacButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.sm,
  },
  cancelMacText: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },
  saveMacButton: {
    minHeight: 48,
    justifyContent: 'center',
    backgroundColor: theme.colors.secondary,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.sm,
  },
  saveMacText: {
    ...theme.typography.caption,
    color: '#000',
    fontWeight: '700',
  },
  wolNoticeTitle: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    fontWeight: '700',
    marginTop: theme.spacing.md,
    marginBottom: 4,
  },
  wolNoticeBody: {
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.textMuted,
  },
  savedItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  savedItemInfo: {
    flex: 1,
  },
  savedItemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  statusDotConnected: {
    backgroundColor: theme.colors.connected,
  },
  statusDotConnecting: {
    backgroundColor: theme.colors.connecting,
  },
  statusDotOffline: {
    backgroundColor: theme.colors.disconnected,
  },
  savedItemName: {
    flex: 1,
    minWidth: 0,
    ...theme.typography.subtitle,
    color: theme.colors.textPrimary,
    fontSize: 14,
  },
  savedItemSub: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  savedItemActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  selectDeviceButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
  },
  selectDeviceText: {
    fontSize: 11,
    color: theme.colors.secondary,
    fontWeight: '700',
  },
  forgetButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  forgetText: {
    fontSize: 11,
    color: theme.colors.error,
    fontWeight: '600',
  },
  diagNoticeTitle: {
    ...theme.typography.caption,
    fontWeight: '700',
    color: theme.colors.secondary,
    marginTop: theme.spacing.md,
    marginBottom: 4,
  },
  diagNoticeBody: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
});
