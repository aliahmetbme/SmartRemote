import React, { useRef, useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
  PanResponder,
} from 'react-native';
import { useContainer } from '../context/ContainerContext';
import { useMotionPointer } from '../hooks/useMotionPointer';
import { MotionCalibrationBar } from './MotionCalibrationBar';
import { MotionDiagnosticOverlay } from './MotionDiagnosticOverlay';
import { theme } from '../theme';

export interface MotionSurfaceProps {
  style?: StyleProp<ViewStyle>;
  onActiveChange?: (active: boolean) => void;
}

export const MotionSurface: React.FC<MotionSurfaceProps> = ({ style, onActiveChange }) => {
  const container = useContainer();
  const [recenterNotice, setRecenterNotice] = useState<boolean>(false);
  const recenterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    isConnected,
    isPointerSupported,
    isSensorAvailable,
    isAiming,
    sensitivity,
    setSensitivity,
    invertX,
    setInvertX,
    invertY,
    setInvertY,
    isDiagMode,
    setIsDiagMode,
    diagData,
    setEngaged,
    recenter,
  } = useMotionPointer({ onActiveChange });

  useEffect(() => {
    return () => {
      if (recenterTimeoutRef.current) {
        clearTimeout(recenterTimeoutRef.current);
      }
    };
  }, []);

  const handleSensitivityChange = (newVal: number) => {
    const clamped = Math.max(0.4, Math.min(3.0, Number(newVal.toFixed(1))));
    setSensitivity(clamped);
  };

  const handleToggleInvertX = () => {
    setInvertX(!invertX);
  };

  const handleToggleInvertY = () => {
    setInvertY(!invertY);
  };

  const handleToggleDiag = () => {
    setIsDiagMode(!isDiagMode);
  };

  const handleRecenter = () => {
    recenter();
    setRecenterNotice(true);
    if (recenterTimeoutRef.current) {
      clearTimeout(recenterTimeoutRef.current);
    }
    recenterTimeoutRef.current = setTimeout(() => {
      setRecenterNotice(false);
    }, 1500);
  };

  const handleSelectClick = () => {
    if (!isConnected || !isPointerSupported) return;
    container.useCases.sendRemoteCommand
      .execute({ type: 'select' })
      .catch(() => undefined);
  };

  const canAim = isConnected && isPointerSupported && isSensorAvailable !== false;

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => canAim,
      onMoveShouldSetPanResponder: () => canAim,
      onStartShouldSetPanResponderCapture: () => canAim,
      onMoveShouldSetPanResponderCapture: () => canAim,
      // Refuse to yield responder status once active so parent ScrollView cannot steal drags
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: () => {
        if (!canAim) return;
        setEngaged(true);
      },

      onPanResponderRelease: () => {
        setEngaged(false);
      },

      onPanResponderTerminate: () => {
        setEngaged(false);
      },
    });
  }, [canAim, setEngaged]);

  return (
    <View style={[styles.container, style]} testID="motion-surface">
      {/* Availability Banners */}
      {!isPointerSupported && (
        <View style={styles.warningBanner} testID="motion-unsupported-banner">
          <Text style={styles.warningText}>
            Pointer control is not supported by this TV.
          </Text>
        </View>
      )}

      {isSensorAvailable === false && (
        <View style={styles.warningBanner} testID="motion-sensor-unavailable-banner">
          <Text style={styles.warningText}>
            Device motion sensors are not available on this device.
          </Text>
        </View>
      )}

      {/* State & Pointer Feedback Indicator */}
      <View
        style={[
          styles.statusCard,
          isAiming && styles.statusCardAiming,
          !canAim && styles.statusCardDisabled,
        ]}
        testID="motion-state-indicator"
      >
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusPulse,
              isAiming ? styles.pulseActive : styles.pulseInactive,
            ]}
          />
          <Text style={[styles.statusTitle, isAiming && styles.statusTitleAiming]}>
            {isAiming ? 'AIMING ACTIVE' : 'MOTION STANDBY'}
          </Text>
        </View>
        <Text style={styles.statusDescription}>
          {isAiming
            ? 'Rotate / tilt your iPhone to guide the TV pointer'
            : 'Press and hold the Aim button below to move pointer'}
        </Text>
      </View>

      {/* Main Hold-to-Move Trigger Surface (PanResponder isolated from ScrollView) */}
      <View
        {...panResponder.panHandlers}
        style={[
          styles.aimSurface,
          isAiming && styles.aimSurfacePressed,
          !canAim && styles.surfaceDisabled,
        ]}
        testID="motion-hold-to-move-btn"
        accessible={true}
        accessibilityLabel="Hold to Aim TV Pointer"
        accessibilityRole="button"
        accessibilityHint="Keep pressed and rotate your iPhone to move the cursor on screen"
      >
        <View style={styles.aimReticle}>
          <View style={[styles.reticleRing, isAiming && styles.reticleRingActive]} />
          <View style={[styles.reticleDot, isAiming && styles.reticleDotActive]} />
        </View>
        <Text style={[styles.aimSurfaceLabel, isAiming && styles.aimSurfaceLabelPressed]}>
          {isAiming ? 'AIMING...' : 'HOLD TO AIM'}
        </Text>
        <Text style={styles.aimSurfaceSublabel}>Keep finger pressed while moving phone</Text>
      </View>

      {/* Action Row: Click / Select and Recenter */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.selectBtn, !isConnected && styles.btnDisabled]}
          disabled={!isConnected}
          onPress={handleSelectClick}
          testID="motion-select-btn"
          accessibilityLabel="Click / Select"
          accessibilityRole="button"
        >
          <Text style={styles.selectBtnText}>SELECT / CLICK</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.recenterBtn, !canAim && styles.btnDisabled]}
          disabled={!canAim}
          onPress={handleRecenter}
          testID="motion-recenter-btn"
          accessibilityLabel="Recenter Pointer"
          accessibilityRole="button"
        >
          <Text style={styles.recenterBtnText}>
            {recenterNotice ? '✓ CENTERED' : 'RECENTER'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sensitivity & Calibration Controls */}
      <MotionCalibrationBar
        sensitivity={sensitivity}
        onSensitivityChange={handleSensitivityChange}
        invertX={invertX}
        onToggleInvertX={handleToggleInvertX}
        invertY={invertY}
        onToggleInvertY={handleToggleInvertY}
        isDiagMode={isDiagMode}
        onToggleDiag={handleToggleDiag}
      >
        {isDiagMode && <MotionDiagnosticOverlay data={diagData} />}
      </MotionCalibrationBar>

      {/* Brief Usage Instructions */}
      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionLine}>
          • Point phone at your TV like an LG Magic Remote.
        </Text>
        <Text style={styles.instructionLine}>
          • Hold <Text style={styles.highlightText}>HOLD TO AIM</Text> and move or rotate to guide the pointer.
        </Text>
        <Text style={styles.instructionLine}>
          • Release to freeze the cursor. Tap <Text style={styles.highlightText}>SELECT</Text> to click items.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  warningBanner: {
    width: '100%',
    backgroundColor: 'rgba(255, 82, 82, 0.15)',
    borderColor: theme.colors.error,
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  warningText: {
    color: theme.colors.error,
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
  statusCard: {
    width: '100%',
    backgroundColor: '#121622',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: '#252D3F',
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  statusCardAiming: {
    borderColor: '#4ADE80',
    backgroundColor: '#0E1F18',
  },
  statusCardDisabled: {
    opacity: 0.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  pulseActive: {
    backgroundColor: '#4ADE80',
  },
  pulseInactive: {
    backgroundColor: '#65738E',
  },
  statusTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8A9BB5',
    letterSpacing: 1.2,
  },
  statusTitleAiming: {
    color: '#4ADE80',
  },
  statusDescription: {
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  aimSurface: {
    width: '100%',
    height: 140,
    backgroundColor: '#161B26',
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: '#2B354C',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  aimSurfacePressed: {
    borderColor: '#4ADE80',
    backgroundColor: '#12261C',
    borderStyle: 'solid',
  },
  surfaceDisabled: {
    opacity: 0.4,
  },
  aimReticle: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  reticleRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#3D4A66',
  },
  reticleRingActive: {
    borderColor: '#4ADE80',
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  reticleDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#65738E',
  },
  reticleDotActive: {
    backgroundColor: '#4ADE80',
  },
  aimSurfaceLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#D4DAE8',
    letterSpacing: 1.5,
  },
  aimSurfaceLabelPressed: {
    color: '#4ADE80',
  },
  aimSurfaceSublabel: {
    fontSize: 12,
    color: '#65738E',
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  selectBtn: {
    backgroundColor: '#1B293A',
    borderColor: '#2C4A6F',
    marginRight: 6,
  },
  selectBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.secondary,
    letterSpacing: 0.8,
  },
  recenterBtn: {
    backgroundColor: '#1B2130',
    borderColor: '#2B354C',
    marginLeft: 6,
  },
  recenterBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B6BECE',
    letterSpacing: 0.8,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  instructionsContainer: {
    width: '100%',
    backgroundColor: '#10141E',
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
  },
  instructionLine: {
    fontSize: 12,
    color: '#65738E',
    lineHeight: 18,
    marginVertical: 2,
  },
  highlightText: {
    color: '#D4DAE8',
    fontWeight: '600',
  },
});
