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
import { NumericKeypad } from '../components/NumericKeypad';
import { PointerSurface } from '../components/PointerSurface';
import { VolumeRocker } from '../components/VolumeRocker';
import { ChannelRocker } from '../components/ChannelRocker';
import { DirectionPad } from '../components/DirectionPad';
import { RemoteMode, RemoteModeSelector } from '../components/RemoteModeSelector';
import { ConnectionRecovery } from '../components/ConnectionRecovery';
import { TVConnectionHeader } from '../components/TVConnectionHeader';
import { RemoteSystemControls } from '../components/RemoteSystemControls';
import { AppShortcutList } from '../components/AppShortcutList';
import { InputShortcutList } from '../components/InputShortcutList';
import { theme, usePresentationLayout, getRemoteGeometry, getRemoteCardLayout, useRemoteDensity, layoutTokens } from '../theme';

interface RemoteScreenProps {
  initialMode?: RemoteMode;
  isFocused?: boolean;
  onNavigateToDiscovery?: () => void;
  onNavigateToSettings?: () => void;
}

export const RemoteScreen: React.FC<RemoteScreenProps> = ({
  initialMode = 'buttons',
  isFocused = true,
  onNavigateToDiscovery,
  onNavigateToSettings,
}) => {
  const container = useContainer();
  const insets = useSafeAreaInsets();
  const layout = usePresentationLayout(insets.left + insets.right);
  const density = useRemoteDensity();
  const { innerWidth, ...cardInsets } = getRemoteCardLayout(layout, density);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [clusterWidth, setClusterWidth] = useState<number | null>(null);
  const geometry = getRemoteGeometry(
    Math.min(innerWidth, clusterWidth ?? innerWidth), viewportHeight, layout.fontScale, Boolean(density),
  );

  const connectionStatus = useAppSelector(selectConnectionStatus);
  const activeDeviceId = useAppSelector(selectSelectedDeviceId);
  const savedDevices = useAppSelector(selectSavedDevices);
  const selectedDevice = useAppSelector(selectSelectedDevice);
  const capabilities = useAppSelector(selectCapabilities);

  const [activeTab, setActiveTab] = useState<RemoteMode>(initialMode);
  const [isPointerActive, setIsPointerActive] = useState<boolean>(false);
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
    ? 'LG TV'
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
    const revision = container.connectionManager.getOperationRevision();
    const isCurrent = () => container.connectionManager.getOperationRevision() === revision;
    setLaunchingAppId(targetAlias);
    try {
      // Resolve app ID through GetInstalledAppsUseCase
      const resolvedId = await container.useCases.getInstalledApps.resolveAppId(targetAlias);
      if (!isCurrent()) return;
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(`[SmartRemote][LaunchApp] Launching alias '${targetAlias}' as '${resolvedId}'`);
      }
      await container.useCases.sendRemoteCommand.execute({
        type: 'launchApp',
        appId: resolvedId,
      });
    } catch {
      if (!isCurrent()) return;
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
    setIsPointerActive(false);
    setActiveTab(tab);
  };

  const volumeRocker = (
    <VolumeRocker
      width={geometry.rockerWidth}
      height={geometry.rockerHeight}
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
  );
  const channelRocker = (
    <ChannelRocker
      width={geometry.rockerWidth}
      height={geometry.rockerHeight}
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
  );
  const directionPad = (
    <DirectionPad
      size={geometry.dpadSize}
      centerDiameter={density?.centerSize}
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
  );
  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="remote-safe-area">
    <ScrollView
      style={styles.container}
      onLayout={event => setViewportHeight(event.nativeEvent.layout.height)}
      contentContainerStyle={[
        styles.contentContainer,
        {
          paddingTop: Math.max(0, 16 - insets.top),
          paddingLeft: layout.pagePadding + insets.left,
          paddingRight: layout.pagePadding + insets.right,
        },
      ]}
      scrollEnabled={!isPointerActive}
      testID="remote-screen"
    >
      {/* 1. Connected TV header & Switch button */}
      <TVConnectionHeader
        tvDisplayName={tvDisplayName}
        connectionStatus={connectionStatus}
        stacked={layout.headerStacked}
        onNavigateToDiscovery={onNavigateToDiscovery}
      />

      <ConnectionRecovery onFindTV={onNavigateToDiscovery} onSettings={onNavigateToSettings}
        onWake={activeDevice?.id === activeDeviceId && activeDevice?.macAddress ? handlePowerPress : undefined} />

      {/* Buttons and Pointer share system controls. */}
      <RemoteModeSelector
        activeMode={activeTab} onModeChange={handleTabChange} stacked={layout.modeStacked}
      />

      {/* Remote Body Card */}
      <View style={[styles.remoteBody, cardInsets, density && { borderRadius: density.cardRadius }]}>
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
            <View
              testID="remote-control-cluster"
              onLayout={event => setClusterWidth(Math.floor(event.nativeEvent.layout.width))}
              style={[styles.controlCluster, density && { marginBottom: density.sectionGap }]}
            >
              {geometry.stacked ? (
                <View style={styles.stackedControls}>
                  {directionPad}
                  <View style={styles.stackedRockers}>{volumeRocker}{channelRocker}</View>
                </View>
              ) : (
                <View style={styles.middleControlRow}>{volumeRocker}{directionPad}{channelRocker}</View>
              )}
            </View>

            {/* 4. NumericKeypad inside Buttons mode */}
            <View style={[styles.keypadContainer, density && styles.compactKeypadContainer]} testID="keypad-buttons-section">
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

        {isFocused && activeTab === 'pointer' && (
          <View style={styles.touchpadSection}>
            <PointerSurface onActiveChange={setIsPointerActive} />
            <View style={styles.touchpadRockersRow}>
              {volumeRocker}
              {channelRocker}
            </View>
          </View>
        )}
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
    maxWidth: layoutTokens.pageMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    flexGrow: 1,
  },
  remoteBody: {
    width: '100%',
    maxWidth: layoutTokens.remoteMaxWidth,
    alignSelf: 'center',
    backgroundColor: theme.colors.remoteCard,
    borderRadius: 28,
    borderColor: theme.colors.remoteCardEdge,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  controlCluster: { marginBottom: 16 },
  stackedControls: { alignItems: 'center', gap: 12 },
  stackedRockers: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, width: '100%' },
  middleControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  compactKeypadContainer: { marginTop: 0 },
  keypadContainer: {
    marginTop: theme.spacing.xs,
    marginBottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchpadSection: {
    marginBottom: theme.spacing.lg,
  },
  touchpadRockersRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  numbersKeypadSurface: {
    marginBottom: 0,
  },
});
