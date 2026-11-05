import { useState, useRef, useEffect, useCallback } from 'react';
import { RemoteKey } from '../../domain/enums/RemoteKey';

export interface UseNumericKeypadBufferOptions {
  onSendDigit: (digit: number) => Promise<void>;
  onSendKey: (key: RemoteKey) => Promise<void>;
  isAvailable?: boolean;
  isConnected?: boolean;
  bufferTimeoutMs?: number;
  targetDeviceId?: string | null;
}

export interface UseNumericKeypadBufferResult {
  channelBuffer: string;
  handleDigit: (digit: number) => void;
  handleBackspace: () => void;
  handleOk: () => void;
  /** Exposed for testing and verification of the internal FIFO queue */
  flushQueue?: () => Promise<void>;
}

/**
 * Custom hook isolating numeric channel buffering, timeout clearing,
 * and FIFO sequential promise queuing from UI rendering.
 *
 * Guarantees:
 * - State updaters are 100% pure (zero side-effects inside setState).
 * - Immediate synchronous logical buffer tracking via useRef prevents stale reads on rapid taps.
 * - Sequential FIFO promise queue prevents race conditions and handles failures gracefully without poison.
 * - Generation-based invalidation prevents stale operations across TV device switches or unmount.
 */
export function useNumericKeypadBuffer(
  options: UseNumericKeypadBufferOptions,
): UseNumericKeypadBufferResult {
  const {
    onSendDigit,
    onSendKey,
    isAvailable = true,
    isConnected = true,
    bufferTimeoutMs = 3500,
    targetDeviceId,
  } = options;

  // Authoritative synchronous logical buffer for immediate event handler reads
  const bufferRef = useRef<string>('');

  // React state for rendering UI
  const [channelBuffer, setChannelBuffer] = useState<string>('');

  const bufferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FIFO sequential promise queue to preserve command ordering during rapid taps
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  // Generation counter to invalidate pending asynchronous tasks on device switch or unmount
  const generationRef = useRef<number>(0);

  const isMountedRef = useRef<boolean>(true);

  const onSendDigitRef = useRef(onSendDigit);
  onSendDigitRef.current = onSendDigit;

  const onSendKeyRef = useRef(onSendKey);
  onSendKeyRef.current = onSendKey;

  const isAvailableRef = useRef(isAvailable);
  isAvailableRef.current = isAvailable;

  const isConnectedRef = useRef(isConnected);
  isConnectedRef.current = isConnected;

  const clearTimer = useCallback(() => {
    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
      bufferTimeoutRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    bufferTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      bufferRef.current = '';
      setChannelBuffer('');
    }, bufferTimeoutMs);
  }, [bufferTimeoutMs, clearTimer]);

  const enqueue = useCallback((commandFn: () => Promise<void>) => {
    // Chain sequentially, ensuring prior rejections never break the queue
    queueRef.current = queueRef.current
      .catch(() => {})
      .then(async () => {
        try {
          await commandFn();
        } catch {
          // Non-fatal command failure, queue remains healthy
        }
      });
    return queueRef.current;
  }, []);

  // Invalidate pending queue tasks and reset buffer on TV device change
  const lastTargetDeviceIdRef = useRef<string | null | undefined>(targetDeviceId);
  useEffect(() => {
    if (
      lastTargetDeviceIdRef.current !== undefined &&
      lastTargetDeviceIdRef.current !== targetDeviceId
    ) {
      generationRef.current += 1;
      clearTimer();
      bufferRef.current = '';
      setChannelBuffer('');
      queueRef.current = Promise.resolve();
    }
    lastTargetDeviceIdRef.current = targetDeviceId;
  }, [clearTimer, targetDeviceId]);

  // Invalidate pending tasks and reset buffer if connection drops
  const prevConnectedRef = useRef<boolean>(isConnected);
  useEffect(() => {
    if (prevConnectedRef.current && !isConnected) {
      generationRef.current += 1;
      clearTimer();
      bufferRef.current = '';
      setChannelBuffer('');
      queueRef.current = Promise.resolve();
    }
    prevConnectedRef.current = isConnected;
  }, [clearTimer, isConnected]);

  // Lifecycle mount / unmount cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      generationRef.current += 1;
      clearTimer();
    };
  }, [clearTimer]);

  const handleDigit = useCallback(
    (digit: number) => {
      if (!isAvailableRef.current || !isConnectedRef.current) return;

      startTimer();

      // Synchronous logical buffer update
      const prev = bufferRef.current;
      const next = prev.length >= 4 ? String(digit) : prev + digit;
      bufferRef.current = next;

      // Pure state update (no side effects)
      setChannelBuffer(next);

      const gen = generationRef.current;
      enqueue(async () => {
        if (gen !== generationRef.current || !isMountedRef.current) return;
        try {
          await onSendDigitRef.current(digit);
        } catch {
          // Handled non-fatal command failure
        }
      });
    },
    [enqueue, startTimer],
  );

  const handleBackspace = useCallback(() => {
    if (!isConnectedRef.current) return;

    clearTimer();

    const current = bufferRef.current;
    const gen = generationRef.current;

    if (current.length <= 1) {
      // Buffer was empty or had 1 digit: buffer becomes empty, send BACK to dismiss TV banner
      bufferRef.current = '';
      setChannelBuffer('');

      enqueue(async () => {
        if (gen !== generationRef.current || !isMountedRef.current) return;
        try {
          await onSendKeyRef.current(RemoteKey.Back);
        } catch {
          // Handled non-fatal command failure
        }
      });
    } else {
      // Buffer had 2+ digits (e.g. "12"): pop last digit ("1")
      const remaining = current.slice(0, -1);
      bufferRef.current = remaining;
      setChannelBuffer(remaining);

      // Restart inactivity timer for remaining buffer
      startTimer();

      // Dismiss TV's current multi-digit prompt and resend remaining digits
      enqueue(async () => {
        if (gen !== generationRef.current || !isMountedRef.current) return;
        try {
          await onSendKeyRef.current(RemoteKey.Back);
          for (const char of remaining) {
            if (gen !== generationRef.current || !isMountedRef.current) return;
            const d = parseInt(char, 10);
            await onSendDigitRef.current(d);
          }
        } catch {
          // Handled non-fatal command failure
        }
      });
    }
  }, [clearTimer, enqueue, startTimer]);

  const handleOk = useCallback(() => {
    if (!isConnectedRef.current) return;

    clearTimer();
    bufferRef.current = '';
    setChannelBuffer('');

    const gen = generationRef.current;
    enqueue(async () => {
      if (gen !== generationRef.current || !isMountedRef.current) return;
      try {
        await onSendKeyRef.current(RemoteKey.Ok);
      } catch {
        // Handled non-fatal command failure
      }
    });
  }, [clearTimer, enqueue]);

  return {
    channelBuffer,
    handleDigit,
    handleBackspace,
    handleOk,
    flushQueue: () => queueRef.current,
  };
}
