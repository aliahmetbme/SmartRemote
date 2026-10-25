import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MotionDiagnosticData } from '../controllers/MotionPointerController';

export interface MotionDiagnosticOverlayProps {
  data: MotionDiagnosticData | null;
}

/**
 * Pure presentational component rendering real-time gyroscope, gravity,
 * angular velocity rates, and dispatch diagnostics HUD.
 */
export const MotionDiagnosticOverlay: React.FC<MotionDiagnosticOverlayProps> = React.memo(
  ({ data }) => {
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
  },
);

const styles = StyleSheet.create({
  diagCard: {
    marginTop: 10,
    backgroundColor: '#0A0E18',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#25354F',
    padding: 10,
  },
  diagTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E07A5F',
    marginBottom: 6,
    letterSpacing: 0.8,
  },
  diagRow: {
    fontSize: 11,
    color: '#8A9BB5',
    fontFamily: 'Courier',
    marginVertical: 1,
  },
  diagRowHighlight: {
    fontSize: 11,
    color: '#4ADE80',
    fontWeight: '700',
    fontFamily: 'Courier',
    marginTop: 3,
  },
});
