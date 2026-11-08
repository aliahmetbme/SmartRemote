import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useHybridPointer } from '../hooks/useHybridPointer';
import { Touchpad } from './Touchpad';
import { theme, usePresentationLayout, useRemoteDensity } from '../theme';
interface PointerSurfaceProps {
  onActiveChange?: (active: boolean) => void;
}
export const PointerSurface = ({ onActiveChange }: PointerSurfaceProps) => {
  const pointer = useHybridPointer(onActiveChange);
  const layout = usePresentationLayout();
  const density = useRemoteDensity();
  const disabled = !pointer.connected || !pointer.supported;
  return (
    <View testID="pointer-surface" style={styles.container}>
      <Touchpad
        style={styles.touchpad}
        onCancel={pointer.cancelTouch}
        onActiveChange={pointer.touchChanged}
        onMove={pointer.move}
        onClick={pointer.tap}
      />
      <View style={[styles.actions, layout.stackForms && styles.stacked]}>
        <TouchableOpacity
          onPressIn={pointer.selectPressIn}
          onPressOut={pointer.selectPressOut}
          onPress={pointer.select}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Select pointer target"
          accessibilityState={{ disabled }}
          testID="pointer-select"
          style={[
            styles.select,
            density && { borderRadius: density.smallControlRadius },
            disabled && styles.disabled,
          ]}
        >
          <Text style={styles.text}>Select</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={pointer.recenter}
          disabled={disabled || pointer.motion.isSensorAvailable !== true}
          accessibilityRole="button"
          accessibilityLabel="Recenter motion pointer."
          accessibilityHint="Resets the motion reference without selecting anything"
          activeOpacity={0.65}
          testID="pointer-recenter"
          style={[
            styles.recenter,
            (disabled || pointer.motion.isSensorAvailable !== true) &&
              styles.disabled,
          ]}
        >
          <View style={styles.recenterContent}>
            <View accessible={false} style={styles.target}>
              <View style={styles.targetDot} />
            </View>
            <Text style={styles.secondary}>Recenter</Text>
          </View>
        </TouchableOpacity>
      </View>
      {(pointer.motion.isSensorAvailable === false || pointer.failed) && (
        <Text
          testID="pointer-feedback"
          style={styles.feedback}
          accessibilityLiveRegion="polite"
        >
          {pointer.failed
            ? 'Motion paused. Use the touchpad or Select to continue.'
            : 'Motion unavailable. The touchpad is ready.'}
        </Text>
      )}
    </View>
  );
};
const styles = StyleSheet.create({
  container: { width: '100%', marginBottom: theme.spacing.sm },
  touchpad: { height: 220, marginBottom: theme.spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  stacked: { flexDirection: 'column' },
  select: {
    flexGrow: 1,
    minWidth: 100,
    minHeight: 48,
    padding: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surfaceHighlight,
  },
  recenterContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  target: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.textSecondary,
  },
  recenter: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 14,
    minHeight: 48,
    padding: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: '600' },
  secondary: { color: theme.colors.secondary, fontSize: 14, fontWeight: '600' },
  feedback: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: theme.spacing.xs,
  },
  disabled: { opacity: 0.5 },
});
