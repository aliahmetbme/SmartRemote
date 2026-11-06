import { useState, useRef, useLayoutEffect, useCallback } from 'react';
import { ChannelSelectionResult } from '../../domain/interfaces/IChannelSelectionAdapter';

type CommandGuard = () => boolean;
export type ChannelEntryStatus = 'editing' | 'sending' | 'interrupted' | ChannelSelectionResult;
const MAX_CHANNEL_DIGITS = 4;

export interface UseNumericKeypadBufferOptions {
  onSelectChannel: (number: string, isCurrent: CommandGuard) => Promise<ChannelSelectionResult>;
  isAvailable?: boolean;
  isConnected?: boolean;
  bufferTimeoutMs?: number;
  targetDeviceId?: string | null;
  subscribeToSession?: (invalidate: () => void) => () => void;
}

export function useNumericKeypadBuffer({
  onSelectChannel, isAvailable = true, isConnected = true,
  bufferTimeoutMs = 3500, targetDeviceId, subscribeToSession,
}: UseNumericKeypadBufferOptions) {
  const draft = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revision = useRef(0);
  const submitting = useRef(false);
  const pending = useRef<{ number: string; id: number; send: typeof onSelectChannel } | null>(null);
  const mounted = useRef(false);
  const [channelBuffer, setChannelBuffer] = useState('');
  const [status, setStatus] = useState<ChannelEntryStatus>('editing');
  const [busy, setBusy] = useState(false);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const reset = useCallback((nextStatus: ChannelEntryStatus = 'editing') => {
    revision.current++;
    pending.current = null;
    clearTimer();
    draft.current = '';
    if (mounted.current) {
      setChannelBuffer('');
      setStatus(nextStatus);
    }
  }, [clearTimer]);

  useLayoutEffect(() => {
    mounted.current = true;
    reset();
    const unsubscribe = subscribeToSession?.(reset);
    return () => {
      mounted.current = false;
      unsubscribe?.();
      reset();
    };
  }, [reset, targetDeviceId, isConnected, isAvailable, subscribeToSession]);

  const edit = (value: string) => {
    clearTimer();
    draft.current = value;
    setChannelBuffer(value);
    if (value) timer.current = setTimeout(() => {
      draft.current = '';
      setChannelBuffer('');
    }, bufferTimeoutMs);
  };

  const handleDigit = (digit: number) => {
    if (!isConnected || !isAvailable || !Number.isInteger(digit) ||
        digit < 0 || digit > 9 || draft.current.length >= MAX_CHANNEL_DIGITS) return;
    edit(draft.current + digit);
  };

  const handleBackspace = () => {
    if (!isConnected || !isAvailable) return;
    if (draft.current) edit(draft.current.slice(0, -1));
  };

  const handleOk = async () => {
    if (!isConnected || !isAvailable || !draft.current) return;
    pending.current = { number: draft.current, id: ++revision.current, send: onSelectChannel };
    edit('');
    setStatus('sending');
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      while (pending.current) {
        const { number, id, send } = pending.current;
        pending.current = null;
        const isCurrent = () => mounted.current && revision.current === id;
        const deadline = setTimeout(() => {
          if (isCurrent()) {
            revision.current++;
            setStatus('interrupted');
          }
        }, bufferTimeoutMs);
        try {
          const result = await send(number, isCurrent);
          if (isCurrent()) {
            if (__DEV__) console.debug('[SmartRemote][NumericKeypad]', result);
            setStatus(result);
          }
        } catch {
          if (isCurrent()) {
            if (__DEV__) console.warn('[SmartRemote][NumericKeypad] Channel submission interrupted');
            setStatus('interrupted');
          }
        } finally {
          clearTimeout(deadline);
        }
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return { channelBuffer, status, busy, handleDigit, handleBackspace, handleOk };
}
