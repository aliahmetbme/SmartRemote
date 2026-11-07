import { classifyConnectionFailure } from '../../domain/entities/ConnectionDiagnostic';
import { connectionGuidance } from '../connectionGuidance';
import React, { useState, useEffect } from 'react';
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
  AppState,
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
import { isLocalIPv4Address } from '../../domain/utils/ipValidator';
import { formatIpAddress } from '../utils/ipFormatter';
import { tvActions } from '../../store/slices/tvSlice';
import { useContainer } from '../context/ContainerContext';
import { theme, usePresentationLayout, platformPresentation } from '../theme';

export const TVDiscoveryScreen: React.FC = () => {
  const container = useContainer();
  const insets = useSafeAreaInsets();
  const layout = usePresentationLayout(insets.left + insets.right);

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

  // Hydrate saved devices from authoritative hydration use case on mount if store is empty
  useEffect(() => {
    let isMounted = true;
    if (savedDevices.length === 0) {
      container.useCases.hydrateDevices
        .execute()
        .then(({ savedDevices: devices, selectedDeviceId }) => {
          if (isMounted && devices.length > 0) {
            container.store.dispatch(tvActions.savedDevicesLoaded(devices));
            if (selectedDeviceId && !activeDeviceId) {
              container.store.dispatch(tvActions.deviceSelected(selectedDeviceId));
            }
          }
        })
        .catch(() => undefined);
    }
    return () => {
      isMounted = false;
    };
  }, [activeDeviceId, container.store, container.useCases.hydrateDevices, savedDevices.length]);

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // Non-sensitive dev diagnostics
    console.log(
      `[SmartRemote][DiscoveryScreen] Rendered with ${savedDevices.length} saved TV(s), activeId='${activeDeviceId}', status='${connectionStatus}'`,
    );
  }

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') container.discoveryManager.cancelDiscovery();
    });
    return () => {
      subscription.remove();
      container.discoveryManager.cancelDiscovery();
    };
  }, [container.discoveryManager]);

  const isScanning = discoveryStatus === 'scanning';
  const canScan = container.discoveryService.isAutomaticDiscoveryAvailable?.() ?? true;
  const isConnecting = connectionStatus === TVConnectionState.Connecting;
  const isPairing = connectionStatus === TVConnectionState.Pairing;

  const handleScanToggle = () => {
    if (!canScan) return;
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
      if ((err as { code?: unknown })?.code === 'cancelled') return;
      const guidance = connectionGuidance(classifyConnectionFailure(err).category);
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
      if ((err as { code?: unknown })?.code === 'cancelled') return;
      const guidance = connectionGuidance(classifyConnectionFailure(err).category);
      setIpError(guidance.message);
      Alert.alert(guidance.title, guidance.message);
    } finally {
      setIsProbingIp(false);
    }
  };

  const renderDeviceItem = (device: TVDevice, isSaved: boolean) => {
    const isCurrentActive =
      activeDeviceId === device.id && connectionStatus === TVConnectionState.Connected;
    const isPending =
      activeDeviceId === device.id && (isConnecting || isPairing);
    const isThisDeviceConnecting =
      activeDeviceId === device.id &&
      (connectionStatus === TVConnectionState.Connecting ||
        connectionStatus === TVConnectionState.Reconnecting ||
        connectionStatus === TVConnectionState.Pairing);

    return (
      <View style={[styles.deviceCard, layout.stackDetails && styles.stacked]} key={device.id} testID={`device-item-${device.id}`}>
        <View style={styles.deviceInfo}>
          <View style={styles.deviceHeaderRow}>
            {isSaved && (
              <View
                style={[
                  styles.deviceStatusDot,
                  isCurrentActive
                    ? styles.statusDotConnected
                    : isThisDeviceConnecting
                    ? styles.statusDotConnecting
                    : styles.statusDotOffline,
                ]}
              />
            )}
            <Text style={styles.deviceName} numberOfLines={1}>
              {device.name}
            </Text>
          </View>
          <Text style={styles.deviceIp}>
            {device.ipAddress} {device.model ? `• ${device.model}` : ''}{' '}
            {isSaved
              ? `• ${
                  isCurrentActive
                    ? 'Connected'
                    : isThisDeviceConnecting
                    ? 'Connecting...'
                    : 'Offline'
                }`
              : ''}
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
              <Text style={styles.actionButtonText}>Connect</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16), paddingLeft: layout.pagePadding + insets.left, paddingRight: layout.pagePadding + insets.right }]} testID="discovery-screen">
      {/* Discovered / Saved Device Lists */}
      <FlatList
        data={discoveredDevices}
        keyExtractor={item => item.id}
        renderItem={({ item }) => renderDeviceItem(item, false)}
        ListHeaderComponent={
          <>
      {/* Header Actions */}
      <View style={[styles.header, layout.headerStacked && styles.stacked]}>
        <Text style={styles.headerTitle}>My TVs</Text>
        {canScan && <TouchableOpacity
          style={[styles.scanButton, isScanning && styles.scanningButton]}
          onPress={handleScanToggle}
          testID="scan-button"
          accessibilityLabel={isScanning ? 'Cancel TV scan' : 'Scan for nearby TVs'}
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
        </TouchableOpacity>}
      </View>

      {/* Automatic discovery capability */}
      {!canScan && (
        <View style={styles.iosNoticeCard} testID="automatic-discovery-unavailable">
          <Text style={styles.iosNoticeTitle}>Automatic Discovery Unavailable</Text>
          <Text style={styles.iosNoticeBody}>
            {Platform.OS === 'ios'
              ? 'Automatic scanning is unavailable on this iPhone. Use a saved TV or enter its IP address below.'
              : 'Automatic scanning is unavailable in this build. Use a saved TV or enter its IP address below.'}
          </Text>
        </View>
      )}

      {/* Manual IP Section (Prominent on iOS) */}
      <View style={styles.sectionCard}>
        <View style={[styles.sectionHeaderRow, layout.headerStacked && styles.stacked]}>
          <Text style={styles.sectionHeader}>Connect via IP Address</Text>
          {Platform.OS === 'ios' && (
            <View style={styles.recommendedBadge}>
              <Text style={styles.recommendedBadgeText}>Recommended</Text>
            </View>
          )}
        </View>
        <Text style={styles.sectionSubtitle}>
          {Platform.OS === 'ios'
            ? 'Enter the IP address shown in your LG TV network settings.'
            : 'Enter TV IP address directly (e.g. 192.168.1.50)'}
        </Text>
        <View style={[styles.manualIpRow, layout.stackForms && styles.stacked]}>
          <TextInput
            style={[styles.ipInput, layout.stackForms && styles.fullWidthInput, ipError ? styles.ipInputError : null]}
            placeholder="192.168.1.50"
            placeholderTextColor={theme.colors.textMuted}
            value={manualIp}
            onChangeText={handleManualIpChange}
            keyboardType="decimal-pad"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="TV IP address"
            returnKeyType="done"
            testID="manual-ip-input"
          />
          <TouchableOpacity
            style={[
              styles.manualConnectButton,
              (!manualIp.trim() || !!ipError || isProbingIp) && styles.buttonDisabled,
            ]}
            disabled={!manualIp.trim() || !!ipError || isProbingIp}
            onPress={handleManualConnect}
            accessibilityRole="button"
            accessibilityLabel="Connect to TV IP address"
            accessibilityState={{ disabled: !manualIp.trim() || !!ipError || isProbingIp, busy: isProbingIp }}
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
                : discoveryError.code === 'native_failure'
                ? 'Could Not Start Discovery'
                : 'Discovery Error'}
            </Text>
            <TouchableOpacity
              onPress={() => container.store.dispatch(tvActions.discoveryErrorDismissed())}
              testID="dismiss-discovery-error-btn"
              style={styles.dismissErrorButton}
              accessibilityLabel="Dismiss discovery error"
              accessibilityRole="button"
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
          {discoveryError.code === 'network_unavailable' && (
            <Text style={styles.discoveryErrorHint}>Connect to the same Wi-Fi network as your TV, then retry or enter its IP address.</Text>
          )}
          {discoveryError.code === 'permission_denied' && (
            <Text style={styles.discoveryErrorHint}>
              {Platform.OS === 'ios'
                ? 'Open iOS Settings → Privacy & Security → Local Network and enable SmartRemote.'
                : 'Check SmartRemote’s local network access and Wi-Fi restrictions in Android Settings.'}
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
            <Text style={styles.emptyTitle}>{isScanning ? 'Scanning your network' : !canScan ? 'Use the TV IP address' :
              discoveryStatus === 'completed' ? 'No TVs found' : 'No TVs found yet'}</Text>
            <Text style={styles.emptyText}>
              {isScanning
                ? 'Searching local Wi-Fi network for LG Smart TVs...'
                : discoveryStatus === 'failed'
                ? 'Automatic SSDP discovery could not complete. Use the manual IP connection form above to connect directly.'
                : !canScan
                ? 'Use the manual IP connection form above.'
                : discoveryStatus === 'completed'
                ? 'The scan finished without a TV response. Retry or connect via IP address above.'
                : 'No TVs discovered yet. Tap "Scan for TVs" or connect via IP address above.'}
            </Text>
          </View>
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={platformPresentation.keyboardDismissMode}
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="never"
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
  stacked: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  fullWidthInput: { flex: undefined, width: '100%' },
  emptyTitle: { ...theme.typography.subtitle, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 8 },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  headerTitle: {
    flexShrink: 1,
    ...theme.typography.title,
    color: theme.colors.textPrimary,
    fontSize: 20,
  },
  scanButton: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
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
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '700',
    color: '#FF6B6B',
  },
  dismissErrorButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
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
    gap: 8,
    alignItems: 'center',
  },
  ipInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    backgroundColor: '#181C26',
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: '#2A3142',
    fontSize: 16,
  },
  ipInputError: {
    borderColor: theme.colors.error,
  },
  manualConnectButton: {
    minWidth: 100,
    minHeight: 48,
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
    flexGrow: 1,
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
  deviceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  deviceStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusDotConnected: {
    backgroundColor: '#30D158',
  },
  statusDotConnecting: {
    backgroundColor: '#FFD60A',
  },
  statusDotOffline: {
    backgroundColor: '#6B7280',
  },
  deviceName: {
    flex: 1,
    minWidth: 0,
    ...theme.typography.subtitle,
    color: theme.colors.textPrimary,
    marginBottom: 0,
  },
  deviceIp: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  actionButton: {
    minHeight: 48,
    justifyContent: 'center',
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
    minHeight: 160,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
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
