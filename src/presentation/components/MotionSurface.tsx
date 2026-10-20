import React, { useRef, useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
  PanResponder,
  AppState,
} from 'react-native';
import { useAppSelector } from '../../store/hooks';
import { selectCapabilities, selectConnectionStatus } from '../../store/selectors';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { useContainer } from '../context/ContainerContext';
import {
  MotionPointerController,
  MotionDiagnosticData,
} from '../controllers/MotionPointerController';
import { theme } from '../theme';

export interface MotionSurfaceProps {
  style?: StyleProp<ViewStyle>;
  onActiveChange?: (active: boolean) => void;
}

export const MotionSurface: React.FC<MotionSurfaceProps> = ({ style, onActiveChange }) => {
  const container = useContainer();
  const capabilities = useAppSelector(selectCapabilities);
  const connectionStatus = useAppSelector(selectConnectionStatus);

  const isConnected = connectionStatus === TVConnectionState.Connected;
  const pointerState = capabilities?.pointerControl ?? 'unknown';
  const isPointerSupported = pointerState !== 'unsupported';

  const [isSensorAvailable, setIsSensorAvailable] = useState<boolean | null>(null);
  const [isAiming, setIsAiming] = useState<boolean>(false);
  const [sensitivity, setSensitivity] = useState<number>(1.0);
  const [invertX, setInvertX] = useState<boolean>(false);
  const [invertY, setInvertY] = useState<boolean>(false);
  const [isDiagMode, setIsDiagMode] = useState<boolean>(false);
  const [diagData, setDiagData] = useState<MotionDiagnosticData | null>(null);
  const [recenterNotice, setRecenterNotice] = useState<boolean>(false);

  const controllerRef = useRef<MotionPointerController | null>(null);

  useEffect(() => {
    let isMounted = true;

    const controller = new MotionPointerController(
      container.motionSensorService,
      async (deltaX, deltaY) => {
        if (!isConnected || !isPointerSupported) return;
        await container.useCases.sendRemoteCommand.execute({
          type: 'movePointer',
          deltaX,
          deltaY,
        });
      },
      {
        sensitivity,
        invertX,
        invertY,
        diagnosticMode: isDiagMode,
        onDiagnosticSample: setDiagData,
      },
    );
    controllerRef.current = controller;

    controller.start().then(available => {
      if (isMounted) {
        setIsSensorAvailable(available);
      }
    });

    return () => {
      isMounted = false;
      controller.stop().catch(() => undefined);
      controllerRef.current = null;
    };
    // Re-create controller if container or connection changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, isConnected, isPointerSupported]);

  // Clean up parent scroll lock on unmount
  useEffect(() => {
    return () => {
      onActiveChange?.(false);
    };
  }, [onActiveChange]);

  // Clean up engagement on app backgrounding
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') {
        setIsAiming(false);
        onActiveChange?.(false);
        controllerRef.current?.setEngaged(false);
      }
    });
    return () => {
      subscription.remove();
    };
  }, [onActiveChange]);

  const handleSensitivityChange = (newVal: number) => {
    const clamped = Math.max(0.4, Math.min(3.0, Number(newVal.toFixed(1))));
    setSensitivity(clamped);
    controllerRef.current?.setSensitivity(clamped);
  };

  const handleToggleInvertX = () => {
    const next = !invertX;
    setInvertX(next);
    controllerRef.current?.setInvertX(next);
  };

  const handleToggleInvertY = () => {
    const next = !invertY;
    setInvertY(next);
    controllerRef.current?.setInvertY(next);
  };

  const handleToggleDiag = () => {
    const next = !isDiagMode;
    setIsDiagMode(next);
    controllerRef.current?.setDiagnosticMode(next);
  };

  const recenterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (recenterTimeoutRef.current) {
        clearTimeout(recenterTimeoutRef.current);
      }
    };
  }, []);

  const handleRecenter = () => {
    controllerRef.current?.recenter();
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
        setIsAiming(true);
        onActiveChange?.(true);
        controllerRef.current?.setEngaged(true);
      },

      onPanResponderRelease: () => {
        setIsAiming(false);
        onActiveChange?.(false);
        controllerRef.current?.setEngaged(false);
      },

      onPanResponderTerminate: () => {
        setIsAiming(false);
        onActiveChange?.(false);
        controllerRef.current?.setEngaged(false);
      },
    });
  }, [canAim, onActiveChange]);

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
      <View style={styles.configCard}>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>Sensitivity</Text>
          <View style={styles.stepperContainer}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => handleSensitivityChange(sensitivity - 0.2)}
              testID="motion-sensitivity-minus"
              accessibilityLabel="Decrease Sensitivity"
              accessibilityRole="button"
            >
              <Text style={styles.stepperBtnText}>−</Text>
            </TouchableOpacity>

            <Text style={styles.stepperValue} testID="motion-sensitivity-value">
              {sensitivity.toFixed(1)}x
            </Text>

            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => handleSensitivityChange(sensitivity + 0.2)}
              testID="motion-sensitivity-plus"
              accessibilityLabel="Increase Sensitivity"
              accessibilityRole="button"
            >
              <Text style={styles.stepperBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Direction Inversion Options */}
        <View style={styles.inversionRow}>
          <TouchableOpacity
            style={[styles.togglePill, invertX && styles.togglePillActive]}
            onPress={handleToggleInvertX}
            testID="motion-invert-x-toggle"
            accessibilityLabel="Invert Horizontal Axis"
            accessibilityRole="button"
          >
            <Text style={[styles.togglePillText, invertX && styles.togglePillTextActive]}>
              Invert X: {invertX ? 'ON' : 'OFF'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.togglePill, invertY && styles.togglePillActive]}
            onPress={handleToggleInvertY}
            testID="motion-invert-y-toggle"
            accessibilityLabel="Invert Vertical Axis"
            accessibilityRole="button"
          >
            <Text style={[styles.togglePillText, invertY && styles.togglePillTextActive]}>
              Invert Y: {invertY ? 'ON' : 'OFF'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Diagnostic Mode Toggle (Raw 1:1, Acc & Smooth OFF) */}
        <View style={styles.diagToggleRow}>
          <TouchableOpacity
            style={[styles.diagToggleBtn, isDiagMode && styles.diagToggleBtnActive]}
            onPress={handleToggleDiag}
            testID="motion-diag-toggle"
            accessibilityLabel="Toggle Diagnostic Mode"
            accessibilityRole="button"
          >
            <Text style={[styles.diagToggleBtnText, isDiagMode && styles.diagToggleBtnTextActive]}>
              {isDiagMode ? '✓ DIAGNOSTIC MODE (1:1 RAW) ACTIVE' : 'DIAGNOSTIC MODE: OFF'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Real-time Diagnostics HUD (Visible only when diagnostic mode is enabled) */}
        {isDiagMode && <MotionDiagnosticHUD data={diagData} />}
      </View>

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

