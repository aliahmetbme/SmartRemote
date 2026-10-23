import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector } from '../../store/hooks';
import {
  selectCapabilities,
  selectConnectionStatus,
  selectSelectedDeviceId,
  selectSavedDevices,
} from '../../store/selectors';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { TVCapability } from '../../domain/entities/TVCapabilities';
import { useContainer } from '../context/ContainerContext';
import { Touchpad } from '../components/Touchpad';
import { NumericKeypad } from '../components/NumericKeypad';
import { MotionSurface } from '../components/MotionSurface';
import { VolumeRocker } from '../components/VolumeRocker';
import { ChannelRocker } from '../components/ChannelRocker';
import { DirectionPad } from '../components/DirectionPad';
import { RemoteMode, RemoteModeSelector } from '../components/RemoteModeSelector';
import { theme } from '../theme';

interface RemoteScreenProps {
  onNavigateToDiscovery?: () => void;
}

export const RemoteScreen: React.FC<RemoteScreenProps> = ({ onNavigateToDiscovery }) => {
  const container = useContainer();
  const insets = useSafeAreaInsets();

  const connectionStatus = useAppSelector(selectConnectionStatus);
  const activeDeviceId = useAppSelector(selectSelectedDeviceId);
  const savedDevices = useAppSelector(selectSavedDevices);
  const capabilities = useAppSelector(selectCapabilities);

  const [activeTab, setActiveTab] = useState<RemoteMode>('buttons');
  const [isTouchpadActive, setIsTouchpadActive] = useState<boolean>(false);
  const [isMotionActive, setIsMotionActive] = useState<boolean>(false);
  const [launchingAppId, setLaunchingAppId] = useState<string | null>(null);

  const managerDevice = container.connectionManager.getDevice();
  const activeDevice =
    savedDevices.find(d => d.id === activeDeviceId) ??
    (managerDevice ? managerDevice : null) ??
    (savedDevices.length > 0 ? savedDevices[0] : null);
  const tvDisplayName = activeDevice
    ? activeDevice.name
    : managerDevice
    ? managerDevice.name
    : activeDeviceId
    ? `LG TV (${activeDeviceId})`
    : 'No TV Selected';
  const isConnected = connectionStatus === TVConnectionState.Connected;

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(
      `[SmartRemote][RemoteScreen] Active TV='${tvDisplayName}', state=${connectionStatus}, activeDeviceId='${activeDeviceId}', savedCount=${savedDevices.length}`,
    );
  }

  const isCapable = (cap: TVCapability): boolean => {
    if (!capabilities) return false;
    return capabilities[cap] !== 'unsupported';
  };

  const handleCommand = (action: () => Promise<void>, _operationName: string) => {
    if (!isConnected) {
      Alert.alert('TV Disconnected', 'Please connect to your TV to send commands.');
      return;
    }
    action().catch(() => {
      // Non-fatal command error
    });
  };

  const handleLaunchApp = async (targetAlias: string) => {
    if (!isConnected) {
      Alert.alert('TV Disconnected', 'Please connect to your TV to launch applications.');
      return;
    }
    setLaunchingAppId(targetAlias);
    try {
      // Resolve app ID through GetInstalledAppsUseCase
      const resolvedId = await container.useCases.getInstalledApps.resolveAppId(targetAlias);
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(`[SmartRemote][LaunchApp] Launching alias '${targetAlias}' as '${resolvedId}'`);
      }
      await container.useCases.sendRemoteCommand.execute({
        type: 'launchApp',
        appId: resolvedId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to launch application';
      console.warn(`[SmartRemote][LaunchApp] Failed to launch ${targetAlias}: ${msg}`);
      Alert.alert(
        'App Launch Failed',
        `Could not launch ${targetAlias.toUpperCase()} on this TV. ${msg}`,
      );
    } finally {
      setLaunchingAppId(null);
    }
  };

  const renderStatusBadge = () => {
    let text = 'Disconnected';
    let color: string = theme.colors.disconnected;
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
        text = 'Pairing...';
        color = theme.colors.pairing;
        showSpinner = true;
        break;
      case TVConnectionState.Reconnecting:
        text = 'Reconnecting...';
        color = theme.colors.connecting;
        showSpinner = true;
        break;
      case TVConnectionState.Error:
        text = 'Offline / Error';
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

  const handleTabChange = (tab: RemoteMode) => {
    setIsTouchpadActive(false);
    setIsMotionActive(false);
    setActiveTab(tab);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        {
          paddingTop: Math.max(insets.top, 16),
          paddingBottom: Math.max(insets.bottom, 24) + 64,
        },
      ]}
      scrollEnabled={!isTouchpadActive && !isMotionActive}
      testID="remote-screen"
    >
      {/* 1. Connected TV header & Power */}
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

      {/* 2. 3-Mode Selector: Buttons | Touchpad | Motion */}
      <RemoteModeSelector
        activeMode={activeTab}
        onModeChange={handleTabChange}
      />

      {/* Remote Body Card */}
      <View style={styles.remoteBody}>
        {/* System Controls: Power, Home, Back */}
        <View style={styles.topRowControls}>
          {/* Power Button */}
          <TouchableOpacity
            style={[
              styles.powerButton,
              (!isConnected || !isCapable('powerOff')) && styles.controlDisabled,
            ]}
            disabled={!isConnected || !isCapable('powerOff')}
            onPress={() =>
              handleCommand(
                () => container.useCases.sendRemoteCommand.execute({ type: 'powerOff' }),
                'powerOff',
              )
            }
            testID="btn-power"
            accessibilityLabel="Power Off"
            accessibilityRole="button"
          >
            <Text style={styles.powerIcon}>⏻</Text>
          </TouchableOpacity>

          {/* Home Button */}
          <TouchableOpacity
            style={[styles.circleButton, !isConnected && styles.controlDisabled]}
            disabled={!isConnected}
            onPress={() =>
              handleCommand(
                () => container.useCases.sendRemoteCommand.execute({ type: 'home' }),
                'home',
              )
            }
            testID="btn-home"
            accessibilityLabel="Home"
            accessibilityRole="button"
          >
            <Text style={styles.buttonLabel}>HOME</Text>
          </TouchableOpacity>

          {/* Back Button */}
          <TouchableOpacity
            style={[styles.circleButton, !isConnected && styles.controlDisabled]}
            disabled={!isConnected}
            onPress={() =>
              handleCommand(
                () => container.useCases.sendRemoteCommand.execute({ type: 'back' }),
                'back',
              )
            }
            testID="btn-back"
            accessibilityLabel="Back"
            accessibilityRole="button"
          >
            <Text style={styles.buttonLabel}>BACK</Text>
          </TouchableOpacity>
        </View>

        {/* Dynamic Mode Content */}
        {activeTab === 'buttons' && (
          <View testID="buttons-mode-content">
            {/* 3. Volume, D-Pad, and Channel Cluster */}
            <View style={styles.middleControlRow}>
              <VolumeRocker
                onVolumeUp={() =>
                  handleCommand(
                    () => container.useCases.sendRemoteCommand.execute({ type: 'volumeUp' }),
                    'volumeUp',
                  )
                }
                onVolumeDown={() =>
                  handleCommand(
                    () => container.useCases.sendRemoteCommand.execute({ type: 'volumeDown' }),
                    'volumeDown',
                  )
                }
                onMute={() =>
                  handleCommand(
                    () => container.useCases.sendRemoteCommand.execute({ type: 'mute' }),
                    'mute',
                  )
                }
                disabled={!isConnected}
                volDisabled={!isCapable('volumeControl')}
                muteDisabled={!isCapable('muteControl')}
              />

              <DirectionPad
                onNavigate={direction =>
                  handleCommand(
                    () =>
                      container.useCases.sendRemoteCommand.execute({
                        type: 'navigate',
                        direction,
                      }),
                    `navigate-${direction}`,
                  )
                }
                onSelect={() =>
                  handleCommand(
                    () => container.useCases.sendRemoteCommand.execute({ type: 'select' }),
                    'select',
                  )
                }
                disabled={!isConnected}
              />

              <ChannelRocker
                onChannelUp={() =>
                  handleCommand(
                    () => container.useCases.sendRemoteCommand.execute({ type: 'channelUp' }),
                    'channelUp',
                  )
                }
                onChannelDown={() =>
                  handleCommand(
                    () => container.useCases.sendRemoteCommand.execute({ type: 'channelDown' }),
                    'channelDown',
                  )
                }
                disabled={!isConnected || !isCapable('channelControl')}
              />
            </View>

            {/* 4. NumericKeypad inside Buttons mode */}
            <View style={styles.keypadContainer} testID="keypad-buttons-section">
              <NumericKeypad style={styles.numbersKeypadSurface} />
            </View>

            {/* 5. Existing Application Shortcuts (YouTube, Amazon Prime Video, Netflix) */}
            <View style={styles.shortcutsSection} testID="app-shortcuts-section">
              <Text style={styles.sectionTitle}>Apps</Text>
              <View style={styles.chipsRow}>
                {['netflix', 'youtube', 'amazon'].map(appId => (
                  <TouchableOpacity
                    key={appId}
                    style={[styles.appChip, !isConnected && styles.controlDisabled]}
                    disabled={launchingAppId !== null}
                    onPress={() => handleLaunchApp(appId)}
                    testID={`btn-app-${appId}`}
                    accessibilityLabel={`Launch ${appId}`}
                    accessibilityRole="button"
                  >
                    {launchingAppId === appId ? (
                      <ActivityIndicator size="small" color="#D4DAE8" />
                    ) : (
                      <Text style={styles.chipText}>
                        {appId === 'amazon' ? 'PRIME VIDEO' : appId.toUpperCase()}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 6. Existing Input/Source Shortcuts */}
            <View style={styles.shortcutsSection} testID="input-switching-section">
              <Text style={styles.sectionTitle}>Inputs</Text>
              <View style={styles.chipsRow}>
                {['HDMI_1', 'HDMI_2', 'AV_1'].map(inputId => (
                  <TouchableOpacity
                    key={inputId}
                    style={[styles.inputChip, !isConnected && styles.controlDisabled]}
                    onPress={() =>
                      handleCommand(
                        () =>
                          container.useCases.sendRemoteCommand.execute({
                            type: 'openInput',
                            inputId,
                          }),
                        `openInput-${inputId}`,
                      )
                    }
                    testID={`btn-input-${inputId}`}
                    accessibilityLabel={`Switch to ${inputId}`}
                    accessibilityRole="button"
                  >
                    <Text style={styles.chipText}>{inputId.replace('_', ' ')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {activeTab === 'touchpad' && (
          /* Touchpad Mode: Gesture surface with Rockers accessible underneath */
          <View style={styles.touchpadSection}>
            <Touchpad
              style={styles.touchpadExpandedSurface}
              onActiveChange={setIsTouchpadActive}
            />
            <View style={styles.touchpadRockersRow}>
              <VolumeRocker
                onVolumeUp={() =>
                  handleCommand(
                    () => container.useCases.sendRemoteCommand.execute({ type: 'volumeUp' }),
                    'volumeUp',
                  )
                }
                onVolumeDown={() =>
                  handleCommand(
                    () => container.useCases.sendRemoteCommand.execute({ type: 'volumeDown' }),
                    'volumeDown',
                  )
                }
                onMute={() =>
                  handleCommand(
                    () => container.useCases.sendRemoteCommand.execute({ type: 'mute' }),
                    'mute',
                  )
                }
                disabled={!isConnected}
                volDisabled={!isCapable('volumeControl')}
                muteDisabled={!isCapable('muteControl')}
              />
              <ChannelRocker
                onChannelUp={() =>
                  handleCommand(
                    () => container.useCases.sendRemoteCommand.execute({ type: 'channelUp' }),
                    'channelUp',
                  )
                }
                onChannelDown={() =>
                  handleCommand(
                    () => container.useCases.sendRemoteCommand.execute({ type: 'channelDown' }),
                    'channelDown',
                  )
                }
                disabled={!isConnected || !isCapable('channelControl')}
              />
            </View>
          </View>
        )}

        {activeTab === 'motion' && (
          /* Motion Mode: Hold-to-aim surface with Rockers accessible underneath */
          <View style={styles.motionSection}>
            <MotionSurface
              style={styles.motionExpandedSurface}
              onActiveChange={setIsMotionActive}
            />
            <View style={styles.motionRockersRow}>
              <VolumeRocker
                onVolumeUp={() =>
                  handleCommand(
                    () => container.useCases.sendRemoteCommand.execute({ type: 'volumeUp' }),
                    'volumeUp',
                  )
                }
                onVolumeDown={() =>
                  handleCommand(
                    () => container.useCases.sendRemoteCommand.execute({ type: 'volumeDown' }),
                    'volumeDown',
                  )
                }
                onMute={() =>
                  handleCommand(
                    () => container.useCases.sendRemoteCommand.execute({ type: 'mute' }),
                    'mute',
                  )
                }
                disabled={!isConnected}
                volDisabled={!isCapable('volumeControl')}
                muteDisabled={!isCapable('muteControl')}
              />
              <ChannelRocker
                onChannelUp={() =>
                  handleCommand(
                    () => container.useCases.sendRemoteCommand.execute({ type: 'channelUp' }),
                    'channelUp',
                  )
                }
                onChannelDown={() =>
                  handleCommand(
                    () => container.useCases.sendRemoteCommand.execute({ type: 'channelDown' }),
                    'channelDown',
                  )
                }
                disabled={!isConnected || !isCapable('channelControl')}
              />
            </View>
          </View>
        )}
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
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    flexGrow: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  tvInfoCol: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  tvName: {
    ...theme.typography.title,
    color: theme.colors.textPrimary,
    fontSize: 18,
    marginBottom: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    backgroundColor: '#161B26',
  },
  badgeSpinner: {
    marginRight: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  switchTvButton: {
    backgroundColor: '#1E2536',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: '#2E3A52',
  },
  switchTvText: {
    ...theme.typography.caption,
    color: '#D4DAE8',
    fontWeight: '600',
  },
  remoteBody: {
    backgroundColor: '#151924',
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: '#242C3E',
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  topRowControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.sm,
  },
  powerButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#261418',
    borderWidth: 1.5,
    borderColor: '#4A1C23',
    justifyContent: 'center',
    alignItems: 'center',
  },
  powerIcon: {
    fontSize: 22,
    color: '#FF453A',
    fontWeight: 'bold',
  },
  circleButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#1C2232',
    borderWidth: 1.5,
    borderColor: '#2B354C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B6BECE',
    letterSpacing: 0.5,
  },
  middleControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  keypadContainer: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchpadSection: {
    marginBottom: theme.spacing.lg,
  },
  touchpadExpandedSurface: {
    height: 220,
    marginVertical: 0,
    marginBottom: theme.spacing.md,
  },
  touchpadRockersRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  numbersKeypadSurface: {
    marginBottom: 0,
  },
  motionSection: {
    marginBottom: theme.spacing.lg,
  },
  motionExpandedSurface: {
    marginBottom: theme.spacing.md,
  },
  motionRockersRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  shortcutsSection: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#222838',
  },
  sectionTitle: {
    ...theme.typography.caption,
    color: '#8A92A4',
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: theme.spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  appChip: {
    backgroundColor: '#1E2536',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: '#2F3A52',
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputChip: {
    backgroundColor: '#1A2130',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: '#2B354C',
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: {
    ...theme.typography.caption,
    color: '#D4DAE8',
    fontWeight: '600',
  },
  controlDisabled: {
    opacity: 0.55,
  },
});
