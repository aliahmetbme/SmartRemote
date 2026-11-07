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
          testID="pointer-recenter"
          style={[
            styles.recenter,
            (disabled || pointer.motion.isSensorAvailable !== true) &&
              styles.disabled,
          ]}
        >
          <Text style={styles.secondary}>Recenter</Text>
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
  recenter: {
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
