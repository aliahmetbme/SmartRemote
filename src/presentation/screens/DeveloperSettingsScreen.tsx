import React from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector } from '../../store/hooks';
import {
  selectConnectionStatus,
  selectSelectedDevice,
} from '../../store/selectors';
import { MotionSettings } from '../components/MotionSettings';
import { theme, usePresentationLayout } from '../theme';
export const DeveloperSettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const layout = usePresentationLayout(insets.left + insets.right);
  const activeDevice = useAppSelector(selectSelectedDevice);
  const connectionStatus = useAppSelector(selectConnectionStatus);
  const diagnostic = useAppSelector(state => state.connection.diagnostic);
  return (
    <ScrollView
      testID="developer-settings-screen"
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingLeft: layout.pagePadding + insets.left,
          paddingRight: layout.pagePadding + insets.right,
          paddingBottom: 24 + insets.bottom,
        },
      ]}
    >
      <View testID="developer-settings-section">
        <Text style={styles.cardHeader}>Motion & pointer</Text>
        <MotionSettings section="developer" />
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Connection details</Text>
          <Text style={styles.infoLabel}>State: {connectionStatus}</Text>
          {activeDevice && (
            <Text style={styles.infoLabel}>
              Protocol: {activeDevice.protocol}
            </Text>
          )}
          <Text style={styles.infoLabel}>
            Selected TV identity: {activeDevice?.id ?? 'Unavailable'}
          </Text>
          <Text style={styles.infoLabel}>
            Failure: {diagnostic?.category ?? 'Unavailable'}
          </Text>
          <Text style={styles.infoLabel}>
            Evidence: {diagnostic?.evidence ?? 'Unavailable'}
          </Text>
          <Text style={styles.infoLabel}>
            Confidence: {diagnostic?.confidence ?? 'Unavailable'}
          </Text>
          <Text style={styles.infoLabel}>
            Last failure:{' '}
            {diagnostic
              ? new Date(diagnostic.failedAt).toISOString()
              : 'Unavailable'}
          </Text>
          <Text style={styles.infoLabel}>
            Transport code: {diagnostic?.transportCode ?? 'Unavailable'}
          </Text>
          <Text style={styles.infoLabel}>
            Retry attempt: {diagnostic?.retryAttempt ?? 'Unavailable'}
          </Text>
          <Text style={styles.infoLabel}>
            Wi-Fi available:{' '}
            {diagnostic?.network.wifi == null
              ? 'Unavailable'
              : String(diagnostic.network.wifi)}
          </Text>
          <Text style={styles.infoLabel}>
            Local network permission: Unavailable
          </Text>
        </View>
        {/* Network & Platform Diagnostics */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Platform & Network Architecture</Text>
          <View style={styles.infoBlock}>
            <View
              style={[
                styles.infoRow,
                layout.stackDetails && styles.infoRowStacked,
              ]}
            >
              <Text style={styles.infoLabel}>Platform:</Text>
              <Text
                style={[
                  styles.infoValue,
                  layout.stackDetails && styles.infoValueStacked,
                ]}
              >
                {Platform.OS.toUpperCase()}
              </Text>
            </View>
            <View
              style={[
                styles.infoRow,
                layout.stackDetails && styles.infoRowStacked,
              ]}
            >
              <Text style={styles.infoLabel}>Storage:</Text>
              <Text
                style={[
                  styles.infoValue,
                  layout.stackDetails && styles.infoValueStacked,
                ]}
              >
                Keychain (Secure) + AsyncStorage
              </Text>
            </View>

            <Text style={styles.diagNoticeTitle}>
              Local Network Privacy & Multicast
            </Text>
            <Text style={styles.diagNoticeBody}>
              {Platform.OS === 'ios'
                ? 'On iOS 14+, automatic UDP multicast discovery (SSDP) requires the restricted Apple entitlement com.apple.developer.networking.multicast. SmartRemote offers manual IP entry as an alternative without requiring restricted entitlements.'
                : 'Android supports SSDP multicast discovery using Android WifiManager.MulticastLock alongside manual IP direct connection.'}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    padding: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  cardHeader: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },
  infoLabel: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginBottom: 8,
    flexShrink: 1,
  },
  infoValue: { color: theme.colors.textPrimary, flex: 1, textAlign: 'right' },
  infoValueStacked: { textAlign: 'left' },
  infoBlock: { gap: 4 },
  infoRow: { flexDirection: 'row', gap: 12, paddingVertical: 8 },
  infoRowStacked: { flexDirection: 'column' },
  diagNoticeTitle: {
    color: theme.colors.secondary,
    fontWeight: '600',
    marginTop: 12,
  },
  diagNoticeBody: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
});
