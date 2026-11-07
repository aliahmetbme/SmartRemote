import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  PanResponder,
  type GestureResponderEvent,
} from 'react-native';

export const AIM_HOLD_DELAY_MS = 400;
const TAP_SLOP = 12;
type AimState = 'idle' | 'candidate' | 'aiming' | 'released' | 'cancelled';
interface AimOptions {
  canSelect: () => boolean;
  canAim: () => boolean;
  setEngaged: (engaged: boolean) => void;
  select: () => void;
  onActiveChange?: (active: boolean) => void;
}

/** One responder owns tap/hold recognition. Cancelled/held presses never click. */
export function useAimGesture(options: AimOptions) {
  const latest = useRef(options);
  latest.current = options;
  const state = useRef<AimState>('idle');
  const [phase, setPhase] = useState<AimState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressedAt = useRef(0);
  const origin = useRef({ x: 0, y: 0 });
  const bounds = useRef({ width: 0, height: 0, x: 0, y: 0 });
  const mounted = useRef(true);
  const foreground = useRef(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  const transition = useCallback((next: AimState) => {
    state.current = next;
    if (mounted.current) setPhase(next);
  }, []);
  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const cancel = useCallback(() => {
    clearTimer();
    if (state.current !== 'candidate' && state.current !== 'aiming') return;
    transition('cancelled');
    latest.current.setEngaged(false);
    latest.current.onActiveChange?.(false);
  }, [clearTimer, transition]);
  const inside = useCallback((event: GestureResponderEvent) => {
    const b = bounds.current;
    const { pageX, pageY } = event.nativeEvent;
    return (
      b.width > 0 &&
      b.height > 0 &&
      pageX >= b.x &&
      pageX <= b.x + b.width &&
      pageY >= b.y &&
      pageY <= b.y + b.height
    );
  }, []);
  const handlers = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () =>
          mounted.current && foreground.current && latest.current.canSelect(),
        onPanResponderTerminationRequest: () => true,
        onPanResponderGrant: event => {
          cancel();
          if (
            !mounted.current ||
            !foreground.current ||
            !latest.current.canSelect()
          )
            return;
          const { pageX, pageY, locationX, locationY } = event.nativeEvent;
          bounds.current.x = pageX - locationX;
          bounds.current.y = pageY - locationY;
          pressedAt.current = Date.now();
          origin.current = { x: pageX, y: pageY };
          transition('candidate');
          latest.current.onActiveChange?.(true);
          timer.current = setTimeout(() => {
            timer.current = null;
            if (state.current !== 'candidate') return;
            if (
              !mounted.current ||
              !foreground.current ||
              !latest.current.canSelect()
            ) {
              cancel();
              return;
            }
            // Consume long holds even when sensors are unavailable: never convert to a click.
            transition('aiming');
            if (latest.current.canAim()) latest.current.setEngaged(true);
          }, AIM_HOLD_DELAY_MS);
        },
        onPanResponderStart: event => {
          if (event.nativeEvent.touches?.length > 1) cancel();
        },
        onPanResponderMove: event => {
          const { pageX, pageY } = event.nativeEvent;
          const moved = Math.hypot(
            pageX - origin.current.x,
            pageY - origin.current.y,
          );
          if (
            !inside(event) ||
            event.nativeEvent.touches?.length > 1 ||
            (state.current === 'candidate' && moved > TAP_SLOP)
          )
            cancel();
        },
        onPanResponderRelease: event => {
          const click =
            state.current === 'candidate' &&
            Date.now() - pressedAt.current < AIM_HOLD_DELAY_MS &&
            inside(event) &&
            Math.hypot(
              event.nativeEvent.pageX - origin.current.x,
              event.nativeEvent.pageY - origin.current.y,
            ) <= TAP_SLOP &&
            foreground.current &&
            latest.current.canSelect();
          const active =
            state.current === 'candidate' || state.current === 'aiming';
          clearTimer();
          if (!active) return;
          transition('released');
          latest.current.setEngaged(false);
          latest.current.onActiveChange?.(false);
          if (click) latest.current.select();
        },
        onPanResponderTerminate: cancel,
      }),
    [cancel, clearTimer, inside, transition],
  );
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', next => {
      foreground.current = next === 'active';
      if (!foreground.current) cancel();
    });
    return () => {
      mounted.current = false;
      cancel();
      clearTimer();
      subscription.remove();
    };
  }, [cancel, clearTimer]);
  return {
    phase,
    cancel,
    panHandlers: handlers.panHandlers,
    onLayout: (width: number, height: number) => {
      bounds.current.width = width;
      bounds.current.height = height;
    },
    accessibilityTap: () => {
      if (state.current === 'candidate' || state.current === 'aiming') {
        cancel();
        return;
      }
      if (mounted.current && foreground.current && latest.current.canSelect())
        latest.current.select();
    },
  };
}
