import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
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
import { tvActions } from '../../store/slices/tvSlice';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { isValidMacAddress } from '../../domain/utils/macValidator';
import { useContainer } from '../context/ContainerContext';
import { theme, usePresentationLayout, platformPresentation } from '../theme';

export const SettingsScreen: React.FC = () => {
  const container = useContainer();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const layout = usePresentationLayout(insets.left + insets.right);

  const savedDevices = useAppSelector(selectSavedDevices);
  const activeDeviceId = useAppSelector(selectSelectedDeviceId);
  const connectionStatus = useAppSelector(selectConnectionStatus);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isEditingMac, setIsEditingMac] = useState<boolean>(false);
  const [macInput, setMacInput] = useState<string>('');
  const [isTestingWake, setIsTestingWake] = useState<boolean>(false);
  const selectedDevice = useAppSelector(selectSelectedDevice);
  const activeDevice = selectedDevice ?? (savedDevices.length > 0 ? savedDevices[0] : null);

  useEffect(() => {
    if (activeDevice?.macAddress) {
      setMacInput(activeDevice.macAddress);
    }
  }, [activeDevice?.macAddress]);

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(
      `[SmartRemote][SettingsScreen] Active TV='${activeDevice?.name ?? 'none'}', status='${connectionStatus}', savedCount=${savedDevices.length}`,
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
  }, [activeDeviceId, container.useCases.hydrateDevices, dispatch, savedDevices.length]);

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
              const msg = err instanceof Error ? err.message : 'Could not forget device';
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
      const msg = err instanceof Error ? err.message : 'Could not connect to TV';
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

  const handleReconnect = async () => {
    try {
      await container.useCases.reconnectTV.execute();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not reconnect to TV';
      Alert.alert('Reconnect Failed', msg);
    }
  };

  const handleSaveMac = async () => {
    if (!activeDevice) return;
    const trimmed = macInput.trim();
    if (!isValidMacAddress(trimmed)) {
      Alert.alert(
        'Invalid MAC Address',
        'Please enter a valid 12-digit hexadecimal MAC address (e.g. AA:BB:CC:DD:EE:FF or AA-BB-CC-DD-EE-FF).',
      );
      return;
    }
    try {
      const updated = await container.useCases.updateTVMac.execute(activeDevice.id, trimmed);
      dispatch(tvActions.deviceSaved(updated));
      setIsEditingMac(false);
      Alert.alert('MAC Address Saved', `Updated MAC address for "${updated.name}" to ${updated.macAddress}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update MAC address';
      Alert.alert('Error', msg);
    }
  };

  const handleTestWake = async () => {
    if (!activeDevice) return;
    if (!activeDevice.macAddress) {
      Alert.alert('MAC Required', 'Please configure and save a MAC address for this TV first.');
      return;
    }
    setIsTestingWake(true);
    try {
      const result = await container.useCases.wakeTV.execute(activeDevice, {
        wakeTimeoutMs: 15000,
        probeIntervalMs: 1500,
      });
      if (result.success) {
        Alert.alert('Wake Successful', `TV responded and connected successfully! Sent ${result.packetsSent} packet(s).`);
      } else {
        Alert.alert(
          'Wake-on-LAN Sent',
          `Magic packet transmitted (${result.packetsSent} packets sent to ${result.destinations.join(', ')}).\n\nIf the TV did not power on, verify that "TV On With Mobile" or "Turn On via Wi-Fi" is enabled in your TV's settings.`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Wake-on-LAN test failed';
      Alert.alert('Test Wake Failed', msg);
    } finally {
      setIsTestingWake(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} >
    <ScrollView
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={platformPresentation.keyboardDismissMode}
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[styles.contentContainer, {
        paddingTop: Math.max(0, 16 - insets.top),
        paddingLeft: layout.pagePadding + insets.left,
        paddingRight: layout.pagePadding + insets.right,
      }]}
      testID="settings-screen"
    >
      <Text style={styles.screenTitle}>Settings & Diagnostics</Text>

      {/* Active TV Connection Status Card */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>Current Connection</Text>
        {activeDevice ? (
          <View style={styles.infoBlock}>
            <View style={[styles.infoRow, layout.stackDetails && styles.infoRowStacked]}>
              <Text style={styles.infoLabel}>TV Name:</Text>
              <Text style={[styles.infoValue, layout.stackDetails && styles.infoValueStacked]}>{activeDevice.name}</Text>
            </View>
            <View style={[styles.infoRow, layout.stackDetails && styles.infoRowStacked]}>
              <Text style={styles.infoLabel}>IP Address:</Text>
              <Text style={[styles.infoValue, layout.stackDetails && styles.infoValueStacked]}>{activeDevice.ipAddress}</Text>
            </View>
            <View style={[styles.infoRow, layout.stackDetails && styles.infoRowStacked]}>
              <Text style={styles.infoLabel}>Protocol:</Text>
              <Text style={[styles.infoValue, layout.stackDetails && styles.infoValueStacked]}>{activeDevice.protocol}</Text>
            </View>
            <View style={[styles.infoRow, layout.stackDetails && styles.infoRowStacked]}>
              <Text style={styles.infoLabel}>Status:</Text>
              <Text
                style={[
                  styles.infoValue, layout.stackDetails && styles.infoValueStacked,
                  {
                    color:
                      connectionStatus === TVConnectionState.Connected
                        ? theme.colors.connected
                        : connectionStatus === TVConnectionState.Error
                        ? theme.colors.error
                        : theme.colors.connecting,
                  },
                ]}
              >
                {connectionStatus}
              </Text>
            </View>

            {connectionStatus === TVConnectionState.Connected ? (
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.disconnectButton}
                onPress={handleDisconnect}
                testID="settings-disconnect-btn"
              >
                <Text style={styles.disconnectButtonText}>Disconnect Current TV</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.reconnectButton}
                onPress={handleReconnect}
                testID="settings-reconnect-btn"
              >
                <Text style={styles.reconnectButtonText}>Reconnect to TV</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <Text style={styles.emptyText}>No TV currently active or connected.</Text>
        )}
      </View>

      {/* Wake-on-LAN Configuration Card */}
      {activeDevice && (
        <View style={styles.card} testID="settings-wol-card">
          <Text style={styles.cardHeader}>Wake-on-LAN (Power On from Standby)</Text>
          <View style={styles.infoBlock}>
            <View style={[styles.infoRow, layout.stackDetails && styles.infoRowStacked]}>
              <Text style={styles.infoLabel}>TV Target:</Text>
              <Text style={[styles.infoValue, layout.stackDetails && styles.infoValueStacked]}>{activeDevice.name}</Text>
            </View>

            <View style={[styles.infoRow, layout.stackDetails && styles.infoRowStacked]}>
              <Text style={styles.infoLabel}>MAC Address:</Text>
              <Text
                style={[
                  styles.infoValue, layout.stackDetails && styles.infoValueStacked,
                  !activeDevice.macAddress && styles.infoValueMuted,
                ]}
                testID="settings-mac-display"
              >
                {activeDevice.macAddress ? activeDevice.macAddress : 'Not configured'}
              </Text>
            </View>

            <View style={[styles.infoRow, layout.stackDetails && styles.infoRowStacked]}>
              <Text style={styles.infoLabel}>Wake Capability:</Text>
              <Text
                style={[
                  styles.infoValue, layout.stackDetails && styles.infoValueStacked,
                  {
                    color: activeDevice.macAddress ? theme.colors.connected : theme.colors.error,
                  },
                ]}
              >
                {activeDevice.macAddress ? 'Ready (WoL Enabled)' : 'Requires MAC'}
              </Text>
            </View>

            {isEditingMac ? (
              <View style={styles.macEditContainer}>
                <Text style={styles.macInputLabel}>Enter TV MAC Address:</Text>
                <TextInput
                  style={styles.macTextInput}
                  value={macInput}
                  onChangeText={setMacInput}
                  placeholder="e.g. AA:BB:CC:DD:EE:FF"
                  placeholderTextColor={theme.colors.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  accessibilityLabel="TV MAC address"
                  testID="settings-mac-input"
                />
                <View style={[styles.macEditButtonRow, layout.stackForms && styles.buttonRowStacked]}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.cancelMacButton}
                    onPress={() => {
                      setMacInput(activeDevice.macAddress ?? '');
                      setIsEditingMac(false);
                    }}
                    testID="cancel-mac-btn"
                  >
                    <Text style={styles.cancelMacText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.saveMacButton}
                    onPress={handleSaveMac}
                    testID="save-mac-btn"
                  >
                    <Text style={styles.saveMacText}>Save MAC</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={[styles.wolButtonRow, layout.stackForms && styles.buttonRowStacked]}>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.editMacButton}
                  onPress={() => {
                    setMacInput(activeDevice.macAddress ?? '');
                    setIsEditingMac(true);
                  }}
                  testID="edit-mac-btn"
                >
                  <Text style={styles.editMacButtonText}>
                    {activeDevice.macAddress ? 'Edit MAC' : 'Configure MAC'}
                  </Text>
                </TouchableOpacity>

                {Boolean(activeDevice.macAddress) && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={[styles.testWakeButton, isTestingWake && styles.controlDisabled]}
                    disabled={isTestingWake}
                    onPress={handleTestWake}
                    testID="test-wake-btn"
                  >
                    <Text style={styles.testWakeButtonText}>
                      {isTestingWake ? 'Sending WoL...' : 'Test Wake'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <Text style={styles.wolNoticeTitle}>LG TV Standby Settings:</Text>
            <Text style={styles.wolNoticeBody}>
              To allow SmartRemote to power on your TV from standby:{"\n"}
              1. On your LG TV, open Settings &gt; General &gt; Devices &gt; External Devices &gt; TV On With Mobile.{"\n"}
              2. Turn ON &quot;Turn on via Wi-Fi&quot; (or Ethernet if wired).
            </Text>
          </View>
        </View>
      )}

      {/* Saved Devices Management */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>Saved TV Devices ({savedDevices.length})</Text>
        {isLoading ? (
          <Text style={styles.emptyText}>Loading saved devices...</Text>
        ) : savedDevices.length === 0 ? (
          <Text style={styles.emptyText}>No saved TVs. Connect to a TV to save it for quick access.</Text>
        ) : (
          savedDevices.map(device => {
            const isDeviceActive = device.id === activeDeviceId;
            const isDeviceConnected =
              isDeviceActive && connectionStatus === TVConnectionState.Connected;
            const isDeviceConnecting =
              isDeviceActive &&
              (connectionStatus === TVConnectionState.Connecting ||
                connectionStatus === TVConnectionState.Reconnecting ||
                connectionStatus === TVConnectionState.Pairing);

            return (
              <View style={[styles.savedItemRow, layout.stackDetails && styles.savedItemStacked]} key={device.id} testID={`saved-device-${device.id}`}>
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
                    {device.ipAddress}
                    {device.macAddress ? ` • MAC: ${device.macAddress}` : ''} •{' '}
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
                    onPress={() => handleForgetDevice(device.id, device.name)}
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

      {/* Network & Platform Diagnostics */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>Platform & Network Architecture</Text>
        <View style={styles.infoBlock}>
          <View style={[styles.infoRow, layout.stackDetails && styles.infoRowStacked]}>
            <Text style={styles.infoLabel}>Platform:</Text>
            <Text style={[styles.infoValue, layout.stackDetails && styles.infoValueStacked]}>{Platform.OS.toUpperCase()}</Text>
          </View>
          <View style={[styles.infoRow, layout.stackDetails && styles.infoRowStacked]}>
            <Text style={styles.infoLabel}>Storage:</Text>
            <Text style={[styles.infoValue, layout.stackDetails && styles.infoValueStacked]}>Keychain (Secure) + AsyncStorage</Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
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
