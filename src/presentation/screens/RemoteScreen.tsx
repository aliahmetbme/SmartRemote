import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector } from '../../store/hooks';
import {
  selectCapabilities,
  selectConnectionStatus,
  selectSelectedDeviceId,
  selectSavedDevices,
  selectSelectedDevice,
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
import { TVConnectionHeader } from '../components/TVConnectionHeader';
import { RemoteSystemControls } from '../components/RemoteSystemControls';
import { AppShortcutList } from '../components/AppShortcutList';
import { InputShortcutList } from '../components/InputShortcutList';
import { theme } from '../theme';

interface RemoteScreenProps {
  onNavigateToDiscovery?: () => void;
  onNavigateToSettings?: () => void;
}

export const RemoteScreen: React.FC<RemoteScreenProps> = ({
  onNavigateToDiscovery,
  onNavigateToSettings,
}) => {
  const container = useContainer();
  const insets = useSafeAreaInsets();

  const connectionStatus = useAppSelector(selectConnectionStatus);
  const activeDeviceId = useAppSelector(selectSelectedDeviceId);
  const savedDevices = useAppSelector(selectSavedDevices);
  const selectedDevice = useAppSelector(selectSelectedDevice);
  const capabilities = useAppSelector(selectCapabilities);

  const [activeTab, setActiveTab] = useState<RemoteMode>('buttons');
  const [isTouchpadActive, setIsTouchpadActive] = useState<boolean>(false);
  const [isMotionActive, setIsMotionActive] = useState<boolean>(false);
  const [launchingAppId, setLaunchingAppId] = useState<string | null>(null);
  const [isWaking, setIsWaking] = useState<boolean>(false);
  const [_wakeStatusText, setWakeStatusText] = useState<string | null>(null);

  const activeDevice =
    selectedDevice ??
    savedDevices.find(d => d.id === activeDeviceId) ??
    (savedDevices.length > 0 ? savedDevices[0] : null);

  const tvDisplayName = activeDevice
    ? activeDevice.name
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
    } catch {
      // Fallback: direct SSAP launch if alias resolution encountered an issue
      try {
        await container.useCases.sendRemoteCommand.execute({
          type: 'launchApp',
          appId: targetAlias,
        });
      } catch {
        // Non-fatal app launch error
      }
    } finally {
      setLaunchingAppId(null);
    }
  };

  const handlePowerPress = async () => {
    if (isWaking) {
      return;
    }

    // 1. When connected: execute powerOff command
    if (isConnected) {
      handleCommand(
        async () => {
          await container.useCases.powerTV.execute(activeDevice, { isConnected: true });
        },
        'powerOff',
      );
      return;
    }

    // 2. When not connected: require selected TV device for Wake-on-LAN
    if (!activeDevice) {
      Alert.alert('No TV Selected', 'Please select a TV first.');
      return;
    }

    // When not connected: check MAC address configuration
    if (!activeDevice.macAddress) {
      Alert.alert(
        'MAC Address Required',
        "To turn on your TV from standby using Wake-on-LAN, SmartRemote needs your TV's MAC address.\n\nYou can enter it in Settings, or connect while the TV is on to detect it automatically.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go to Settings',
            onPress: () => onNavigateToSettings?.(),
          },
        ],
      );
      return;
    }

    // TV is not connected (Disconnected, Error, Connecting, or Reconnecting)
    // and has a valid MAC: initiate Wake-on-LAN and connection restoration.
    setIsWaking(true);
    setWakeStatusText('Sending Wake packet...');
    try {
      const result = await container.useCases.powerTV.execute(activeDevice, {
        onProgress: stage => {
          if (stage === 'sending') setWakeStatusText('Sending Wake packet...');
          if (stage === 'waiting') setWakeStatusText('Waiting for TV to boot...');
          if (stage === 'connecting') setWakeStatusText('Connecting to TV...');
        },
      });

      if (result.action === 'macRequired') {
        Alert.alert(
          'MAC Address Required',
          "To turn on your TV from standby using Wake-on-LAN, SmartRemote needs your TV's MAC address.\n\nYou can enter it in Settings, or connect while the TV is on to detect it automatically.",
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Go to Settings',
              onPress: () => onNavigateToSettings?.(),
            },
          ],
        );
      } else if (!result.success && result.error) {
        Alert.alert(
          'Wake-on-LAN',
          `Could not connect to the TV after sending Wake-on-LAN.\n\nPlease verify that "TV On With Mobile" or "Turn On via Wi-Fi" is enabled in your LG TV's settings.`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Wake-on-LAN failed';
      Alert.alert('Wake Failed', msg);
    } finally {
      setIsWaking(false);
      setWakeStatusText(null);
    }
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
      {/* 1. Connected TV header & Switch button */}
      <TVConnectionHeader
        tvDisplayName={tvDisplayName}
        connectionStatus={connectionStatus}
        onNavigateToDiscovery={onNavigateToDiscovery}
      />

      {/* 2. 3-Mode Selector: Buttons | Touchpad | Motion */}
      <RemoteModeSelector
        activeMode={activeTab}
        onModeChange={handleTabChange}
      />

      {/* Remote Body Card */}
      <View style={styles.remoteBody}>
        {/* System Controls: Power, Home, Back */}
        <RemoteSystemControls
          isConnected={isConnected}
          hasMacAddress={Boolean(activeDevice?.macAddress)}
          isWaking={isWaking}
          onPowerPress={handlePowerPress}
          onHomePress={() =>
            handleCommand(
              () => container.useCases.sendRemoteCommand.execute({ type: 'home' }),
              'home',
            )
          }
          onBackPress={() =>
            handleCommand(
              () => container.useCases.sendRemoteCommand.execute({ type: 'back' }),
              'back',
            )
          }
        />

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

            {/* 5. Application Shortcuts */}
            <AppShortcutList
              launchingAppId={launchingAppId}
              isConnected={isConnected}
              onLaunchApp={handleLaunchApp}
            />

            {/* 6. Input/Source Shortcuts */}
            <InputShortcutList
              isConnected={isConnected}
              onSelectInput={inputId =>
                handleCommand(
                  () =>
                    container.useCases.sendRemoteCommand.execute({
                      type: 'openInput',
                      inputId,
                    }),
                  `openInput-${inputId}`,
                )
              }
            />
          </View>
        )}

        {activeTab === 'touchpad' && (
          /* Touchpad Mode: Touchpad surface with Rockers accessible underneath */
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
  remoteBody: {
    backgroundColor: '#151924',
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: '#242C3E',
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
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
});
