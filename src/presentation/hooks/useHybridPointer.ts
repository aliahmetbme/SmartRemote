import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useContainer } from '../context/ContainerContext';
import { useAppSelector } from '../../store/hooks';
import { defaultMotionPreferences } from '../../store/slices/remoteSlice';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { useMotionPointer } from './useMotionPointer';

export const POINTER_RESUME_DELAY_MS = 80;
export type PointerOwner = 'motion' | 'touchpad' | 'selection' | 'suspended';
export function useHybridPointer(onActiveChange?: (active: boolean) => void) {
  const container = useContainer();
  const connected = useAppSelector(
    s => s.connection.status === TVConnectionState.Connected,
  );
  const supported = useAppSelector(
    s => s.tv.capabilities?.pointerControl === 'supported',
  );
  const preferences = useAppSelector(
    s => s.remote.motionPreferences ?? defaultMotionPreferences,
  );
  const hydrated = useAppSelector(s => s.remote.preferencesReady === true);
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  const foregroundRef = useRef(foreground);
  foregroundRef.current = foreground;
  const [epoch, setEpoch] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const owner = useRef<PointerOwner>('suspended');
  const touchActive = useRef(false);
  const touchValid = useRef(false);
  const touchSession = useRef<number | null>(null);
  const inputRevision = useRef(0);
  const resumeNotBefore = useRef(0);
  const selectPressed = useRef(false);
  const selectPressRevision = useRef(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRef = useRef<() => void>(() => undefined);
  const motion = useMotionPointer({
    sampleOnlyWhileEngaged: true,
    isInputCurrent: () => {
      const state = container.store.getState();
      return (
        owner.current === 'motion' &&
        mounted.current &&
        foregroundRef.current &&
        state.connection.status === TVConnectionState.Connected &&
        state.tv.capabilities?.pointerControl === 'supported' &&
        state.remote.preferencesReady === true &&
        state.remote.motionPreferences?.automaticMotion !== false
      );
    },
    onInterruption: () => {
      stopRef.current();
      if (mounted.current) {
        setBlocked(true);
        setFailed(true);
      }
    },
  });
  const latest = useRef({
    foreground,
    connected,
    supported,
    hydrated,
    preferences,
    blocked,
    motion,
    onActiveChange,
  });
  latest.current = {
    foreground,
    connected,
    supported,
    hydrated,
    preferences,
    blocked,
    motion,
    onActiveChange,
  };
  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const suspend = useCallback(() => {
    ++inputRevision.current;
    clearTimer();
    owner.current = 'suspended';
    resumeNotBefore.current = 0;
    latest.current.motion.setEngaged(false);
  }, [clearTimer]);
  stopRef.current = suspend;
  const canUse = useCallback(() => {
    const state = container.store.getState();
    return (
      mounted.current &&
      latest.current.foreground &&
      state.connection.status === TVConnectionState.Connected &&
      state.tv.capabilities?.pointerControl !== 'unsupported'
    );
  }, [container.store]);
  const resume = useCallback(() => {
    const current = latest.current;
    if (
      Date.now() < resumeNotBefore.current ||
      !canUse() ||
      !current.supported ||
      !current.hydrated ||
      current.preferences.automaticMotion === false ||
      current.blocked ||
      current.motion.isSensorAvailable !== true ||
      touchActive.current ||
      owner.current === 'selection'
    )
      return;
    if (owner.current === 'motion') return;
    current.motion.recenter();
    owner.current = 'motion';
    current.motion.setEngaged(true);
  }, [canUse]);
  const resumeSoon = useCallback(() => {
    clearTimer();
    resumeNotBefore.current = Date.now() + POINTER_RESUME_DELAY_MS;
    timer.current = setTimeout(() => {
      timer.current = null;
      resume();
    }, POINTER_RESUME_DELAY_MS);
  }, [clearTimer, resume]);
  useEffect(() => {
    if (
      connected &&
      supported &&
      foreground &&
      hydrated &&
      preferences.automaticMotion !== false &&
      !blocked &&
      motion.isSensorAvailable === true
    )
      resume();
    else suspend();
  }, [
    connected,
    supported,
    foreground,
    hydrated,
    preferences.automaticMotion,
    blocked,
    motion.isSensorAvailable,
    epoch,
    resume,
    suspend,
  ]);
  useEffect(() => {
    mounted.current = true;
    let session = container.connectionManager.getOperationRevision();
    const invalidate = () => {
      suspend();
      touchValid.current = false;
      touchActive.current = false;
      latest.current.onActiveChange?.(false);
      if (mounted.current) {
        setBlocked(false);
        setEpoch(value => value + 1);
      }
    };
    const unsubscribe = container.connectionManager.subscribe(snapshot => {
      const next = container.connectionManager.getOperationRevision();
      if (next !== session || snapshot.state !== TVConnectionState.Connected)
        invalidate();
      session = next;
    });
    const subscription = AppState.addEventListener('change', state => {
      foregroundRef.current = state === 'active';
      latest.current.foreground = state === 'active';
      if (state !== 'active') invalidate();
      else {
        setBlocked(false);
        setEpoch(value => value + 1);
      }
      setForeground(state === 'active');
    });
    return () => {
      mounted.current = false;
      suspend();
      touchValid.current = false;
      latest.current.onActiveChange?.(false);
      unsubscribe();
      subscription.remove();
    };
  }, [container.connectionManager, suspend]);
  const currentTouch = () =>
    canUse() &&
    touchValid.current &&
    touchSession.current === container.connectionManager.getOperationRevision();
  const fail = (revision: number, session: number) => {
    if (
      !mounted.current ||
      revision !== inputRevision.current ||
      session !== container.connectionManager.getOperationRevision()
    )
      return;
    suspend();
    touchValid.current = false;
    setBlocked(true);
    setFailed(true);
  };
  const select = () => {
    if (!canUse()) return;
    suspend();
    owner.current = 'selection';
    setFailed(false);
    const revision = inputRevision.current;
    const session = container.connectionManager.getOperationRevision();
    container.useCases.sendRemoteCommand.execute({ type: 'select' }).then(
      () => {
        if (
          !mounted.current ||
          revision !== inputRevision.current ||
          session !== container.connectionManager.getOperationRevision()
        )
          return;
        owner.current = 'suspended';
        resumeSoon();
      },
      () => fail(revision, session),
    );
  };
  const touchChanged = (active: boolean) => {
    if (!active && !touchActive.current) return;
    if (active) {
      suspend();
      owner.current = 'touchpad';
      touchSession.current = container.connectionManager.getOperationRevision();
      touchValid.current = canUse();
      setBlocked(false);
      setFailed(false);
    }
    touchActive.current = active;
    latest.current.onActiveChange?.(active);
    if (!active) {
      owner.current = 'suspended';
      resumeSoon();
    }
  };
  return {
    connected,
    supported,
    motion,
    failed,
    touchChanged,
    cancelTouch: () => {
      touchValid.current = false;
    },
    selectPressIn: () => {
      if (!canUse() || touchActive.current) return;
      suspend();
      selectPressed.current = true;
      selectPressRevision.current = inputRevision.current;
      owner.current = 'selection';
    },
    selectPressOut: () => {
      if (!selectPressed.current) return;
      selectPressed.current = false;
      if (
        selectPressRevision.current !== inputRevision.current ||
        owner.current !== 'selection'
      )
        return;
      owner.current = 'suspended';
      resumeSoon();
    },
    move: (deltaX: number, deltaY: number) => {
      if (!currentTouch() || !touchActive.current) return;
      const revision = inputRevision.current;
      const session = container.connectionManager.getOperationRevision();
      container.useCases.sendRemoteCommand
        .execute({
          type: 'movePointer',
          deltaX,
          deltaY,
          isCurrent: () =>
            currentTouch() &&
            touchActive.current &&
            owner.current === 'touchpad' &&
            revision === inputRevision.current,
        })
        .catch(() => fail(revision, session));
    },
    tap: () => {
      if (currentTouch()) {
        touchValid.current = false;
        select();
      }
    },
    select: () => {
      if (!touchActive.current) {
        setBlocked(false);
        select();
      }
    },
    recenter: () => {
      suspend();
      motion.recenter();
      resumeSoon();
    },
  };
}
