import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTVWakeSetup } from '../hooks/useTVWakeSetup';
import { theme, usePresentationLayout, platformPresentation } from '../theme';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';

export interface TVWakeSetupScreenProps {
  deviceId?: string;
  isFocused?: boolean;
}
export const TVWakeSetupScreen = ({
  deviceId,
  isFocused = true,
}: TVWakeSetupScreenProps) => {
  const [helpOpen, setHelpOpen] = useState(false);
  const wake = useTVWakeSetup(deviceId, isFocused);
  const insets = useSafeAreaInsets();
  const layout = usePresentationLayout(insets.left + insets.right);
  const status = !wake.valid
    ? 'Not selected'
    : wake.status === TVConnectionState.Connected
    ? 'Connected'
    : wake.status === TVConnectionState.Reconnecting
    ? 'Reconnecting…'
    : wake.status === TVConnectionState.Connecting
    ? 'Connecting…'
    : wake.status === TVConnectionState.Pairing
    ? 'Pairing…'
    : 'Disconnected';
  const disabled =
    !wake.valid ||
    !wake.configured ||
    wake.supported !== true ||
    wake.testing ||
    wake.saving;
  return (
    <View style={styles.container}>
      <ScrollView
        testID="tv-wake-setup-screen"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={platformPresentation.keyboardDismissMode}
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.content,
          {
            paddingLeft: layout.pagePadding + insets.left,
            paddingRight: layout.pagePadding + insets.right,
            paddingBottom: 24 + insets.bottom,
          },
        ]}
      >
        {!wake.device ? (
          <View style={styles.card}>
            <Text style={styles.title}>Choose a TV first</Text>
            <Text style={styles.body}>
              Go back to Settings and select a saved television to set up TV
              wake.
            </Text>
          </View>
        ) : (
          <>
            <View
              style={[styles.card, styles.targetCard]}
              testID="wake-target-card"
            >
              <View style={styles.tvIcon} accessible={false}>
                <View style={styles.tvStand} />
              </View>
              <View style={styles.targetText}>
                <Text style={styles.targetName}>{wake.device.name}</Text>
                <Text style={styles.caption}>{status}</Text>
              </View>
            </View>
            {!wake.valid && (
              <Text
                accessibilityLiveRegion="polite"
                style={styles.notice}
                testID="wake-selection-changed"
              >
                TV selection changed. Go back to Settings to choose the current
                TV.
              </Text>
            )}
            <View style={styles.introduction}>
              <Text style={styles.title}>Turn on your TV from standby</Text>
              <Text style={styles.body}>
                SmartRemote can send a wake request over your local network when
                your television supports this feature.
              </Text>
            </View>
            <View style={styles.card} testID="wake-configuration">
              <Text style={styles.eyebrow}>WAKE CONFIGURATION</Text>
              <Text style={styles.sectionTitle}>
                {wake.configured
                  ? 'Wake configuration saved'
                  : 'TV wake is not set up'}
              </Text>
              <Text style={styles.body}>
                {wake.configured
                  ? 'Your TV’s network information is saved. Waking the TV also depends on its settings and network availability.'
                  : 'Add your TV’s network address to send a wake request to the correct television.'}
              </Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>TV network address</Text>
              <Text style={styles.body}>
                This is the MAC address shown in your TV’s network information.
              </Text>
              {wake.editing ? (
                <View style={styles.editor}>
                  <TextInput
                    accessibilityLabel="TV MAC address"
                    testID="settings-mac-input"
                    style={styles.input}
                    value={wake.input}
                    onChangeText={wake.changeInput}
                    editable={wake.valid && !wake.saving}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder="AA:BB:CC:DD:EE:FF"
                    placeholderTextColor={theme.colors.textMuted}
                  />
                  {wake.error && (
                    <Text
                      style={styles.error}
                      accessibilityLiveRegion="polite"
                      testID="wake-address-error"
                    >
                      {wake.error}
                    </Text>
                  )}
                  <View
                    style={[
                      styles.actions,
                      layout.stackForms && styles.stacked,
                    ]}
                  >
                    <TouchableOpacity
                      onPress={wake.save}
                      disabled={!wake.valid || wake.saving || !wake.dirty}
                      accessibilityRole="button"
                      accessibilityLabel="Save TV network address"
                      testID="save-mac-btn"
                      style={[
                        styles.primary,
                        (!wake.valid || wake.saving || !wake.dirty) &&
                          styles.disabled,
                      ]}
                    >
                      <Text style={styles.primaryText}>
                        {wake.saving ? 'Saving…' : 'Save address'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={wake.cancelEdit}
                      disabled={wake.saving}
                      accessibilityRole="button"
                      testID="cancel-mac-btn"
                      style={styles.secondary}
                    >
                      <Text style={styles.link}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <Text
                    style={styles.address}
                    testID="settings-mac-display"
                    selectable
                  >
                    {wake.device.macAddress ?? 'No address saved'}
                  </Text>
                  <TouchableOpacity
                    onPress={wake.beginEdit}
                    disabled={!wake.valid || wake.testing}
                    accessibilityRole="button"
                    accessibilityLabel={
                      wake.configured
                        ? 'Edit TV network address'
                        : 'Add TV network address'
                    }
                    testID="edit-mac-btn"
                    style={styles.secondary}
                  >
                    <Text
                      style={[
                        styles.link,
                        (!wake.valid || wake.testing) && styles.disabled,
                      ]}
                    >
                      {wake.configured ? 'Edit address' : 'Add network address'}{' '}
                      <Text style={styles.navigationArrow} accessible={false}>
                        ›
                      </Text>
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
            <View style={styles.card} testID="wake-help">
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Enable remote power-on on your TV"
                accessibilityState={{ expanded: helpOpen }}
                onPress={() => setHelpOpen(!helpOpen)}
                testID="wake-help-toggle"
                style={styles.helpAction}
              >
                <Text style={[styles.sectionTitle, styles.helpTitle]}>
                  Enable remote power-on on your TV
                </Text>
                <Text style={styles.navigationArrow} accessible={false}>
                  {helpOpen ? '⌃' : '⌄'}
                </Text>
              </TouchableOpacity>
              {helpOpen && (
                <View>
                  <Text style={styles.step}>
                    1. Open your TV’s power or network settings.
                  </Text>
                  <Text style={styles.step}>
                    2. On compatible LG TVs, look for TV On With Mobile and Turn
                    On via Wi-Fi (or Ethernet).
                  </Text>
                  <Text style={styles.step}>
                    3. Some models also use Quick Start+. Names and menu
                    locations vary by model and software.
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.testSection}>
              <Text style={styles.body}>
                To test waking from standby, first put your TV in standby and
                keep SmartRemote open.
              </Text>
              <TouchableOpacity
                onPress={wake.test}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel="Test TV Wake"
                accessibilityHint="Sends a wake request and waits for this TV to reconnect"
                accessibilityState={{ disabled, busy: wake.testing }}
                testID="test-wake-btn"
                style={[styles.primary, disabled && styles.disabled]}
              >
                <Text style={styles.primaryText}>
                  {wake.testing ? 'Testing TV wake…' : 'Test TV Wake'}
                </Text>
              </TouchableOpacity>
              {!wake.configured && (
                <Text style={styles.caption}>
                  Save a valid TV network address before testing.
                </Text>
              )}
              {wake.supported === false && (
                <Text style={styles.caption}>
                  Wake requests cannot be tested in this app right now.
                </Text>
              )}
              {wake.testing && (
                <TouchableOpacity
                  onPress={wake.cancelTest}
                  accessibilityRole="button"
                  testID="cancel-wake-test"
                  style={styles.secondary}
                >
                  <Text style={styles.link}>Cancel test</Text>
                </TouchableOpacity>
              )}
              {wake.feedback && (
                <View
                  style={styles.result}
                  accessibilityLiveRegion="polite"
                  testID="wake-result"
                >
                  <Text style={styles.sectionTitle}>{wake.feedback.title}</Text>
                  <Text style={styles.body}>{wake.feedback.message}</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingTop: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  targetCard: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  targetText: { flex: 1, minWidth: 0 },
  targetName: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
  },
  tvIcon: {
    width: 32,
    height: 22,
    borderWidth: 1.5,
    borderColor: theme.colors.secondary,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 5,
  },
  tvStand: {
    position: 'absolute',
    bottom: -6,
    width: 14,
    height: 2,
    backgroundColor: theme.colors.secondary,
  },
  introduction: { marginBottom: theme.spacing.lg, gap: 8 },
  title: { color: theme.colors.textPrimary, fontSize: 23, fontWeight: '700' },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  body: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 21 },
  caption: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
  },
  eyebrow: {
    color: theme.colors.secondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  address: { color: theme.colors.textPrimary, fontSize: 16, marginTop: 12 },
  editor: { marginTop: 12, gap: 8 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.colors.borderActive,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 12,
    color: theme.colors.textPrimary,
    fontSize: 16,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stacked: { flexDirection: 'column' },
  primary: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.secondary,
    marginVertical: 8,
  },
  primaryText: {
    color: theme.colors.background,
    fontSize: 15,
    fontWeight: '700',
  },
  secondary: { minHeight: 48, justifyContent: 'center', paddingVertical: 8 },
  link: { color: theme.colors.secondary, fontSize: 14, fontWeight: '600' },
  navigationArrow: {
    color: theme.colors.secondary,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600',
    minWidth: 32,
    textAlign: 'center',
  },
  helpAction: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    minHeight: 48,
  },
  helpTitle: { flex: 1, marginBottom: 0 },
  step: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  testSection: { marginBottom: 16 },
  result: {
    padding: 16,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    marginTop: 12,
  },
  notice: {
    color: theme.colors.connecting,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  error: { color: theme.colors.error, fontSize: 14 },
  disabled: { opacity: 0.45 },
});