export interface MotionDiagnosticHUDProps {
  data: MotionDiagnosticData | null;
}

export const MotionDiagnosticHUD: React.FC<MotionDiagnosticHUDProps> = React.memo(({ data }) => {
  if (!data) return null;
  return (
    <View style={styles.diagCard} testID="motion-diag-card">
      <Text style={styles.diagTitle}>LIVE AXIS DIAGNOSTICS (ACC & SMOOTH OFF)</Text>
      <Text style={styles.diagRow}>
        Gyro: X={data.gyro.x.toFixed(2)} Y={data.gyro.y.toFixed(2)} Z={data.gyro.z.toFixed(2)} rad/s
      </Text>
      <Text style={styles.diagRow}>
        Grav: X={data.gravity.x.toFixed(2)} Y={data.gravity.y.toFixed(2)} Z={data.gravity.z.toFixed(2)}
      </Text>
      <Text style={styles.diagRow}>
        Rates: H(yaw)={data.angularRates.horizontal.toFixed(2)} V(pitch)={data.angularRates.vertical.toFixed(2)}
      </Text>
      <Text style={styles.diagRow}>
        Rate: {data.sampleRateHz ?? 0}Hz ({data.sampleIntervalMs ?? 0}ms) | Send: {data.dispatchedRateHz ?? 0}Hz
      </Text>
      <Text style={styles.diagRowHighlight}>
        Pointer Out: dx={data.pointerDelta.dx} dy={data.pointerDelta.dy} (pending: {data.pendingDelta?.dx ?? 0}, {data.pendingDelta?.dy ?? 0})
      </Text>
    </View>
  );
});

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
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
  },
  statusCardAiming: {
    borderColor: theme.colors.secondary,
    backgroundColor: 'rgba(0, 210, 255, 0.08)',
  },
  statusCardDisabled: {
    opacity: 0.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  statusPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  pulseInactive: {
    backgroundColor: theme.colors.textMuted,
  },
  pulseActive: {
    backgroundColor: theme.colors.secondary,
  },
  statusTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    letterSpacing: 0.8,
  },
  statusTitleAiming: {
    color: theme.colors.secondary,
  },
  statusDescription: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  aimSurface: {
    width: '100%',
    height: 180,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  aimSurfacePressed: {
    borderColor: theme.colors.secondary,
    backgroundColor: 'rgba(0, 210, 255, 0.12)',
    shadowColor: theme.colors.secondary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  surfaceDisabled: {
    opacity: 0.4,
  },
  aimReticle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  reticleRing: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: theme.colors.borderActive,
    borderStyle: 'dashed',
  },
  reticleRingActive: {
    borderColor: theme.colors.secondary,
    transform: [{ scale: 1.1 }],
  },
  reticleDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.colors.textMuted,
  },
  reticleDotActive: {
    backgroundColor: theme.colors.secondary,
    transform: [{ scale: 1.25 }],
  },
  aimSurfaceLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  aimSurfaceLabelPressed: {
    color: theme.colors.secondary,
  },
  aimSurfaceSublabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  selectBtn: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  selectBtnText: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  recenterBtn: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  recenterBtnText: {
    color: theme.colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  configCard: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  configLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  stepperBtn: {
    width: 38,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  stepperValue: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.secondary,
    paddingHorizontal: theme.spacing.sm,
    minWidth: 44,
    textAlign: 'center',
  },
  inversionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: 4,
  },
  togglePill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  togglePillActive: {
    borderColor: theme.colors.secondary,
    backgroundColor: 'rgba(0, 210, 255, 0.1)',
  },
  togglePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  togglePillTextActive: {
    color: theme.colors.secondary,
  },
  diagToggleRow: {
    marginTop: theme.spacing.sm,
    width: '100%',
  },
  diagToggleBtn: {
    width: '100%',
    paddingVertical: 7,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diagToggleBtnActive: {
    borderColor: '#FFB800',
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
  },
  diagToggleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 0.5,
  },
  diagToggleBtnTextActive: {
    color: '#FFB800',
  },
  diagCard: {
    marginTop: theme.spacing.sm,
    width: '100%',
    padding: theme.spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: '#FFB800',
  },
  diagTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFB800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  diagRow: {
    fontSize: 11,
    fontFamily: 'Courier',
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  diagRowHighlight: {
    fontSize: 12,
    fontFamily: 'Courier',
    fontWeight: '700',
    color: theme.colors.secondary,
    marginTop: 2,
  },
  instructionsContainer: {
    width: '100%',
    paddingHorizontal: theme.spacing.xs,
  },
  instructionLine: {
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 18,
    marginBottom: 2,
  },
  highlightText: {
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
});
