import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAppSelector } from '../../store/hooks';
import { selectCapabilities, selectConnectionStatus } from '../../store/selectors';
import { TVConnectionState } from '../../domain/enums/TVConnectionState';
import { useContainer } from '../context/ContainerContext';
import {
  MotionPointerController,
  MotionDiagnosticData,
} from '../controllers/MotionPointerController';

export interface UseMotionPointerOptions {
  onActiveChange?: (active: boolean) => void;
}

export interface UseMotionPointerResult {
  isConnected: boolean;
  isPointerSupported: boolean;
  isSensorAvailable: boolean | null;
  isAiming: boolean;
  sensitivity: number;
  setSensitivity: (value: number) => void;
  invertX: boolean;
  setInvertX: (value: boolean) => void;
  invertY: boolean;
  setInvertY: (value: boolean) => void;
  isDiagMode: boolean;
  setIsDiagMode: (value: boolean) => void;
  diagData: MotionDiagnosticData | null;
  setEngaged: (engaged: boolean) => void;
  recenter: () => void;
}

/**
 * Focused hook separating MotionPointerController lifecycle, sensor management,
 * AppState transitions, and aiming engagement from UI rendering.
 */
export function useMotionPointer(options: UseMotionPointerOptions = {}): UseMotionPointerResult {
  const { onActiveChange } = options;
  const container = useContainer();

  const capabilities = useAppSelector(selectCapabilities);
  const connectionStatus = useAppSelector(selectConnectionStatus);

  const isConnected = connectionStatus === TVConnectionState.Connected;
  const pointerState = capabilities?.pointerControl ?? 'unknown';
  const isPointerSupported = pointerState !== 'unsupported';

  const [isSensorAvailable, setIsSensorAvailable] = useState<boolean | null>(null);
  const [isAiming, setIsAiming] = useState<boolean>(false);
  const [sensitivity, setSensitivityState] = useState<number>(1.0);
  const [invertX, setInvertXState] = useState<boolean>(false);
  const [invertY, setInvertYState] = useState<boolean>(false);
  const [isDiagMode, setIsDiagModeState] = useState<boolean>(false);
  const [diagData, setDiagData] = useState<MotionDiagnosticData | null>(null);

  const controllerRef = useRef<MotionPointerController | null>(null);
  const isConnectedRef = useRef(isConnected);
  isConnectedRef.current = isConnected;

  const isPointerSupportedRef = useRef(isPointerSupported);
  isPointerSupportedRef.current = isPointerSupported;

  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  // 1. Stable MotionPointerController lifecycle: created once per sensor service
  useEffect(() => {
    let isMounted = true;

    const controller = new MotionPointerController(
      container.motionSensorService,
      async (deltaX, deltaY) => {
        if (!isConnectedRef.current || !isPointerSupportedRef.current) return;
        try {
          await container.useCases.sendRemoteCommand.execute({
            type: 'movePointer',
            deltaX,
            deltaY,
          });
        } catch {
          // Non-fatal pointer frame drop
        }
      },
      {
        sensitivity,
        invertX,
        invertY,
        diagnosticMode: isDiagMode,
        onDiagnosticSample: sample => {
          if (isMounted) {
            setDiagData(sample);
          }
        },
      },
    );

    controllerRef.current = controller;

    controller.start().then(available => {
      if (isMounted) {
        setIsSensorAvailable(available);
      }
    }).catch(() => {
      if (isMounted) {
        setIsSensorAvailable(false);
      }
    });

    return () => {
      isMounted = false;
      controller.stop().catch(() => undefined);
      controllerRef.current = null;
    };
    // Re-create controller only if sensor service changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container.motionSensorService]);

  // 2. Dynamically apply settings without destroying controller
  const setSensitivity = useCallback((value: number) => {
    setSensitivityState(value);
    controllerRef.current?.setSensitivity(value);
  }, []);

  const setInvertX = useCallback((value: boolean) => {
    setInvertXState(value);
    controllerRef.current?.setInvertX(value);
  }, []);

  const setInvertY = useCallback((value: boolean) => {
    setInvertYState(value);
    controllerRef.current?.setInvertY(value);
  }, []);

  const setIsDiagMode = useCallback((value: boolean) => {
    setIsDiagModeState(value);
    controllerRef.current?.setDiagnosticMode(value);
  }, []);

  const setEngaged = useCallback((engaged: boolean) => {
    // If not connected or pointer unsupported, disallow aiming
    if (engaged && (!isConnectedRef.current || !isPointerSupportedRef.current)) {
      setIsAiming(false);
      controllerRef.current?.setEngaged(false);
      onActiveChangeRef.current?.(false);
      return;
    }

    setIsAiming(engaged);
    controllerRef.current?.setEngaged(engaged);
    onActiveChangeRef.current?.(engaged);
  }, []);

  const recenter = useCallback(() => {
    controllerRef.current?.recenter();
  }, []);

  // 3. If connection drops while aiming, disengage immediately
  useEffect(() => {
    if ((!isConnected || !isPointerSupported) && isAiming) {
      setEngaged(false);
    }
  }, [isConnected, isPointerSupported, isAiming, setEngaged]);

  // 4. Handle AppState backgrounding
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState !== 'active') {
        setIsAiming(false);
        controllerRef.current?.setEngaged(false);
        onActiveChangeRef.current?.(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // 5. Clean up parent scroll lock on unmount
  useEffect(() => {
    return () => {
      onActiveChangeRef.current?.(false);
    };
  }, []);

  return {
    isConnected,
    isPointerSupported,
    isSensorAvailable,
    isAiming,
    sensitivity,
    setSensitivity,
    invertX,
    setInvertX,
    invertY,
    setInvertY,
    isDiagMode,
    setIsDiagMode,
    diagData,
    setEngaged,
    recenter,
  };
}
