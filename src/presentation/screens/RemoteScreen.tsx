import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
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
import { NavigationDirection } from '../../domain/enums/RemoteKey';
import { TVCapability } from '../../domain/entities/TVCapabilities';
import { useContainer } from '../context/ContainerContext';
import { Touchpad } from '../components/Touchpad';
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

  const [activeTab, setActiveTab] = useState<'buttons' | 'touchpad'>('buttons');

  const activeDevice = savedDevices.find(d => d.id === activeDeviceId);
  const tvDisplayName = activeDevice
    ? activeDevice.name
    : activeDeviceId
    ? `LG TV (${activeDeviceId})`
    : 'No TV Selected';
  const isConnected = connectionStatus === TVConnectionState.Connected;

  const isCapable = (cap: TVCapability): boolean => {
    if (!capabilities) return false;
    return capabilities[cap] !== 'unsupported';
  };

  const handleCommand = (action: () => Promise<void>, _operationName: string) => {
    if (!isConnected) return;
    action().catch(() => {
      // Non-fatal command error
    });
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

  const renderVolumeRocker = () => {
    const isVolCapable = isCapable('volumeControl');
    const isMuteCapable = isCapable('muteControl');

    return (
      <View style={styles.rockerColumn}>
        <TouchableOpacity
          style={[
            styles.rockerButton,
            styles.rockerTop,
            (!isConnected || !isVolCapable) && styles.controlDisabled,
          ]}
          disabled={!isConnected || !isVolCapable}
          onPress={() =>
            handleCommand(
              () => container.useCases.sendRemoteCommand.execute({ type: 'volumeUp' }),
              'volumeUp',
            )
          }
          testID="btn-vol-up"
          accessibilityLabel="Volume Up"
          accessibilityRole="button"
        >
          <Text style={styles.rockerLabel}>VOL +</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.rockerButton,
            styles.rockerCenter,
            (!isConnected || !isMuteCapable) && styles.controlDisabled,
          ]}
          disabled={!isConnected || !isMuteCapable}
          onPress={() =>
            handleCommand(
              () => container.useCases.sendRemoteCommand.execute({ type: 'mute' }),
              'mute',
            )
          }
          testID="btn-mute"
          accessibilityLabel="Mute"
          accessibilityRole="button"
        >
          <Text style={styles.muteLabel}>MUTE</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.rockerButton,
            styles.rockerBottom,
            (!isConnected || !isVolCapable) && styles.controlDisabled,
          ]}
          disabled={!isConnected || !isVolCapable}
          onPress={() =>
            handleCommand(
              () => container.useCases.sendRemoteCommand.execute({ type: 'volumeDown' }),
              'volumeDown',
            )
          }
          testID="btn-vol-down"
          accessibilityLabel="Volume Down"
          accessibilityRole="button"
        >
          <Text style={styles.rockerLabel}>VOL -</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderChannelRocker = () => {
    const isChCapable = isCapable('channelControl');

    return (
      <View style={styles.rockerColumn}>
        <TouchableOpacity
          style={[
            styles.rockerButton,
            styles.rockerTop,
            (!isConnected || !isChCapable) && styles.controlDisabled,
          ]}
          disabled={!isConnected || !isChCapable}
          onPress={() =>
            handleCommand(
              () => container.useCases.sendRemoteCommand.execute({ type: 'channelUp' }),
              'channelUp',
            )
          }
          testID="btn-ch-up"
          accessibilityLabel="Channel Up"
          accessibilityRole="button"
        >
          <Text style={styles.rockerLabel}>CH +</Text>
        </TouchableOpacity>

        <View style={[styles.rockerButton, styles.rockerCenter, styles.rockerPlaceholder]}>
          <View style={styles.rockerDividerDot} />
        </View>

        <TouchableOpacity
          style={[
            styles.rockerButton,
            styles.rockerBottom,
            (!isConnected || !isChCapable) && styles.controlDisabled,
          ]}
          disabled={!isConnected || !isChCapable}
          onPress={() =>
            handleCommand(
              () => container.useCases.sendRemoteCommand.execute({ type: 'channelDown' }),
              'channelDown',
            )
          }
          testID="btn-ch-down"
          accessibilityLabel="Channel Down"
          accessibilityRole="button"
        >
          <Text style={styles.rockerLabel}>CH -</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderDPad = () => (
    <View style={styles.dpadContainer} testID="dpad-cluster">
      {/* Up */}
      <TouchableOpacity
        style={[styles.dpadArrow, styles.dpadUp, !isConnected && styles.controlDisabled]}
        disabled={!isConnected}
        onPress={() =>
          handleCommand(
            () =>
              container.useCases.sendRemoteCommand.execute({
                type: 'navigate',
                direction: NavigationDirection.Up,
              }),
            'navigateUp',
          )
        }
        testID="btn-nav-up"
        accessibilityLabel="Navigate Up"
        accessibilityRole="button"
      >
        <Text style={styles.arrowText}>▲</Text>
      </TouchableOpacity>

      {/* Left */}
      <TouchableOpacity
        style={[styles.dpadArrow, styles.dpadLeft, !isConnected && styles.controlDisabled]}
        disabled={!isConnected}
        onPress={() =>
          handleCommand(
            () =>
              container.useCases.sendRemoteCommand.execute({
                type: 'navigate',
                direction: NavigationDirection.Left,
              }),
            'navigateLeft',
          )
        }
        testID="btn-nav-left"
        accessibilityLabel="Navigate Left"
        accessibilityRole="button"
      >
        <Text style={styles.arrowText}>◀</Text>
      </TouchableOpacity>

      {/* Center OK */}
      <TouchableOpacity
        style={[styles.dpadCenter, !isConnected && styles.controlDisabled]}
        disabled={!isConnected}
        onPress={() =>
          handleCommand(
            () => container.useCases.sendRemoteCommand.execute({ type: 'select' }),
            'select',
          )
        }
        testID="btn-nav-ok"
        accessibilityLabel="OK / Select"
        accessibilityRole="button"
      >
        <Text style={styles.dpadCenterText}>OK</Text>
      </TouchableOpacity>

      {/* Right */}
      <TouchableOpacity
        style={[styles.dpadArrow, styles.dpadRight, !isConnected && styles.controlDisabled]}
        disabled={!isConnected}
        onPress={() =>
          handleCommand(
            () =>
              container.useCases.sendRemoteCommand.execute({
                type: 'navigate',
                direction: NavigationDirection.Right,
              }),
            'navigateRight',
          )
        }
        testID="btn-nav-right"
        accessibilityLabel="Navigate Right"
        accessibilityRole="button"
      >
        <Text style={styles.arrowText}>▶</Text>
      </TouchableOpacity>

      {/* Down */}
      <TouchableOpacity
        style={[styles.dpadArrow, styles.dpadDown, !isConnected && styles.controlDisabled]}
        disabled={!isConnected}
        onPress={() =>
          handleCommand(
            () =>
              container.useCases.sendRemoteCommand.execute({
                type: 'navigate',
                direction: NavigationDirection.Down,
              }),
            'navigateDown',
          )
        }
        testID="btn-nav-down"
        accessibilityLabel="Navigate Down"
        accessibilityRole="button"
      >
        <Text style={styles.arrowText}>▼</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingTop: Math.max(insets.top, 16) }]}
      testID="remote-screen"
    >
      {/* Top Bar: TV Name, Status, Switch TV Button */}
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

      {/* Mode Switcher: Buttons vs Touchpad */}
      <View style={styles.modeSwitcherRow}>
        <TouchableOpacity
          style={[styles.modeTab, activeTab === 'buttons' && styles.modeTabActive]}
          onPress={() => setActiveTab('buttons')}
          testID="tab-buttons"
          accessibilityRole="button"
          accessibilityLabel="Buttons Mode"
        >
          <Text style={[styles.modeTabText, activeTab === 'buttons' && styles.modeTabTextActive]}>
            Buttons
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeTab, activeTab === 'touchpad' && styles.modeTabActive]}
          onPress={() => setActiveTab('touchpad')}
          testID="tab-touchpad"
          accessibilityRole="button"
          accessibilityLabel="Touchpad Mode"
        >
          <Text style={[styles.modeTabText, activeTab === 'touchpad' && styles.modeTabTextActive]}>
            Touchpad
          </Text>
        </TouchableOpacity>
      </View>

      {/* Remote Body Card */}
      <View style={styles.remoteBody}>
        {/* System Row: Power, Home, Back */}
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
        {activeTab === 'buttons' ? (
          /* Buttons Mode: Rockers + D-Pad Navigation */
          <View style={styles.middleControlRow}>
            {renderVolumeRocker()}
            {renderDPad()}
            {renderChannelRocker()}
          </View>
        ) : (
          /* Touchpad Mode: Generous gesture surface with Rockers accessible underneath */
          <View style={styles.touchpadSection}>
            <Touchpad style={styles.touchpadExpandedSurface} />
            <View style={styles.touchpadRockersRow}>
              {renderVolumeRocker()}
              {renderChannelRocker()}
            </View>
          </View>
        )}

        {/* App Shortcuts (Rendered if appLaunching capability is not unsupported) */}
        {isCapable('appLaunching') && (
          <View style={styles.shortcutsSection} testID="app-shortcuts-section">
            <Text style={styles.sectionTitle}>Apps</Text>
            <View style={styles.chipsRow}>
              {['netflix', 'youtube', 'amazon'].map(appId => (
                <TouchableOpacity
                  key={appId}
                  style={[styles.appChip, !isConnected && styles.controlDisabled]}
                  disabled={!isConnected}
                  onPress={() =>
                    handleCommand(
                      () =>
                        container.useCases.sendRemoteCommand.execute({
                          type: 'launchApp',
                          appId,
                        }),
                      `launchApp-${appId}`,
                    )
                  }
                  testID={`btn-app-${appId}`}
                  accessibilityLabel={`Launch ${appId}`}
                  accessibilityRole="button"
                >
                  <Text style={styles.chipText}>{appId.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Input Switching (Rendered if inputSwitching capability is not unsupported) */}
        {isCapable('inputSwitching') && (
          <View style={styles.shortcutsSection} testID="input-switching-section">
            <Text style={styles.sectionTitle}>Inputs</Text>
            <View style={styles.chipsRow}>
              {['HDMI_1', 'HDMI_2', 'AV_1'].map(inputId => (
                <TouchableOpacity
                  key={inputId}
                  style={[styles.inputChip, !isConnected && styles.controlDisabled]}
                  disabled={!isConnected}
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
  modeSwitcherRow: {
    flexDirection: 'row',
    backgroundColor: '#131722',
    borderRadius: theme.borderRadius.full,
    padding: 3,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#262F42',
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.full,
  },
  modeTabActive: {
    backgroundColor: '#263045',
    borderWidth: 1,
    borderColor: '#3E4D6E',
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7E879B',
  },
  modeTabTextActive: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
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
  rockerColumn: {
    width: 66,
    height: 196,
    borderRadius: 33,
    backgroundColor: '#1B2130',
    borderWidth: 1.5,
    borderColor: '#2B354C',
    overflow: 'hidden',
  },
  rockerButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rockerTop: {
    borderBottomWidth: 1,
    borderBottomColor: '#252D3F',
  },
  rockerCenter: {
    borderBottomWidth: 1,
    borderBottomColor: '#252D3F',
  },
  rockerBottom: {},
  rockerPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  rockerDividerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3B455E',
  },
  rockerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B6BECE',
  },
  muteLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E07A5F',
  },
  dpadContainer: {
    width: 196,
    height: 196,
    borderRadius: 98,
    backgroundColor: '#121620',
    borderWidth: 1.5,
    borderColor: '#2B354C',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  dpadArrow: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dpadUp: {
    top: 4,
    width: 60,
    height: 44,
  },
  dpadDown: {
    bottom: 4,
    width: 60,
    height: 44,
  },
  dpadLeft: {
    left: 4,
    width: 44,
    height: 60,
  },
  dpadRight: {
    right: 4,
    width: 44,
    height: 60,
  },
  arrowText: {
    fontSize: 18,
    color: '#B6BECE',
  },
  dpadCenter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#263045',
    borderWidth: 2,
    borderColor: '#3F4E70',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  dpadCenterText: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.textPrimary,
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
  },
  inputChip: {
    backgroundColor: '#1A2130',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: '#2B354C',
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
