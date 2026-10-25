import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme';

export interface MotionCalibrationBarProps {
  sensitivity: number;
  onSensitivityChange: (newVal: number) => void;
  invertX: boolean;
  onToggleInvertX: () => void;
  invertY: boolean;
  onToggleInvertY: () => void;
  isDiagMode: boolean;
  onToggleDiag: () => void;
  children?: React.ReactNode;
}

/**
 * Pure presentational component rendering sensitivity adjustment steppers,
 * axis inversion pills, and diagnostic mode toggle.
 */
export const MotionCalibrationBar: React.FC<MotionCalibrationBarProps> = ({
  sensitivity,
  onSensitivityChange,
  invertX,
  onToggleInvertX,
  invertY,
  onToggleInvertY,
  isDiagMode,
  onToggleDiag,
  children,
}) => {
  return (
    <View style={styles.configCard}>
      <View style={styles.configRow}>
        <Text style={styles.configLabel}>Sensitivity</Text>
        <View style={styles.stepperContainer}>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => onSensitivityChange(sensitivity - 0.2)}
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
            onPress={() => onSensitivityChange(sensitivity + 0.2)}
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
          onPress={onToggleInvertX}
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
          onPress={onToggleInvertY}
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
          onPress={onToggleDiag}
          testID="motion-diag-toggle"
          accessibilityLabel="Toggle Diagnostic Mode"
          accessibilityRole="button"
        >
          <Text style={[styles.diagToggleBtnText, isDiagMode && styles.diagToggleBtnTextActive]}>
            {isDiagMode ? '✓ DIAGNOSTIC MODE (1:1 RAW) ACTIVE' : 'DIAGNOSTIC MODE: OFF'}
          </Text>
        </TouchableOpacity>
      </View>

      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  configCard: {
    width: '100%',
    backgroundColor: '#121622',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: '#252D3F',
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    backgroundColor: '#1B2130',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: '#2B354C',
  },
  stepperBtn: {
    width: 38,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#D4DAE8',
  },
  stepperValue: {
    minWidth: 42,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.secondary,
  },
  inversionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  togglePill: {
    flex: 1,
    paddingVertical: 7,
    marginHorizontal: 3,
    backgroundColor: '#1B2130',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: '#2B354C',
    alignItems: 'center',
  },
  togglePillActive: {
    borderColor: theme.colors.secondary,
    backgroundColor: '#1A2938',
  },
  togglePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8A9BB5',
  },
  togglePillTextActive: {
    color: theme.colors.secondary,
  },
  diagToggleRow: {
    marginTop: 8,
  },
  diagToggleBtn: {
    width: '100%',
    paddingVertical: 8,
    backgroundColor: '#161B26',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: '#252D3F',
    alignItems: 'center',
  },
  diagToggleBtnActive: {
    borderColor: '#E07A5F',
    backgroundColor: '#261418',
  },
  diagToggleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8A9BB5',
    letterSpacing: 0.5,
  },
  diagToggleBtnTextActive: {
    color: '#E07A5F',
  },
});
