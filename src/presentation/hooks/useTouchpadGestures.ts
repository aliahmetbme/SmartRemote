import { useRef, useMemo, useState, useEffect } from 'react';
import {
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  GestureResponderHandlers,
} from 'react-native';

export interface UseTouchpadGesturesOptions {
  onMove?: (deltaX: number, deltaY: number) => void;
  onClick?: () => void;
  onActiveChange?: (active: boolean) => void;
  enabled?: boolean;
  throttleMs?: number;
}

export interface UseTouchpadGesturesResult {
  panHandlers: GestureResponderHandlers;
  isPressing: boolean;
}

/**
 * Custom hook isolating touch gestures, drag delta tracking, tap-to-click,
 * throttling, and responder lifecycle from TV command execution and UI rendering.
 */
export function useTouchpadGestures(
  options: UseTouchpadGesturesOptions = {},
): UseTouchpadGesturesResult {
  const {
    onMove,
    onClick,
    onActiveChange,
    enabled = true,
    throttleMs = 25,
  } = options;

  const [isPressing, setIsPressing] = useState<boolean>(false);

  const lastMoveTimeRef = useRef<number>(0);
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchStartTimeRef = useRef<number>(0);
  const hasMovedRef = useRef<boolean>(false);

  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Clean up active state on unmount so parent scroll is never permanently locked
  useEffect(() => {
    return () => {
      onActiveChangeRef.current?.(false);
    };
  }, []);

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => enabledRef.current,
      onMoveShouldSetPanResponder: () => enabledRef.current,
      onStartShouldSetPanResponderCapture: () => enabledRef.current,
      onMoveShouldSetPanResponderCapture: () => enabledRef.current,
      // Refuse to yield responder status once active so parent ScrollView cannot steal drags
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (evt: GestureResponderEvent) => {
        setIsPressing(true);
        onActiveChangeRef.current?.(true);
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
            onMoveRef.current?.(deltaX, deltaY);
          }
        }
      },

      onPanResponderRelease: () => {
        setIsPressing(false);
        onActiveChangeRef.current?.(false);
        const duration = Date.now() - touchStartTimeRef.current;

        // Tap-to-click gesture: short touch without significant drag
        if (!hasMovedRef.current && duration < 250) {
          onClickRef.current?.();
        }
      },

      onPanResponderTerminate: () => {
        setIsPressing(false);
        onActiveChangeRef.current?.(false);
      },
    });
  }, [throttleMs]);

  return {
    panHandlers: panResponder.panHandlers,
    isPressing,
  };
}
