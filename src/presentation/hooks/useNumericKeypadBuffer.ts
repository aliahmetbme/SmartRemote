import { useState, useRef, useEffect, useCallback } from 'react';
import { RemoteKey } from '../../domain/enums/RemoteKey';

export interface UseNumericKeypadBufferOptions {
  onSendDigit: (digit: number) => Promise<void>;
  onSendKey: (key: RemoteKey) => Promise<void>;
  isAvailable?: boolean;
  isConnected?: boolean;
  bufferTimeoutMs?: number;
}

export interface UseNumericKeypadBufferResult {
  channelBuffer: string;
  handleDigit: (digit: number) => void;
  handleBackspace: () => void;
  handleOk: () => void;
}

/**
 * Custom hook isolating numeric channel buffering, timeout clearing,
 * and FIFO sequential promise queuing from UI rendering.
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
  } = options;

  const [channelBuffer, setChannelBuffer] = useState<string>('');
  const bufferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FIFO sequential promise queue to preserve digit ordering during rapid taps
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const onSendDigitRef = useRef(onSendDigit);
  onSendDigitRef.current = onSendDigit;

  const onSendKeyRef = useRef(onSendKey);
  onSendKeyRef.current = onSendKey;

  const isAvailableRef = useRef(isAvailable);
  isAvailableRef.current = isAvailable;

  const isConnectedRef = useRef(isConnected);
  isConnectedRef.current = isConnected;

  const enqueue = useCallback((commandFn: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(
      () => commandFn(),
      () => commandFn(), // continue queue execution even if a prior command failed
    );
    return queueRef.current;
  }, []);

  // Clean up buffer timer on unmount
  useEffect(() => {
    return () => {
      if (bufferTimeoutRef.current) {
        clearTimeout(bufferTimeoutRef.current);
      }
    };
  }, []);

  const handleDigit = useCallback(
    (digit: number) => {
      if (!isAvailableRef.current) return;

      if (bufferTimeoutRef.current) {
        clearTimeout(bufferTimeoutRef.current);
      }
      bufferTimeoutRef.current = setTimeout(() => {
        setChannelBuffer('');
      }, bufferTimeoutMs);

      setChannelBuffer(prev => (prev.length >= 4 ? String(digit) : prev + digit));

      enqueue(async () => {
        try {
          await onSendDigitRef.current(digit);
        } catch {
          // Non-fatal command failure
        }
      });
    },
    [bufferTimeoutMs, enqueue],
  );

  const handleOk = useCallback(() => {
    if (!isConnectedRef.current) return;

    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
    }
    setChannelBuffer('');

    enqueue(async () => {
      try {
        await onSendKeyRef.current(RemoteKey.Ok);
      } catch {
        // Non-fatal command failure
      }
    });
  }, [enqueue]);

  const handleBackspace = useCallback(() => {
    if (!isConnectedRef.current) return;

    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
    }

    setChannelBuffer(prev => {
      if (prev.length <= 1) {
        // Buffer now empty or was already empty: send BACK to dismiss TV channel banner
        enqueue(async () => {
          try {
            await onSendKeyRef.current(RemoteKey.Back);
          } catch {
            // Non-fatal command failure
          }
        });
        return '';
      }

      // Buffer had 2+ digits (e.g. "12"): pop last digit ("1")
      const remaining = prev.slice(0, -1);

      // Dismiss TV's current multi-digit prompt and resend remaining digits
      enqueue(async () => {
        try {
          await onSendKeyRef.current(RemoteKey.Back);
          for (const char of remaining) {
            const d = parseInt(char, 10);
            await onSendDigitRef.current(d);
          }
        } catch {
          // Non-fatal command failure
        }
      });

      bufferTimeoutRef.current = setTimeout(() => {
        setChannelBuffer('');
      }, bufferTimeoutMs);

      return remaining;
    });
  }, [bufferTimeoutMs, enqueue]);

  return {
    channelBuffer,
    handleDigit,
    handleBackspace,
    handleOk,
  };
}
