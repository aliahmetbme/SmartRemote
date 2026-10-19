import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Modal,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector } from '../../store/hooks';
import {
  selectConnectionError,
  selectConnectionStatus,
  selectDiscoveredDevices,
  selectDiscoveryError,
  selectDiscoveryStatus,
  selectSavedDevices,
  selectSelectedDeviceId,
} from '../../store/selectors';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { TVDevice } from '../../domain/entities/TVDevice';
import { UNKNOWN_CAPABILITIES } from '../../domain/entities/TVCapabilities';
import { PairingStatus } from '../../domain/enums/PairingStatus';
import { TVBrand } from '../../domain/enums/TVBrand';
import { TVPlatform } from '../../domain/enums/TVPlatform';
import { TVProtocol } from '../../domain/enums/TVProtocol';
import { isLocalIPv4Address } from '../../infrastructure/discovery/ssdp/SSDPParser';
import { formatIpAddress } from '../utils/ipFormatter';
import { tvActions } from '../../store/slices/tvSlice';
import { useContainer } from '../context/ContainerContext';
import { theme } from '../theme';

export const TVDiscoveryScreen: React.FC = () => {
  const container = useContainer();
  const insets = useSafeAreaInsets();

  const discoveryStatus = useAppSelector(selectDiscoveryStatus);
  const discoveryError = useAppSelector(selectDiscoveryError);
  const discoveredDevices = useAppSelector(selectDiscoveredDevices);
  const savedDevices = useAppSelector(selectSavedDevices);
  const connectionStatus = useAppSelector(selectConnectionStatus);
  const connectionError = useAppSelector(selectConnectionError);
  const activeDeviceId = useAppSelector(selectSelectedDeviceId);

  const [manualIp, setManualIp] = useState('');
  const [ipError, setIpError] = useState<string | null>(null);
  const [isProbingIp, setIsProbingIp] = useState(false);

  const isScanning = discoveryStatus === 'scanning';
  const isConnecting = connectionStatus === TVConnectionState.Connecting;
  const isPairing = connectionStatus === TVConnectionState.Pairing;

  const handleScanToggle = () => {
    if (isScanning) {
      container.discoveryManager.cancelDiscovery();
    } else {
      container.discoveryManager.startDiscovery({ timeoutMs: 5000 }).catch(() => {
        // Discovery failures dispatched to Redux and shown in discoveryErrorBanner
      });
    }
  };

  const handleConnectDevice = async (device: TVDevice) => {
    try {
      await container.useCases.connectTV.execute(device);
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : 'Failed to connect to TV';
      if (
        msg.toLowerCase().includes('local network') ||
        msg.toLowerCase().includes('prohibited') ||
        msg.includes('1009')
      ) {
        msg =
          'Local network access is prohibited. Please open iOS Settings > Privacy & Security > Local Network and ensure SmartRemote is enabled.';
      }
      Alert.alert('Connection Failed', msg);
    }
  };

  const handleDisconnect = async () => {
    try {
      await container.useCases.disconnectTV.execute();
    } catch {
      // Disconnect errors handled
    }
  };

  const handleManualIpChange = (text: string) => {
    const formatted = formatIpAddress(text, manualIp);
    setManualIp(formatted);

    const trimmed = formatted.trim();
    if (!trimmed) {
      setIpError(null);
      return;
    }

    // Check if any octet has a number > 255
    const parts = trimmed.split('.');
    const hasInvalidOctet = parts.some(p => /^\d+$/.test(p) && parseInt(p, 10) > 255);
    if (hasInvalidOctet) {
      setIpError('Each octet must be between 0 and 255');
      return;
    }

    // If it looks like a complete IP (4 parts with content), validate full local IPv4
    if (parts.length === 4 && parts.every(p => p.length > 0)) {
      if (!isLocalIPv4Address(trimmed)) {
        setIpError('Enter a valid local IPv4 address (e.g. 192.168.1.50)');
      } else {
        setIpError(null);
      }
    } else {
      // Still typing
      if (/[^0-9.]/.test(trimmed)) {
        setIpError('Enter a valid local IPv4 address (e.g. 192.168.1.50)');
      } else {
        setIpError(null);
      }
    }
  };

  const handleManualConnect = async () => {
    const trimmed = manualIp.trim();
    if (!isLocalIPv4Address(trimmed)) {
      setIpError('Invalid IP address. Must be a private IPv4 (e.g. 192.168.1.50)');
      return;
    }

    setIsProbingIp(true);
    setIpError(null);

    try {
      // First attempt to probe the endpoint for fast identity/reachability verification
      let device: TVDevice;
      try {
        device = await container.useCases.probeManualIP.execute(trimmed, { timeoutMs: 4000 });
      } catch {
        // If quick probe times out or is rejected (common on modern webOS without SSAP registration),
        // fallback to candidate device so WebSocket pairing can still be attempted directly
        device = {
          id: `manual-lg-${trimmed}`,
          name: `LG webOS TV (${trimmed})`,
          brand: TVBrand.LG,
          ipAddress: trimmed,
          platform: TVPlatform.WebOS,
          protocol: TVProtocol.LGWebOSSSAP,
          capabilities: UNKNOWN_CAPABILITIES,
          pairingStatus: PairingStatus.Unpaired,
        };
      }
      await container.useCases.connectTV.execute(device);
      setManualIp('');
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : 'Could not reach or pair with TV at this IP';
      if (
        msg.toLowerCase().includes('local network') ||
        msg.toLowerCase().includes('prohibited') ||
        msg.includes('1009')
      ) {
        msg =
          'Local network access is prohibited. Please open iOS Settings > Privacy & Security > Local Network and ensure SmartRemote is enabled.';
      }
      setIpError(msg);
      Alert.alert('Connection Failed', msg);
    } finally {
      setIsProbingIp(false);
    }
  };

  const renderDeviceItem = (device: TVDevice, isSaved: boolean) => {
    const isCurrentActive = activeDeviceId === device.id && connectionStatus === TVConnectionState.Connected;
    const isPending = activeDeviceId === device.id && (isConnecting || isPairing);

    return (
      <View style={styles.deviceCard} key={device.id} testID={`device-item-${device.id}`}>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName} numberOfLines={1}>
            {device.name}
          </Text>
          <Text style={styles.deviceIp}>
            {device.ipAddress} {device.model ? `• ${device.model}` : ''}
          </Text>
        </View>

        {isCurrentActive ? (
          <TouchableOpacity
            style={[styles.actionButton, styles.disconnectButton]}
            onPress={handleDisconnect}
            testID={`disconnect-btn-${device.id}`}
          >
            <Text style={styles.actionButtonText}>Disconnect</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionButton, styles.connectButton, isPending && styles.buttonDisabled]}
            disabled={isPending}
            onPress={() => handleConnectDevice(device)}
            testID={`connect-btn-${device.id}`}
          >
            {isPending ? (
              <ActivityIndicator size="small" color={theme.colors.textPrimary} />
            ) : (
              <Text style={styles.actionButtonText}>{isSaved ? 'Reconnect' : 'Connect'}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]} testID="discovery-screen">
      {/* Header Actions */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>TV Discovery</Text>
        <TouchableOpacity
          style={[styles.scanButton, isScanning && styles.scanningButton]}
          onPress={handleScanToggle}
          testID="scan-button"
          accessibilityLabel={isScanning ? 'Scanning for TVs' : 'Scan for nearby TVs'}
          accessibilityRole="button"
        >
          {isScanning ? (
            <View style={styles.row}>
              <ActivityIndicator size="small" color={theme.colors.textPrimary} style={styles.scanSpinner} />
              <Text style={styles.scanButtonText}>Scanning...</Text>
            </View>
          ) : (
            <Text style={styles.scanButtonText}>Scan for TVs</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* iOS Multicast Notice */}
      {Platform.OS === 'ios' && (
        <View style={styles.iosNoticeCard} testID="ios-multicast-notice">
          <Text style={styles.iosNoticeTitle}>iOS Network Discovery</Text>
          <Text style={styles.iosNoticeBody}>
            Automatic SSDP multicast on iOS requires Apple's restricted multicast entitlement. If your TV is not detected automatically, enter its IP address below.
          </Text>
        </View>
      )}

      {/* Manual IP Section (Prominent on iOS) */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>Connect via IP Address</Text>
          {Platform.OS === 'ios' && (
            <View style={styles.recommendedBadge}>
              <Text style={styles.recommendedBadgeText}>Recommended</Text>
            </View>
          )}
        </View>
        <Text style={styles.sectionSubtitle}>
          {Platform.OS === 'ios'
            ? 'Direct WebSocket connection and pairing for LG Smart TVs'
            : 'Enter TV IP address directly (e.g. 192.168.1.50)'}
        </Text>
        <View style={styles.manualIpRow}>
          <TextInput
            style={[styles.ipInput, ipError ? styles.ipInputError : null]}
            placeholder="192.168.1.50"
            placeholderTextColor={theme.colors.textMuted}
            value={manualIp}
            onChangeText={handleManualIpChange}
            keyboardType="decimal-pad"
            autoCapitalize="none"
            autoCorrect={false}
            testID="manual-ip-input"
          />
          <TouchableOpacity
            style={[
              styles.manualConnectButton,
              (!manualIp.trim() || !!ipError || isProbingIp) && styles.buttonDisabled,
            ]}
            disabled={!manualIp.trim() || !!ipError || isProbingIp}
            onPress={handleManualConnect}
            testID="manual-ip-connect-btn"
          >
            {isProbingIp ? (
              <ActivityIndicator size="small" color={theme.colors.textPrimary} />
            ) : (
              <Text style={styles.manualConnectButtonText}>Connect</Text>
            )}
          </TouchableOpacity>
        </View>
        {ipError ? <Text style={styles.errorText}>{ipError}</Text> : null}
      </View>

      {/* Discovery Error Banner */}
      {discoveryError ? (
        <View style={styles.discoveryErrorBanner} testID="discovery-error-banner">
          <View style={styles.errorHeaderRow}>
            <Text style={styles.discoveryErrorTitle}>
              {discoveryError.code === 'unsupported_transport'
                ? 'Automatic Discovery Unavailable'
                : discoveryError.code === 'permission_denied'
                ? 'Local Network Access Required'
                : 'Discovery Error'}
            </Text>
            <TouchableOpacity
              onPress={() => container.store.dispatch(tvActions.discoveryErrorDismissed())}
              testID="dismiss-discovery-error-btn"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.dismissErrorText}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.discoveryErrorMessage}>{discoveryError.message}</Text>
          {discoveryError.code === 'unsupported_transport' && (
            <Text style={styles.discoveryErrorHint}>
              💡 Use the "Connect via IP Address" form above to pair with your LG webOS TV directly.
            </Text>
          )}
          {discoveryError.code === 'permission_denied' && (
            <Text style={styles.discoveryErrorHint}>
              💡 Open iOS Settings &gt; Privacy &amp; Security &gt; Local Network and enable SmartRemote.
            </Text>
          )}
        </View>
      ) : null}

      {/* Connection Error Banner */}
      {connectionError ? (
        <View style={styles.errorBanner} testID="connection-error-banner">
          <Text style={styles.errorBannerText}>{connectionError.message}</Text>
        </View>
      ) : null}

      {/* Discovered / Saved Device Lists */}
      <FlatList
        data={discoveredDevices}
        keyExtractor={item => item.id}
        renderItem={({ item }) => renderDeviceItem(item, false)}
        ListHeaderComponent={
          <>
            {savedDevices.length > 0 && (
              <View style={styles.listSection}>
                <Text style={styles.listSectionTitle}>Saved TVs</Text>
                {savedDevices.map(device => renderDeviceItem(device, true))}
              </View>
            )}
            <Text style={styles.listSectionTitle}>Discovered TVs</Text>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer} testID="discovery-empty">
            <Text style={styles.emptyText}>
              {isScanning
                ? 'Searching local Wi-Fi network for LG Smart TVs...'
                : discoveryStatus === 'failed'
                ? 'Automatic SSDP discovery could not complete. Use the manual IP connection form above to connect directly.'
                : Platform.OS === 'ios'
                ? 'No TVs discovered via multicast. On iOS, automatic SSDP is restricted without Apple entitlements. Please connect using your TV IP address above.'
                : 'No TVs discovered yet. Tap "Scan for TVs" or connect via IP address above.'}
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />

      {/* Pairing Instructions Modal */}
      <Modal visible={isPairing} transparent animationType="fade" testID="pairing-modal">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color={theme.colors.pairing} style={styles.modalSpinner} />
            <Text style={styles.modalTitle}>Pairing in Progress</Text>
            <Text style={styles.modalBody}>
              Please check your LG Smart TV screen. Select "Accept" or "Allow" using your physical TV remote to approve this connection.
            </Text>
            <TouchableOpacity style={styles.modalCancelButton} onPress={handleDisconnect} testID="pairing-cancel-btn">
              <Text style={styles.modalCancelText}>Cancel Pairing</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  headerTitle: {
    ...theme.typography.title,
    color: theme.colors.textPrimary,
    fontSize: 22,
  },
  scanButton: {
    backgroundColor: theme.colors.surfaceHighlight,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.borderActive,
  },
  scanningButton: {
    borderColor: theme.colors.secondary,
  },
  scanButtonText: {
    ...theme.typography.caption,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iosNoticeCard: {
    backgroundColor: 'rgba(255, 179, 0, 0.08)',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.connecting,
    borderWidth: 1,
    borderColor: 'rgba(255, 179, 0, 0.3)',
    marginBottom: theme.spacing.md,
  },
  iosNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFB300',
    marginBottom: 4,
  },
  iosNoticeBody: {
    fontSize: 12,
    color: '#D4D8E2',
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  recommendedBadge: {
    backgroundColor: '#1E2D4A',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: '#3D5A80',
  },
  recommendedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64B5F6',
    textTransform: 'uppercase',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.sm,
  },
  sectionHeader: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: 0,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  discoveryErrorBanner: {
    backgroundColor: '#261418',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: '#5C1D24',
    marginBottom: theme.spacing.md,
  },
  errorHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  discoveryErrorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF6B6B',
  },
  dismissErrorText: {
    fontSize: 14,
    color: '#FF9E9E',
    fontWeight: 'bold',
    paddingHorizontal: 4,
  },
  discoveryErrorMessage: {
    fontSize: 12,
    color: '#E8C5C8',
    lineHeight: 18,
    marginBottom: 6,
  },
  discoveryErrorHint: {
    fontSize: 12,
    color: '#FFD166',
    lineHeight: 17,
  },
  manualIpRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ipInput: {
    flex: 1,
    backgroundColor: '#181C26',
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: '#2A3142',
    marginRight: theme.spacing.sm,
    fontSize: 15,
  },
  ipInputError: {
    borderColor: theme.colors.error,
  },
  manualConnectButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualConnectButtonText: {
    ...theme.typography.caption,
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.error,
    marginTop: 6,
  },
  errorBanner: {
    backgroundColor: 'rgba(255, 82, 82, 0.15)',
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.error,
    marginBottom: theme.spacing.sm,
  },
  errorBannerText: {
    fontSize: 12,
    color: theme.colors.error,
  },
  listSection: {
    marginBottom: theme.spacing.md,
  },
  listSectionTitle: {
    ...theme.typography.subtitle,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    fontSize: 14,
    textTransform: 'uppercase',
  },
  listContent: {
    paddingBottom: theme.spacing.xl,
  },
  deviceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  deviceInfo: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  deviceName: {
    ...theme.typography.subtitle,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  deviceIp: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  actionButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    minWidth: 80,
    alignItems: 'center',
  },
  connectButton: {
    backgroundColor: theme.colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
  },
  disconnectButton: {
    backgroundColor: 'rgba(255, 82, 82, 0.2)',
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  actionButtonText: {
    ...theme.typography.caption,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  emptyContainer: {
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.pairing,
  },
  scanSpinner: {
    marginRight: 6,
  },
  modalSpinner: {
    marginBottom: theme.spacing.md,
  },
  modalTitle: {
    ...theme.typography.title,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  modalBody: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: theme.spacing.lg,
  },
  modalCancelButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.borderActive,
  },
  modalCancelText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
});
