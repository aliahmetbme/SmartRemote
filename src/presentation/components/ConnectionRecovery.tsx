import React, { useEffect, useRef, useState } from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { useAppSelector } from '../../store/hooks';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { connectionGuidance } from '../connectionGuidance';
export { connectionGuidance } from '../connectionGuidance';
import { useContainer } from '../context/ContainerContext';
import { theme } from '../theme';
export const ConnectionRecovery = ({
  onFindTV,
  onSettings,
  onWake,
}: {
  onFindTV?: () => void;
  onSettings?: () => void;
  onWake?: () => void;
}) => {
  const container = useContainer();
  const status = useAppSelector(s => s.connection.status);
  const diagnostic = useAppSelector(s => s.connection.diagnostic);
  const selectedId = useAppSelector(s => s.tv.selectedDeviceId);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [dismissed, setDismissed] = useState<number | null>(null);
  if (
    !diagnostic ||
    diagnostic.deviceId !== selectedId ||
    dismissed === diagnostic.failedAt ||
    ![TVConnectionState.Error, TVConnectionState.Reconnecting].includes(status)
  )
    return null;
  const reconnecting = status === TVConnectionState.Reconnecting;
  const guidance = reconnecting
    ? {
        title: 'Connection interrupted',
        message: 'SmartRemote is trying to reconnect to your TV.',
        action: '',
      }
    : connectionGuidance(diagnostic.category);
  const recover = async () => {
    if (
      busy ||
      container.connectionManager.getState() !== TVConnectionState.Error ||
      container.connectionManager.getOperationRevision() !==
        diagnostic.revision ||
      container.store.getState().connection.diagnostic?.failedAt !==
        diagnostic.failedAt ||
      container.store.getState().tv.selectedDeviceId !== diagnostic.deviceId ||
      container.connectionManager.getDevice()?.id !== diagnostic.deviceId
    )
      return;
    if (diagnostic.category === 'TLS_TRUST_FAILURE') {
      onSettings?.();
      return;
    }
    setBusy(true);
    try {
      if (diagnostic.category === 'NETWORK_UNAVAILABLE')
        await Linking.openSettings();
      else await container.useCases.reconnectTV.execute();
    } catch {
      /* Current failure remains owned by the manager; never start another retry loop. */
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <View
      style={styles.card}
      accessibilityLiveRegion="polite"
      testID="connection-recovery"
    >
      <Text style={styles.title}>{guidance.title}</Text>
      <Text style={styles.message}>{guidance.message}</Text>
      <View style={styles.actions}>
        {!reconnecting && (
          <TouchableOpacity
            onPress={recover}
            disabled={busy}
            accessibilityRole="button"
            style={styles.button}
            testID="connection-retry"
          >
            <Text style={styles.link}>
              {busy ? 'Please wait…' : guidance.action}
            </Text>
          </TouchableOpacity>
        )}
        {onFindTV && (
          <TouchableOpacity
            onPress={onFindTV}
            accessibilityRole="button"
            style={styles.button}
          >
            <Text style={styles.link}>Find TV</Text>
          </TouchableOpacity>
        )}
        {!reconnecting && onWake && (
          <TouchableOpacity
            onPress={() => {
              if (
                container.connectionManager.getState() ===
                  TVConnectionState.Error &&
                container.store.getState().tv.selectedDeviceId ===
                  diagnostic.deviceId &&
                container.connectionManager.getDevice()?.id ===
                  diagnostic.deviceId
              )
                onWake();
            }}
            accessibilityRole="button"
            style={styles.button}
          >
            <Text style={styles.link}>Wake TV</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => setDismissed(diagnostic.failedAt)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss connection guidance"
          style={styles.button}
        >
          <Text style={styles.link}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  card: {
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
  },
  title: { color: theme.colors.textPrimary, fontSize: 15, fontWeight: '600' },
  message: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginTop: theme.spacing.xs,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  button: { minHeight: 48, justifyContent: 'center' },
  link: { color: theme.colors.secondary, fontSize: 14 },
});
