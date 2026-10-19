import React from 'react';
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
} from '../../store/selectors';
import { tvActions } from '../../store/slices/tvSlice';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { useContainer } from '../context/ContainerContext';
import { theme } from '../theme';

export const SettingsScreen: React.FC = () => {
  const container = useContainer();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();

  const savedDevices = useAppSelector(selectSavedDevices);
  const activeDeviceId = useAppSelector(selectSelectedDeviceId);
  const connectionStatus = useAppSelector(selectConnectionStatus);

  const activeDevice = savedDevices.find(d => d.id === activeDeviceId);

  const handleForgetDevice = (deviceId: string, deviceName: string) => {
    Alert.alert(
      'Forget Device',
      `Are you sure you want to forget "${deviceName}"? Stored pairing keys will remain intact unless cleared.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: async () => {
            try {
              await container.deviceRepository.remove(deviceId);
              dispatch(tvActions.deviceForgotten(deviceId));
              if (activeDeviceId === deviceId) {
                await container.useCases.disconnectTV.execute().catch(() => undefined);
              }
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Could not forget device';
              Alert.alert('Error', msg);
            }
          },
        },
      ],
    );
  };

  const handleDisconnect = async () => {
    try {
      await container.useCases.disconnectTV.execute();
    } catch {
      // Disconnect errors handled
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingTop: Math.max(insets.top, 16) }]}
      testID="settings-screen"
    >
      <Text style={styles.screenTitle}>Settings & Diagnostics</Text>

      {/* Active TV Connection Status Card */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>Current Connection</Text>
        {activeDevice ? (
          <View style={styles.infoBlock}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>TV Name:</Text>
              <Text style={styles.infoValue}>{activeDevice.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>IP Address:</Text>
              <Text style={styles.infoValue}>{activeDevice.ipAddress}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Protocol:</Text>
              <Text style={styles.infoValue}>{activeDevice.protocol}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status:</Text>
              <Text style={[styles.infoValue, { color: connectionStatus === TVConnectionState.Connected ? theme.colors.connected : theme.colors.connecting }]}>
                {connectionStatus}
              </Text>
            </View>

            {connectionStatus === TVConnectionState.Connected && (
              <TouchableOpacity
                style={styles.disconnectButton}
                onPress={handleDisconnect}
                testID="settings-disconnect-btn"
              >
                <Text style={styles.disconnectButtonText}>Disconnect Current TV</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <Text style={styles.emptyText}>No TV currently active or connected.</Text>
        )}
      </View>

      {/* Saved Devices Management */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>Saved TV Devices ({savedDevices.length})</Text>
        {savedDevices.length === 0 ? (
          <Text style={styles.emptyText}>No saved TVs. Connect to a TV to save it for quick access.</Text>
        ) : (
          savedDevices.map(device => (
            <View style={styles.savedItemRow} key={device.id} testID={`saved-device-${device.id}`}>
              <View style={styles.savedItemInfo}>
                <Text style={styles.savedItemName}>{device.name}</Text>
                <Text style={styles.savedItemSub}>{device.ipAddress}</Text>
              </View>
              <TouchableOpacity
                style={styles.forgetButton}
                onPress={() => handleForgetDevice(device.id, device.name)}
                testID={`forget-btn-${device.id}`}
              >
                <Text style={styles.forgetText}>Forget</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* Network & Platform Diagnostics */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>Platform & Network Architecture</Text>
        <View style={styles.infoBlock}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Platform:</Text>
            <Text style={styles.infoValue}>{Platform.OS.toUpperCase()}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Storage:</Text>
            <Text style={styles.infoValue}>Keychain (Secure) + AsyncStorage</Text>
          </View>

          <Text style={styles.diagNoticeTitle}>Local Network Privacy & Multicast</Text>
          <Text style={styles.diagNoticeBody}>
            {Platform.OS === 'ios'
              ? 'On iOS 14+, automatic UDP multicast discovery (SSDP) requires the restricted Apple entitlement com.apple.developer.networking.multicast. SmartRemote utilizes manual IP discovery as a 100% reliable fallback without requiring restricted entitlements.'
              : 'Android supports SSDP multicast discovery using Android WifiManager.MulticastLock alongside manual IP direct connection.'}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  infoLabel: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
  },
  infoValue: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
    marginVertical: 4,
  },
  disconnectButton: {
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
  savedItemName: {
    ...theme.typography.subtitle,
    color: theme.colors.textPrimary,
    fontSize: 14,
  },
  savedItemSub: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  forgetButton: {
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
