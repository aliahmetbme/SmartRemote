import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useContainer } from '../context/ContainerContext';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { tvActions } from '../../store/slices/tvSlice';
import {
  isValidMacAddress,
  canonicalizeMacAddress,
} from '../../domain/utils/macValidator';
import type { WakeStage } from '../../application/usecases/WakeTVUseCase';

export interface WakeFeedback {
  title: string;
  message: string;
}
/** Owns only UI work. Device/session/wake coordination remains in the existing use cases. */
export function useTVWakeSetup(deviceId: string | undefined, isFocused = true) {
  const container = useContainer();
  const dispatch = useAppDispatch();
  const selectedId = useAppSelector(state => state.tv.selectedDeviceId);
  const device = useAppSelector(
    state =>
      state.tv.savedDevices.find(tv => tv.id === deviceId) ??
      state.tv.discoveredDevices.find(tv => tv.id === deviceId),
  );
  const status = useAppSelector(state => state.connection.status);
  const [invalidated, setInvalidated] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<WakeFeedback | null>(null);
  const mounted = useRef(true);
  const foreground = useRef(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  const focus = useRef(isFocused);
  focus.current = isFocused;
  const contextValid = useRef(Boolean(deviceId) && selectedId === deviceId);
  const saveBusy = useRef(false);
  const testBusy = useRef(false);
  const uiRevision = useRef(0);
  const abort = useRef<{ aborted: boolean } | null>(null);
  const current = useCallback(
    () =>
      mounted.current &&
      focus.current &&
      foreground.current &&
      contextValid.current &&
      Boolean(deviceId) &&
      container.store.getState().tv.selectedDeviceId === deviceId,
    [container.store, deviceId],
  );
  const invalidateOperation = useCallback(() => {
    ++uiRevision.current;
    if (abort.current) abort.current.aborted = true;
  }, []);
  useEffect(() => {
    mounted.current = true;
    const checkSelection = () => {
      if (container.store.getState().tv.selectedDeviceId !== deviceId) {
        contextValid.current = false;
        invalidateOperation();
        setInvalidated(true);
      }
    };
    checkSelection();
    const unsubscribe = container.store.subscribe(checkSelection);
    const subscription = AppState.addEventListener('change', state => {
      foreground.current = state === 'active';
      if (state !== 'active') {
        invalidateOperation();
        setFeedback(null);
      }
    });
    let available = true;
    container.wakeService.isSupported().then(
      value => {
        if (available) setSupported(value);
      },
      () => {
        if (available) setSupported(null);
      },
    );
    return () => {
      mounted.current = false;
      available = false;
      invalidateOperation();
      unsubscribe();
      subscription.remove();
    };
  }, [container.store, container.wakeService, deviceId, invalidateOperation]);
  useEffect(() => {
    if (!isFocused) {
      invalidateOperation();
    }
  }, [isFocused, invalidateOperation]);
  const valid =
    Boolean(device) && selectedId === deviceId && !invalidated && isFocused;
  const configured = isValidMacAddress(device?.macAddress);
  const dirty =
    isValidMacAddress(input) && configured
      ? canonicalizeMacAddress(input) !==
        canonicalizeMacAddress(device!.macAddress!)
      : input.trim() !== (device?.macAddress ?? '');
  const save = async () => {
    if (!device || !current() || saveBusy.current || testBusy.current || !dirty)
      return;
    const value = input.trim();
    if (!isValidMacAddress(value)) {
      setError('Enter a valid MAC address, such as AA:BB:CC:DD:EE:FF.');
      return;
    }
    saveBusy.current = true;
    setSaving(true);
    setError(null);
    const revision = uiRevision.current;
    try {
      const updated = await container.useCases.updateTVMac.execute(
        device.id,
        value,
      );
      // A completed save remains attached to its original TV, never the new selection.
      if (
        container.store
          .getState()
          .tv.savedDevices.some(tv => tv.id === updated.id)
      )
        dispatch(tvActions.deviceSaved(updated));
      if (current() && revision === uiRevision.current) {
        setEditing(false);
        setFeedback({
          title: 'Network address saved',
          message:
            'Wake configuration saved. Your TV settings and network still determine whether it can wake.',
        });
      }
    } catch (cause) {
      if (current() && revision === uiRevision.current)
        setError(
          (cause as { code?: unknown })?.code === 'not_found'
            ? 'Connect to and save this TV before setting up wake.'
            : 'Could not save the network address. Please try again.',
        );
    } finally {
      saveBusy.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const test = async () => {
    if (
      !device ||
      !current() ||
      !configured ||
      supported !== true ||
      testBusy.current ||
      saveBusy.current
    )
      return;
    testBusy.current = true;
    setTesting(true);
    setFeedback(null);
    const revision = ++uiRevision.current;
    const signal = { aborted: false };
    abort.current = signal;
    const isCurrent = () =>
      current() && revision === uiRevision.current && !signal.aborted;
    const onProgress = (stage: WakeStage) => {
      if (!isCurrent()) return;
      if (stage === 'sending')
        setFeedback({
          title: 'Sending wake request…',
          message: 'Keep SmartRemote open while the test runs.',
        });
      if (stage === 'waiting' || stage === 'connecting')
        setFeedback({
          title: 'Wake request sent',
          message: 'Waiting for your TV to reconnect…',
        });
    };
    try {
      const result = await container.useCases.wakeTV.execute(device, {
        wakeTimeoutMs: 15000,
        probeIntervalMs: 1500,
        abortSignal: signal,
        onProgress,
      });
      if (!isCurrent()) return;
      if (result.success && result.restored)
        setFeedback({
          title: 'TV reconnected',
          message:
            'Your TV responded and SmartRemote reconnected. This does not by itself verify waking from standby.',
        });
      else if (result.packetsSent > 0)
        setFeedback({
          title: 'Wake request sent',
          message:
            'Your TV did not reconnect during this test. Check whether it turned on, then review the TV settings below.',
        });
      else
        setFeedback({
          title: 'Wake test did not complete',
          message:
            'No wake request was confirmed. Check your local network and try again.',
        });
    } catch (cause) {
      if (isCurrent())
        setFeedback({
          title: 'Wake test did not complete',
          message:
            (cause as { code?: unknown })?.code === 'unsupported_platform'
              ? 'Wake requests are unavailable in this app right now.'
              : 'Check your local network and TV settings, then try again.',
        });
    } finally {
      testBusy.current = false;
      if (abort.current === signal) abort.current = null;
      if (mounted.current) setTesting(false);
    }
  };
  return {
    device,
    status,
    valid,
    configured,
    supported,
    editing,
    input,
    error,
    saving,
    testing,
    feedback,
    dirty,
    beginEdit: () => {
      if (current() && !testBusy.current) {
        setInput(device?.macAddress ?? '');
        setError(null);
        setEditing(true);
        setFeedback(null);
      }
    },
    changeInput: (value: string) => {
      setInput(value);
      setError(null);
    },
    cancelEdit: () => {
      setInput(device?.macAddress ?? '');
      setError(null);
      setEditing(false);
    },
    save,
    test,
    cancelTest: () => {
      if (abort.current) {
        abort.current.aborted = true;
        setFeedback({
          title: 'Test cancelled',
          message:
            'A wake request may already have been sent. No new attempt will start while this one is finishing.',
        });
      }
    },
  };
}
