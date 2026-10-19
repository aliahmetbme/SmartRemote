import React, { useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useAppSelector } from '../../store/hooks';
import { selectCapabilities, selectConnectionStatus } from '../../store/selectors';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { useContainer } from '../context/ContainerContext';
import { theme } from '../theme';

export interface TouchpadProps {
  throttleMs?: number;
  style?: StyleProp<ViewStyle>;
}

export const Touchpad: React.FC<TouchpadProps> = ({ throttleMs = 25, style }) => {
  const container = useContainer();
  const capabilities = useAppSelector(selectCapabilities);
  const connectionStatus = useAppSelector(selectConnectionStatus);
  const isConnected = connectionStatus === TVConnectionState.Connected;

  const pointerState = capabilities?.pointerControl ?? 'unknown';
  const isAvailable = pointerState !== 'unsupported';

  const [isPressing, setIsPressing] = useState(false);

  const lastMoveTimeRef = useRef<number>(0);
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchStartTimeRef = useRef<number>(0);
  const hasMovedRef = useRef<boolean>(false);

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => isConnected && isAvailable,
      onMoveShouldSetPanResponder: () => isConnected && isAvailable,

      onPanResponderGrant: (evt: GestureResponderEvent) => {
        setIsPressing(true);
        touchStartTimeRef.current = Date.now();
        hasMovedRef.current = false;
        lastMoveTimeRef.current = Date.now();
        lastPosRef.current = {
          x: evt.nativeEvent.pageX,
          y: evt.nativeEvent.pageY,
        };
      },

      onPanResponderMove: (evt: GestureResponderEvent, _gestureState: PanResponderGestureState) => {
        const now = Date.now();
        const currentX = evt.nativeEvent.pageX;
        const currentY = evt.nativeEvent.pageY;

        const deltaX = Math.round(currentX - lastPosRef.current.x);
        const deltaY = Math.round(currentY - lastPosRef.current.y);

        if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
          hasMovedRef.current = true;
        }

        // Throttle dispatching relative pointer deltas
        if (now - lastMoveTimeRef.current >= throttleMs) {
          lastMoveTimeRef.current = now;
          lastPosRef.current = { x: currentX, y: currentY };

          if (deltaX !== 0 || deltaY !== 0) {
            container.useCases.sendRemoteCommand
              .execute({
                type: 'movePointer',
                deltaX,
                deltaY,
              })
              .catch(() => {
                // Non-fatal pointer drop
              });
          }
        }
      },

      onPanResponderRelease: () => {
        setIsPressing(false);
        const duration = Date.now() - touchStartTimeRef.current;

        // Tap-to-click gesture: short touch without significant drag
        if (!hasMovedRef.current && duration < 250) {
          container.useCases.sendRemoteCommand
            .execute({ type: 'select' })
            .catch(() => undefined);
        }
      },

      onPanResponderTerminate: () => {
        setIsPressing(false);
      },
    });
  }, [container, isConnected, isAvailable, throttleMs]);

  if (!isAvailable) {
    return (
      <View style={[styles.container, styles.containerDisabled, style]} testID="touchpad-disabled">
        <Text style={styles.disabledText}>Pointer Control Unsupported by TV</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        isPressing && styles.containerActive,
        !isConnected && styles.containerDisabled,
        style,
      ]}
      testID="touchpad-surface"
      {...panResponder.panHandlers}
    >
      <View style={styles.gridIndicator}>
        <View style={styles.centerDot} />
      </View>
      <Text style={styles.instructionText}>
        {isConnected
          ? 'Swipe to move pointer • Tap to select'
          : 'Connect to TV to use pointer'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 180,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  containerActive: {
    borderColor: theme.colors.secondary,
    backgroundColor: theme.colors.surfaceHighlight,
  },
  containerDisabled: {
    opacity: 0.45,
    borderColor: theme.colors.border,
  },
  gridIndicator: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: theme.colors.borderActive,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  centerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.secondary,
  },
  instructionText: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  disabledText: {
    ...theme.typography.caption,
    color: theme.colors.textDisabled,
    textAlign: 'center',
  },
});
